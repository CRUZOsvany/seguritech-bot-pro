/**
 * DEC-07 (auditoría 2026-08-26): expiración de sesión conversacional a
 * media captura. Corrección real del owner sobre la propuesta original de
 * la auditoría — implementada tal cual se decidió:
 *
 *   1. El aviso "empezamos de nuevo" NUNCA se manda si el usuario no estaba
 *      a media captura (currentNodeId undefined o 'end') — ahí ya arranca
 *      limpio y en silencio, avisar sería confuso ("¿empezamos de nuevo de
 *      qué?").
 *   2. TTL de 2h, no 6h — una conversación de WhatsApp vive minutos/horas.
 *   3. Un cierre real del negocio entre el último mensaje y el actual
 *      cuenta como frontera de conversación aunque no se cumplan las 2h
 *      (BusinessHoursService.hadClosureBetween).
 *   4. El gate va DESPUÉS del handoff humano (no debe resetear nada si el
 *      dueño está atendiendo manualmente) y limpia currentNodeId/context de
 *      verdad antes de ejecutar el flow, mismo patrón que la palabra de
 *      escape en FlowInterpreter.
 */
import pino from 'pino';
import { BotController } from '@/app/controllers/BotController';
import {
  UserRepository, TenantConfigPort, BotFlowRepository, NotificationPort, AuditPort,
} from '@/domain/ports';
import { FlowInterpreter } from '@/domain/services/FlowInterpreter';
import { BusinessHoursService } from '@/domain/services/BusinessHoursService';
import type { TenantConfig, User, UserState } from '@/domain/entities';
import type { BotFlow } from '@/domain/entities/flow';

const logger = pino({ level: 'silent' });

const TENANT_ID = 'tenant-test';
const USER_PHONE = '521234567890';

/** Flow con un nodo mid-flow real (no start, no end) para poder simular "a media captura". */
const midFlowFlow: BotFlow = {
  version: '1.0',
  start_node_id: 'bienvenida',
  nodes: [
    { id: 'bienvenida', type: 'send_text', content: { text: 'hola' }, transitions: [] },
    {
      id: 'preguntando_cantidad',
      type: 'wait_input',
      content: { prompt: '¿Cuántas piezas?' },
      transitions: [],
    },
  ],
};

function makeConfig(overrides: Partial<TenantConfig> = {}): TenantConfig {
  return {
    tenantId: TENANT_ID,
    botName: 'TestBot',
    nombreNegocio: 'Test',
    tone: 'amigable' as any,
    welcomeMessage: 'hola',
    menuMessage: '',
    outOfHoursMessage: 'Cerrado',
    notUnderstoodMessage: '',
    orderConfirmationMessage: '',
    catalog: [],
    ownerPhone: '+521111111111',
    serviceDirectory: [],
    horarioSemana: null,
    horarioSabado: null,
    abreDomingo: false,
    catalogSynonyms: {},
    ...overrides,
  };
}

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'u1',
    tenantId: TENANT_ID,
    phoneNumber: USER_PHONE,
    currentState: 'initial' as UserState,
    currentNodeId: undefined,
    context: {},
    humanPausedUntil: null,
    lastInboundAt: null,
    optedOutAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function buildController(
  userRepo: jest.Mocked<UserRepository>,
  interpreter: jest.Mocked<FlowInterpreter>,
  config: TenantConfig = makeConfig(),
  notif?: Partial<jest.Mocked<NotificationPort>>,
) {
  const notification = {
    sendMessage: jest.fn().mockResolvedValue(undefined),
    sendButtons: jest.fn(),
    sendImage: jest.fn(),
    sendList: jest.fn(),
    sendLocation: jest.fn(),
    sendDocument: jest.fn(),
    sendCtaUrl: jest.fn(),
    sendLocationRequest: jest.fn(),
    sendMediaCarousel: jest.fn(),
    sendReaction: jest.fn(),
    sendCallPermissionRequest: jest.fn(),
    sendWhatsappFlow: jest.fn(),
    ...notif,
  } as unknown as jest.Mocked<NotificationPort>;

  const tenantConfig = {
    getConfig: jest.fn().mockResolvedValue(config),
    invalidate: jest.fn(),
  } as unknown as jest.Mocked<TenantConfigPort>;

  const botFlowRepo = {
    findActiveByTenant: jest.fn().mockResolvedValue(midFlowFlow),
  } as unknown as jest.Mocked<BotFlowRepository>;

  const audit = { log: jest.fn() } as unknown as jest.Mocked<AuditPort>;
  const businessHours = new BusinessHoursService();

  return new BotController(
    userRepo, notification, tenantConfig, botFlowRepo, interpreter, audit, businessHours, logger,
  );
}

