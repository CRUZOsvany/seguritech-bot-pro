/**
 * ========================================
 * Multi-Tenant Isolation Test Suite
 * ========================================
 *
 * Propósito: validar que el aislamiento multi-tenant funciona correctamente
 * en la ruta real end-to-end (webhook → BotController → FlowInterpreter →
 * UserRepository), tal como lo verían dos negocios distintos compartiendo
 * el mismo backend.
 *
 * Reescrita 2026-08-20 (auditoría de seguridad) sobre la infraestructura
 * actual: la suite original quedó `describe.skip` desde Sprint 1 porque
 * dependía de un repo de testing legacy y de `HandleMessageUseCase`
 * (eliminado por ADR-012). Ahora usa:
 *   - InMemoryUserRepository real (backend/src/tests/utils).
 *   - Un BotFlowRepository y TenantConfigPort fake, uno por tenant, para
 *     probar que ni el flow ni la configuración se filtran entre tenants.
 *   - ApplicationContainer + ExpressServer reales (FlowInterpreter incluido).
 *
 * Escenario: mismo número de teléfono usado contra dos tenants distintos
 * (papelería / ferretería). Deben quedar 100% aislados: usuarios distintos,
 * progresión de estado independiente, contenido de respuesta específico de
 * cada tenant (nombre del negocio interpolado desde su propio TenantConfig).
 */

import request from 'supertest';
import { Express } from 'express';
import pino from 'pino';
import { ExpressServer } from '@/infrastructure/server/ExpressServer';
import { ApplicationContainer } from '@/app/ApplicationContainer';
import { InMemoryUserRepository } from '@/tests/utils/InMemoryUserRepository';
import { BotTone } from '@/domain/entities';
import type { TenantConfig } from '@/domain/entities';
import type { TenantConfigPort, NotificationPort, AuditPort } from '@/domain/ports';
import type { BotFlowRepository } from '@/domain/ports/BotFlowRepository';
import type { BotFlow } from '@/domain/entities/flow';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { TenantRepository } from '@/domain/ports/TenantRepository';
import type { PosProductRepository } from '@/domain/ports/pos/PosProductRepository';

const logger = pino({ level: 'silent' });

/** Un flow mínimo: saluda, y con "1" pasa a "viendo productos". */
function makeFlow(): BotFlow {
  return {
    version: '1.0',
    start_node_id: 'welcome',
    nodes: [
      {
        id: 'welcome',
        type: 'wait_input',
        content: { prompt: 'Bienvenido a {{nombre_negocio}}. Escribe 1 para ver productos.' },
        transitions: [
          { condition: { type: 'keyword', values: ['1'] }, next_node_id: 'products' },
          { condition: { type: 'default' }, next_node_id: 'welcome' },
        ],
      },
      {
        id: 'products',
        type: 'wait_input',
        content: { prompt: 'Viendo productos de {{nombre_negocio}}.' },
        transitions: [{ condition: { type: 'default' }, next_node_id: 'products' }],
      },
    ],
  };
}

function makeTenantConfig(nombreNegocio: string): TenantConfig {
  return {
    tenantId: 'unused',
    botName: 'Bot',
    nombreNegocio,
    tone: BotTone.AMIGABLE,
    welcomeMessage: 'Hola',
    menuMessage: 'Menú',
    outOfHoursMessage: 'Fuera de horario',
    notUnderstoodMessage: 'No entendí',
    orderConfirmationMessage: 'Pedido confirmado',
    catalog: [],
    serviceDirectory: [],
    horarioSemana: null,
    horarioSabado: null,
    abreDomingo: false,
  };
}

/** BotFlowRepository fake: un flow (idéntico en estructura) por tenant, en un Map. */
class FakeBotFlowRepository implements Partial<BotFlowRepository> {
  private readonly flows = new Map<string, BotFlow>();

  register(tenantId: string): void {
    this.flows.set(tenantId, makeFlow());
  }

  async findActiveByTenant(tenantId: string): Promise<BotFlow | null> {
    return this.flows.get(tenantId) ?? null;
  }
}

/** TenantConfigPort fake: nombre de negocio propio por tenant. */
class FakeTenantConfigPort implements TenantConfigPort {
  private readonly configs = new Map<string, TenantConfig>();

  register(tenantId: string, nombreNegocio: string): void {
    this.configs.set(tenantId, { ...makeTenantConfig(nombreNegocio), tenantId });
  }

  async getConfig(tenantId: string): Promise<TenantConfig | null> {
    return this.configs.get(tenantId) ?? null;
  }

  invalidate(): void {
    // no-op: sin caché en el fake.
  }
}

