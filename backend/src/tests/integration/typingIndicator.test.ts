/**
 * C-07: "escribiendo…" y marcar leído.
 *
 * Payload verificado contra la doc oficial (2026-09-11):
 * developers.facebook.com/docs/whatsapp/cloud-api/typing-indicators
 * No se probó contra un número real: Meta sigue sin conectar (A-01).
 */
import { BotController } from '@/app/controllers/BotController';
import type { BotFlowRepository, MetaCredentialsRepository, NotificationPort } from '@/domain/ports';
import { FakeClock, InMemorySessionRepository, SequentialIdGenerator, noopAudit } from '@/domain/conversation/simulation/fakes';
import { BusinessHoursService } from '@/domain/services/BusinessHoursService';
import { SimulateConversationUseCase } from '@/domain/use-cases/SimulateConversationUseCase';
import { MetaWhatsAppAdapter } from '@/infrastructure/adapters/MetaWhatsAppAdapter';
import { buildTypingPayload } from '@/infrastructure/adapters/meta/metaPayloads';
import {
  HARNESS_CUSTOMER_PHONE,
  HARNESS_TENANT_ID,
  loadMold,
  makeInterpreter,
  makeTenantConfig,
  makeTenantConfigPort,
  silentLogger,
} from '../utils/conversationHarness';

describe('payload de "escribiendo…"', () => {
  it('es el de la doc de Meta: estado leído + indicador, sin `to` ni `type`', () => {
    expect(buildTypingPayload('wamid.ABC')).toEqual({
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: 'wamid.ABC',
      typing_indicator: { type: 'text' },
    });
  });
});

describe('MetaWhatsAppAdapter.sendTypingIndicator', () => {
  const creds = { tenantId: HARNESS_TENANT_ID, phoneNumberId: 'PNID', wabaId: 'W', displayPhoneNumber: '5217470000000', accessToken: 'token', isActive: true };

  afterEach(() => jest.restoreAllMocks());

  it('hace POST a /{phone-number-id}/messages con el payload y el token', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));
    const adapter = new MetaWhatsAppAdapter(silentLogger, { findByTenantId: async () => creds } as unknown as MetaCredentialsRepository);

    await adapter.sendTypingIndicator(HARNESS_TENANT_ID, HARNESS_CUSTOMER_PHONE, 'wamid.ABC');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://graph.facebook.com/v23.0/PNID/messages');
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer token');
    expect(JSON.parse(String(init?.body))).toEqual(buildTypingPayload('wamid.ABC'));
  });

  it('sin credenciales no manda nada', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    const adapter = new MetaWhatsAppAdapter(silentLogger, { findByTenantId: async () => null } as unknown as MetaCredentialsRepository);

    await adapter.sendTypingIndicator(HARNESS_TENANT_ID, HARNESS_CUSTOMER_PHONE, 'wamid.ABC');

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('el motor muestra "escribiendo…"', () => {
  /** Un NotificationPort que anota cada llamada, en orden; `fail` hace que una falle. */
  function recorder(fail?: string) {
    const calls: Array<[string, unknown[]]> = [];
    const port = new Proxy({}, {
      get: (_t, name: string) => async (...args: unknown[]) => {
        calls.push([name, args]);
        if (name === fail) throw new Error(`${name} falló`);
      },
    }) as NotificationPort;
    return { calls, port };
  }

  function bot(port: NotificationPort, opts: { at?: string; hours?: Parameters<typeof makeTenantConfig>[0]; mold?: 'cerrajeria' | 'papeleria' } = {}) {
    const clock = new FakeClock(new Date(opts.at ?? '2026-09-10T11:00:00-06:00'));
    const flow = loadMold(opts.mold ?? 'cerrajeria');
    return new BotController(
      new InMemorySessionRepository(clock),
      port,
      makeTenantConfigPort(makeTenantConfig(opts.hours)),
      { findActiveByTenant: async () => flow } as unknown as BotFlowRepository,
      makeInterpreter(),
      noopAudit,
      new BusinessHoursService(),
      silentLogger,
      { clock, ids: new SequentialIdGenerator() },
    );
  }

  it('antes de contestar, sobre el mensaje que llegó', async () => {
    const { calls, port } = recorder();

    await bot(port).processMessage(HARNESS_TENANT_ID, HARNESS_CUSTOMER_PHONE, 'hola', 'wamid.IN1');

    expect(calls.map(([name]) => name)).toEqual(['sendTypingIndicator', 'sendButtons']);
    expect(calls[0][1]).toEqual([HARNESS_TENANT_ID, HARNESS_CUSTOMER_PHONE, 'wamid.IN1']);
  });

  it('no si no hay id del mensaje, ni si un gate decide el turno (baja, cerrado)', async () => {
    const noId = recorder();
    await bot(noId.port).processMessage(HARNESS_TENANT_ID, HARNESS_CUSTOMER_PHONE, 'hola');

    const optOut = recorder();
    await bot(optOut.port).processMessage(HARNESS_TENANT_ID, HARNESS_CUSTOMER_PHONE, 'baja', 'wamid.IN2');

    const closed = recorder();
    await bot(closed.port, { mold: 'papeleria', at: '2026-09-10T22:00:00-06:00', hours: { horarioSemana: '09:00-18:00' } })
      .processMessage(HARNESS_TENANT_ID, HARNESS_CUSTOMER_PHONE, 'hola', 'wamid.IN3');

    for (const { calls } of [noId, optOut, closed]) {
      expect(calls.map(([name]) => name)).not.toContain('sendTypingIndicator');
      expect(calls.length).toBeGreaterThan(0);
    }
  });

  it('si falla, el cliente igual recibe su respuesta', async () => {
    const { calls, port } = recorder('sendTypingIndicator');

    const last = await bot(port).processMessage(HARNESS_TENANT_ID, HARNESS_CUSTOMER_PHONE, 'hola', 'wamid.IN4');

    expect(calls.map(([name]) => name)).toEqual(['sendTypingIndicator', 'sendButtons']);
    expect(last).not.toBeNull();
  });

  it('el simulador lo registra en el "Por qué", sin mandar nada', async () => {
    const useCase = new SimulateConversationUseCase(makeTenantConfigPort(makeTenantConfig()), makeInterpreter(), new BusinessHoursService(), 48 * 3600_000, silentLogger);

    const [turn] = await useCase.execute({
      tenantId: HARNESS_TENANT_ID,
      flow: loadMold('cerrajeria'),
      from: HARNESS_CUSTOMER_PHONE,
      startAt: new Date('2026-09-10T11:00:00-06:00'),
      steps: [{ kind: 'inbound', content: 'hola', messageId: 'wamid.SIM1' }],
    });

    expect(turn.trace).toContainEqual({ kind: 'typing', messageId: 'wamid.SIM1' });
    expect(turn.why).toContain('Se marca el mensaje como leído y el cliente ve "escribiendo…" mientras el bot arma la respuesta.');
    expect(turn.outbound).toHaveLength(1);
  });
});