function makeUserRepo(overrides: Partial<jest.Mocked<UserRepository>> = {}): jest.Mocked<UserRepository> {
  return {
    findByPhoneNumber: jest.fn().mockResolvedValue(makeUser()),
    save: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue(undefined),
    resetUserState: jest.fn(),
    setHumanHandoff: jest.fn().mockResolvedValue(undefined),
    listPaused: jest.fn().mockResolvedValue([]),
    touchLastInbound: jest.fn().mockResolvedValue(undefined),
    setOptOut: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as jest.Mocked<UserRepository>;
}

function makeInterpreter(): jest.Mocked<FlowInterpreter> {
  return {
    execute: jest.fn().mockResolvedValue({
      outputs: [{ kind: 'text', text: 'respuesta del flow' }],
      nextNodeId: 'bienvenida',
      contextUpdates: {},
      flowEnded: false,
    }),
  } as unknown as jest.Mocked<FlowInterpreter>;
}

const HOURS_AGO_3 = new Date(Date.now() - 3 * 60 * 60 * 1000);
const MIN_AGO_30 = new Date(Date.now() - 30 * 60 * 1000);

describe('BotController — expiración de sesión conversacional (DEC-07)', () => {
  it('a media captura, más de 2h desde el último mensaje: avisa y resetea currentNodeId/context', async () => {
    const userRepo = makeUserRepo({
      findByPhoneNumber: jest.fn().mockResolvedValue(
        makeUser({ currentNodeId: 'preguntando_cantidad', context: { selected_product_id: 'p1' }, lastInboundAt: HOURS_AGO_3 }),
      ),
    });
    const interpreter = makeInterpreter();
    const notif = { sendMessage: jest.fn().mockResolvedValue(undefined) };

    const ctrl = buildController(userRepo, interpreter, makeConfig(), notif);
    await ctrl.processMessage(TENANT_ID, USER_PHONE, 'hola');

    expect(notif.sendMessage).toHaveBeenCalledWith(
      TENANT_ID, USER_PHONE, expect.stringMatching(/pasó un rato/i),
    );
    expect(interpreter.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        user: expect.objectContaining({ currentNodeId: undefined, context: {} }),
      }),
    );
    // La persistencia tampoco debe resucitar el contexto viejo.
    expect(userRepo.update).toHaveBeenCalledWith(
      expect.objectContaining({ context: {} }),
    );
  });

  it('a media captura, menos de 2h y sin cierre de negocio de por medio: NO avisa, conserva contexto', async () => {
    const userRepo = makeUserRepo({
      findByPhoneNumber: jest.fn().mockResolvedValue(
        makeUser({ currentNodeId: 'preguntando_cantidad', context: { selected_product_id: 'p1' }, lastInboundAt: MIN_AGO_30 }),
      ),
    });
    const interpreter = makeInterpreter();
    const notif = { sendMessage: jest.fn().mockResolvedValue(undefined) };

    const ctrl = buildController(userRepo, interpreter, makeConfig(), notif);
    await ctrl.processMessage(TENANT_ID, USER_PHONE, '3');

    expect(notif.sendMessage).not.toHaveBeenCalledWith(
      TENANT_ID, USER_PHONE, expect.stringMatching(/pasó un rato/i),
    );
    expect(interpreter.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        user: expect.objectContaining({
          currentNodeId: 'preguntando_cantidad',
          context: { selected_product_id: 'p1' },
        }),
      }),
    );
  });

  it('usuario NUEVO (sin currentNodeId), aunque lastInboundAt sea viejo: no avisa (no había nada empezado)', async () => {
    const userRepo = makeUserRepo({
      findByPhoneNumber: jest.fn().mockResolvedValue(
        makeUser({ currentNodeId: undefined, lastInboundAt: HOURS_AGO_3 }),
      ),
    });
    const interpreter = makeInterpreter();
    const notif = { sendMessage: jest.fn().mockResolvedValue(undefined) };

    const ctrl = buildController(userRepo, interpreter, makeConfig(), notif);
    await ctrl.processMessage(TENANT_ID, USER_PHONE, 'hola');

    expect(notif.sendMessage).not.toHaveBeenCalledWith(
      TENANT_ID, USER_PHONE, expect.stringMatching(/pasó un rato/i),
    );
  });

  it('usuario que ya terminó su flow (currentNodeId="end"): no avisa aunque lastInboundAt sea viejo', async () => {
    const userRepo = makeUserRepo({
      findByPhoneNumber: jest.fn().mockResolvedValue(
        makeUser({ currentNodeId: 'end', lastInboundAt: HOURS_AGO_3 }),
      ),
    });
    const interpreter = makeInterpreter();
    const notif = { sendMessage: jest.fn().mockResolvedValue(undefined) };

    const ctrl = buildController(userRepo, interpreter, makeConfig(), notif);
    await ctrl.processMessage(TENANT_ID, USER_PHONE, 'hola de nuevo');

    expect(notif.sendMessage).not.toHaveBeenCalledWith(
      TENANT_ID, USER_PHONE, expect.stringMatching(/pasó un rato/i),
    );
  });

  it('a media captura sin lastInboundAt (migración 019 aún no aplicada / usuario legacy): no truena, no resetea', async () => {
    const userRepo = makeUserRepo({
      findByPhoneNumber: jest.fn().mockResolvedValue(
        makeUser({ currentNodeId: 'preguntando_cantidad', context: { a: 1 }, lastInboundAt: null }),
      ),
    });
    const interpreter = makeInterpreter();
    const notif = { sendMessage: jest.fn().mockResolvedValue(undefined) };

    const ctrl = buildController(userRepo, interpreter, makeConfig(), notif);
    const result = await ctrl.processMessage(TENANT_ID, USER_PHONE, 'hola');

    expect(result).toBe('respuesta del flow');
    expect(notif.sendMessage).not.toHaveBeenCalledWith(
      TENANT_ID, USER_PHONE, expect.stringMatching(/pasó un rato/i),
    );
    expect(interpreter.execute).toHaveBeenCalledWith(
      expect.objectContaining({ user: expect.objectContaining({ currentNodeId: 'preguntando_cantidad' }) }),
    );
  });

  it('a media captura, menos de 2h PERO hubo un cierre real del negocio de por medio: sí avisa y resetea', async () => {
    // Horario 09:00-18:00 todos los días. last_inbound_at hace 30 min, pero
    // "ahora" se mockea a después de un cierre real dentro de esa ventana.
    const config = makeConfig({ horarioSemana: '09:00-18:00', horarioSabado: '09:00-18:00', abreDomingo: true });
    const userRepo = makeUserRepo({
      findByPhoneNumber: jest.fn().mockResolvedValue(
        makeUser({ currentNodeId: 'preguntando_cantidad', context: { a: 1 }, lastInboundAt: MIN_AGO_30 }),
      ),
    });
    const interpreter = makeInterpreter();
    const notif = { sendMessage: jest.fn().mockResolvedValue(undefined) };

    // Fuerza "ahora" a un horario cerrado real (23:00 México) sin depender
    // del reloj real de la máquina que corre el test.
    const businessHours = new BusinessHoursService();
    jest.spyOn(businessHours, 'hadClosureBetween').mockReturnValue(true);

    const notification = {
      sendMessage: notif.sendMessage,
      sendButtons: jest.fn(), sendImage: jest.fn(), sendList: jest.fn(), sendLocation: jest.fn(),
      sendDocument: jest.fn(), sendCtaUrl: jest.fn(), sendLocationRequest: jest.fn(),
      sendMediaCarousel: jest.fn(), sendReaction: jest.fn(), sendCallPermissionRequest: jest.fn(),
      sendWhatsappFlow: jest.fn(),
    } as unknown as jest.Mocked<NotificationPort>;
    const tenantConfig = {
      getConfig: jest.fn().mockResolvedValue(config),
      invalidate: jest.fn(),
    } as unknown as jest.Mocked<TenantConfigPort>;
    const botFlowRepo = {
      findActiveByTenant: jest.fn().mockResolvedValue(midFlowFlow),
    } as unknown as jest.Mocked<BotFlowRepository>;
    const audit = { log: jest.fn() } as unknown as jest.Mocked<AuditPort>;

    const ctrl = new BotController(
      userRepo, notification, tenantConfig, botFlowRepo, interpreter,
      audit, businessHours, logger,
    );

    await ctrl.processMessage(TENANT_ID, USER_PHONE, 'hola');

    expect(businessHours.hadClosureBetween).toHaveBeenCalledWith(
      { horarioSemana: '09:00-18:00', horarioSabado: '09:00-18:00', abreDomingo: true },
      MIN_AGO_30,
      expect.any(Date),
    );
    expect(notif.sendMessage).toHaveBeenCalledWith(
      TENANT_ID, USER_PHONE, expect.stringMatching(/pasó un rato/i),
    );
  });

  it('handoff humano activo: el gate de TTL no se evalúa (el bot ya calló antes)', async () => {
    const userRepo = makeUserRepo({
      findByPhoneNumber: jest.fn().mockResolvedValue(
        makeUser({
          currentNodeId: 'preguntando_cantidad',
          lastInboundAt: HOURS_AGO_3,
          humanPausedUntil: new Date(Date.now() + 60 * 60 * 1000),
        }),
      ),
    });
    const interpreter = makeInterpreter();
    const notif = { sendMessage: jest.fn().mockResolvedValue(undefined) };

    const ctrl = buildController(userRepo, interpreter, makeConfig(), notif);
    const result = await ctrl.processMessage(TENANT_ID, USER_PHONE, 'hola');

    expect(result).toBeNull();
    expect(interpreter.execute).not.toHaveBeenCalled();
    expect(notif.sendMessage).not.toHaveBeenCalledWith(
      TENANT_ID, USER_PHONE, expect.stringMatching(/pasó un rato/i),
    );
  });
});