/** Captura todo lo que el bot "envía" para poder aserta contenido por tenant. */
class CapturingNotificationPort implements NotificationPort {
  readonly sent: Array<{ tenantId: string; phoneNumber: string; message: string }> = [];

  async sendMessage(tenantId: string, phoneNumber: string, message: string): Promise<void> {
    this.sent.push({ tenantId, phoneNumber, message });
  }
  async sendButtons(tenantId: string, phoneNumber: string, message: string): Promise<void> {
    this.sent.push({ tenantId, phoneNumber, message });
  }
  async sendImage(tenantId: string, phoneNumber: string): Promise<void> {
    this.sent.push({ tenantId, phoneNumber, message: '[image]' });
  }
  async sendList(tenantId: string, phoneNumber: string, message: string): Promise<void> {
    this.sent.push({ tenantId, phoneNumber, message });
  }
  async sendLocation(tenantId: string, phoneNumber: string): Promise<void> {
    this.sent.push({ tenantId, phoneNumber, message: '[location]' });
  }
  async sendDocument(tenantId: string, phoneNumber: string): Promise<void> {
    this.sent.push({ tenantId, phoneNumber, message: '[document]' });
  }
  async sendCtaUrl(tenantId: string, phoneNumber: string, body: string): Promise<void> {
    this.sent.push({ tenantId, phoneNumber, message: body });
  }
  async sendLocationRequest(tenantId: string, phoneNumber: string, body: string): Promise<void> {
    this.sent.push({ tenantId, phoneNumber, message: body });
  }
  async sendMediaCarousel(tenantId: string, phoneNumber: string, body: string): Promise<void> {
    this.sent.push({ tenantId, phoneNumber, message: body });
  }
  async sendReaction(tenantId: string, phoneNumber: string): Promise<void> {
    this.sent.push({ tenantId, phoneNumber, message: '[reaction]' });
  }
  async sendCallPermissionRequest(tenantId: string, phoneNumber: string, body: string): Promise<void> {
    this.sent.push({ tenantId, phoneNumber, message: body });
  }
  async sendWhatsappFlow(tenantId: string, phoneNumber: string, body: string): Promise<void> {
    this.sent.push({ tenantId, phoneNumber, message: body });
  }
}

const auditPort: AuditPort = { log: jest.fn() };

interface Harness {
  app: Express;
  userRepository: InMemoryUserRepository;
  notificationPort: CapturingNotificationPort;
  flowRepository: FakeBotFlowRepository;
  tenantConfigPort: FakeTenantConfigPort;
}

function buildHarness(): Harness {
  const userRepository = new InMemoryUserRepository();
  const notificationPort = new CapturingNotificationPort();
  const flowRepository = new FakeBotFlowRepository();
  const tenantConfigPort = new FakeTenantConfigPort();
  const tenantRepository = {} as unknown as TenantRepository;
  const supabase = {} as unknown as SupabaseClient;
  // Ningún flow de este harness usa search_catalog (§2.1) — stub sin implementar.
  const posProductRepository = {} as unknown as PosProductRepository;

  const container = new ApplicationContainer(
    userRepository,
    notificationPort,
    tenantConfigPort,
    flowRepository as unknown as BotFlowRepository,
    tenantRepository,
    supabase,
    auditPort,
    posProductRepository,
    logger,
  );

  const server = new ExpressServer(logger);
  const botController = container.getBotController();
  server.setupRoutes((tenantId: string, phoneNumber: string, message: string) =>
    botController.processMessage(tenantId, phoneNumber, message),
  );

  return { app: server.getExpressApp(), userRepository, notificationPort, flowRepository, tenantConfigPort };
}

async function sendMessage(app: Express, tenantId: string, phoneNumber: string, message: string) {
  return request(app)
    .post(`/webhook/${tenantId}`)
    .send({ phoneNumber, message })
    .expect(200);
}

describe('🏢 Multi-Tenant Isolation Test Suite (webhook → BotController → FlowInterpreter)', () => {
  const PAPELERIA = 'papeleria_01';
  const FERRETERIA = 'ferreteria_01';

  it('TEST 1: mismo teléfono, tenants diferentes → usuarios y contenido independientes', async () => {
    const { app, userRepository, notificationPort, flowRepository, tenantConfigPort } = buildHarness();
    flowRepository.register(PAPELERIA);
    flowRepository.register(FERRETERIA);
    tenantConfigPort.register(PAPELERIA, 'Papelería El Lápiz');
    tenantConfigPort.register(FERRETERIA, 'Ferretería El Tornillo');

    const phoneNumber = '+527471234567';

    await sendMessage(app, PAPELERIA, phoneNumber, 'hola');
    await sendMessage(app, FERRETERIA, phoneNumber, 'hola');

    const userInPapeleria = await userRepository.findByPhoneNumber(PAPELERIA, phoneNumber);
    const userInFerreteria = await userRepository.findByPhoneNumber(FERRETERIA, phoneNumber);

    expect(userInPapeleria).not.toBeNull();
    expect(userInFerreteria).not.toBeNull();
    // Usuarios independientes, aunque comparten teléfono.
    expect(userInPapeleria!.id).not.toBe(userInFerreteria!.id);
    expect(userInPapeleria!.tenantId).toBe(PAPELERIA);
    expect(userInFerreteria!.tenantId).toBe(FERRETERIA);

    // El contenido enviado a cada uno viene de SU propio TenantConfig — si se
    // filtrara el flow o la config de un tenant al otro, este assert fallaría.
    const lastToPapeleria = notificationPort.sent.filter((s) => s.tenantId === PAPELERIA).at(-1);
    const lastToFerreteria = notificationPort.sent.filter((s) => s.tenantId === FERRETERIA).at(-1);
    expect(lastToPapeleria?.message).toContain('Papelería El Lápiz');
    expect(lastToFerreteria?.message).toContain('Ferretería El Tornillo');
    expect(lastToPapeleria?.message).not.toContain('Ferretería');
    expect(lastToFerreteria?.message).not.toContain('Papelería');
  });

  it('TEST 2: misma conversación, progresión de estado divergente por tenant', async () => {
    const { app, userRepository, flowRepository, tenantConfigPort } = buildHarness();
    flowRepository.register(PAPELERIA);
    flowRepository.register(FERRETERIA);
    tenantConfigPort.register(PAPELERIA, 'Papelería El Lápiz');
    tenantConfigPort.register(FERRETERIA, 'Ferretería El Tornillo');

    const phoneNumber = '+527471234568';

    await sendMessage(app, PAPELERIA, phoneNumber, 'hola');
    await sendMessage(app, FERRETERIA, phoneNumber, 'hola');

    // Solo la papelería avanza (elige "1"); la ferretería se queda en el saludo.
    await sendMessage(app, PAPELERIA, phoneNumber, '1');

    const userInPapeleria = await userRepository.findByPhoneNumber(PAPELERIA, phoneNumber);
    const userInFerreteria = await userRepository.findByPhoneNumber(FERRETERIA, phoneNumber);

    expect(userInPapeleria!.currentNodeId).toBe('products');
    expect(userInFerreteria!.currentNodeId).toBe('welcome');
  });

  it('TEST 3: no hay fuga ni mezcla de datos entre múltiples tenants y usuarios', async () => {
    const { app, userRepository, flowRepository, tenantConfigPort } = buildHarness();
    const TENANT_A = 'tienda_a_001';
    const TENANT_B = 'tienda_b_001';
    flowRepository.register(TENANT_A);
    flowRepository.register(TENANT_B);
    tenantConfigPort.register(TENANT_A, 'Tienda A');
    tenantConfigPort.register(TENANT_B, 'Tienda B');

    const phone1 = '+527471234569';
    const phone2 = '+527471234570';

    for (const [tenant, phone] of [
      [TENANT_A, phone1],
      [TENANT_A, phone2],
      [TENANT_B, phone1],
      [TENANT_B, phone2],
    ] as const) {
      await sendMessage(app, tenant, phone, 'hola');
    }

    const usersA = [
      await userRepository.findByPhoneNumber(TENANT_A, phone1),
      await userRepository.findByPhoneNumber(TENANT_A, phone2),
    ];
    const usersB = [
      await userRepository.findByPhoneNumber(TENANT_B, phone1),
      await userRepository.findByPhoneNumber(TENANT_B, phone2),
    ];

    expect(usersA.every((u) => u !== null)).toBe(true);
    expect(usersB.every((u) => u !== null)).toBe(true);

    // 4 usuarios, todos con ids distintos — ninguna colisión cross-tenant.
    const ids = new Set([...usersA, ...usersB].map((u) => u!.id));
    expect(ids.size).toBe(4);

    // Cada usuario reporta el tenant al que realmente pertenece.
    expect(usersA.every((u) => u!.tenantId === TENANT_A)).toBe(true);
    expect(usersB.every((u) => u!.tenantId === TENANT_B)).toBe(true);

    // Buscar un teléfono de A contra el tenant B (u otro tenant no registrado
    // en absoluto) nunca debe devolver el usuario de A.
    const crossLookup = await userRepository.findByPhoneNumber(TENANT_B, phone1);
    expect(crossLookup!.id).not.toBe(usersA[0]!.id);
    const unknownTenantLookup = await userRepository.findByPhoneNumber('tenant_inexistente', phone1);
    expect(unknownTenantLookup).toBeNull();
  });
});
