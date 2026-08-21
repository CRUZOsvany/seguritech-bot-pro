/**
 * Tests de cumplimiento Meta en BotController (Bloque 2.1 + 2.2 del plan
 * de solución de hallazgos, .claude/PLAN_SOLUCION_HALLAZGOS_PENDIENTES.md).
 *
 * Cubre:
 *   1. Ventana de servicio 24h (2.1): `touchLastInbound` se llama en TODO
 *      mensaje entrante, tenga o no flow activo el tenant.
 *   2. Opt-out real (2.2): palabra de opt-out marca `opted_out_at`, corta el
 *      flow, y confirma al usuario — sin tocar el FlowInterpreter.
 *   3. Opt-in implícito: un usuario opted-out que escribe cualquier otra
 *      cosa se reactiva automáticamente y su mensaje sigue al flow normal.
 *   4. El dueño (ownerPhone) queda fuera de la lógica de opt-out.
 */

import pino from 'pino';
import { BotController } from '@/app/controllers/BotController';
import {
  UserRepository, TenantConfigPort, BotFlowRepository, NotificationPort, AuditPort,
} from '@/domain/ports';
import { FlowInterpreter } from '@/domain/services/FlowInterpreter';
import type { TenantConfig, User, UserState } from '@/domain/entities';
import type { BotFlow } from '@/domain/entities/flow';

const logger = pino({ level: 'silent' });

const TENANT_ID = 'tenant-test';
const USER_PHONE = '521234567890';

const minimalFlow: BotFlow = {
  version: '1.0',
  start_node_id: 'end',
  nodes: [{ id: 'end', type: 'end', content: {}, transitions: [] }],
};

const baseConfig: TenantConfig = {
  tenantId: TENANT_ID,
  botName: 'TestBot',
  nombreNegocio: 'Test',
  tone: 'amigable' as any,
  welcomeMessage: 'hola',
  menuMessage: '',
  outOfHoursMessage: '',
  notUnderstoodMessage: '',
  orderConfirmationMessage: '',
  catalog: [],
  ownerPhone: '+521111111111',
};

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
  flowRepo?: Partial<jest.Mocked<BotFlowRepository>>,
  notif?: Partial<jest.Mocked<NotificationPort>>,
  auditPort?: jest.Mocked<AuditPort>,
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
    getConfig: jest.fn().mockResolvedValue(baseConfig),
    invalidate: jest.fn(),
  } as unknown as jest.Mocked<TenantConfigPort>;

  const botFlowRepo = {
    findActiveByTenant: jest.fn().mockResolvedValue(minimalFlow),
    ...flowRepo,
  } as unknown as jest.Mocked<BotFlowRepository>;

  const audit = auditPort ?? ({ log: jest.fn() } as unknown as jest.Mocked<AuditPort>);

  return new BotController(userRepo, notification, tenantConfig, botFlowRepo, interpreter, audit, logger);
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

describe('BotController — ventana de servicio 24h (Bloque 2.1)', () => {
  it('touchLastInbound se llama con tenant/telefono/timestamp en cada mensaje, con flow activo', async () => {
    const userRepo = makeUserRepo();
    const interpreter = {
      execute: jest.fn().mockResolvedValue({
        outputs: [{ kind: 'text', text: 'hola' }],
        nextNodeId: 'end',
        contextUpdates: {},
        flowEnded: false,
      }),
    } as unknown as jest.Mocked<FlowInterpreter>;

    const ctrl = buildController(userRepo, interpreter);
    const before = Date.now();
    await ctrl.processMessage(TENANT_ID, USER_PHONE, 'hola');
    const after = Date.now();

    expect(userRepo.touchLastInbound).toHaveBeenCalledTimes(1);
    const [calledTenant, calledPhone, calledAt] = userRepo.touchLastInbound.mock.calls[0];
    expect(calledTenant).toBe(TENANT_ID);
    expect(calledPhone).toBe(USER_PHONE);
    expect(calledAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(calledAt.getTime()).toBeLessThanOrEqual(after);
  });

  it('touchLastInbound se llama incluso sin bot_flow activo (mantenimiento)', async () => {
    const userRepo = makeUserRepo();
    const interpreter = { execute: jest.fn() } as unknown as jest.Mocked<FlowInterpreter>;
    const flowRepo = { findActiveByTenant: jest.fn().mockResolvedValue(null) };

    const ctrl = buildController(userRepo, interpreter, flowRepo);
    const result = await ctrl.processMessage(TENANT_ID, USER_PHONE, 'hola');

    expect(userRepo.touchLastInbound).toHaveBeenCalledTimes(1);
    expect(result).toMatch(/siendo configurado/i);
  });
});

describe('BotController — opt-out real (Bloque 2.2)', () => {
  it('palabra de opt-out (STOP) marca opted_out_at, confirma y NO toca el flow', async () => {
    const userRepo = makeUserRepo();
    const interpreter = { execute: jest.fn() } as unknown as jest.Mocked<FlowInterpreter>;
    const notif = { sendMessage: jest.fn().mockResolvedValue(undefined) };
    const audit = { log: jest.fn() } as unknown as jest.Mocked<AuditPort>;

    const ctrl = buildController(userRepo, interpreter, undefined, notif, audit);
    const result = await ctrl.processMessage(TENANT_ID, USER_PHONE, 'STOP');

    expect(userRepo.setOptOut).toHaveBeenCalledWith(TENANT_ID, USER_PHONE, expect.any(Date));
    expect(interpreter.execute).not.toHaveBeenCalled();
    expect(notif.sendMessage).toHaveBeenCalledWith(
      TENANT_ID, USER_PHONE, expect.stringMatching(/no volverás a recibir/i),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'bot_user.opt_out', targetType: 'bot_user' }),
    );
    expect(result).toMatch(/no volverás a recibir/i);
  });

  it('es case-insensitive y matchea "cancelar suscripción"', async () => {
    const userRepo = makeUserRepo();
    const interpreter = { execute: jest.fn() } as unknown as jest.Mocked<FlowInterpreter>;

    const ctrl = buildController(userRepo, interpreter);
    await ctrl.processMessage(TENANT_ID, USER_PHONE, '  Cancelar Suscripción  ');

    expect(userRepo.setOptOut).toHaveBeenCalledWith(TENANT_ID, USER_PHONE, expect.any(Date));
    expect(interpreter.execute).not.toHaveBeenCalled();
  });

  it('un usuario opted-out que escribe cualquier otra cosa se reactiva (opt-in implícito) y sigue al flow', async () => {
    const userRepo = makeUserRepo({
      findByPhoneNumber: jest.fn().mockResolvedValue(makeUser({ optedOutAt: new Date() })),
    });
    const interpreter = {
      execute: jest.fn().mockResolvedValue({
        outputs: [{ kind: 'text', text: 'hola de nuevo' }],
        nextNodeId: 'end',
        contextUpdates: {},
        flowEnded: false,
      }),
    } as unknown as jest.Mocked<FlowInterpreter>;
    const audit = { log: jest.fn() } as unknown as jest.Mocked<AuditPort>;

    const ctrl = buildController(userRepo, interpreter, undefined, undefined, audit);
    const result = await ctrl.processMessage(TENANT_ID, USER_PHONE, 'hola, quiero info');

    expect(userRepo.setOptOut).toHaveBeenCalledWith(TENANT_ID, USER_PHONE, null);
    expect(interpreter.execute).toHaveBeenCalledTimes(1);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'bot_user.opt_in_implicit' }),
    );
    expect(result).toBe('hola de nuevo');
  });

  it('un usuario NO opted-out procesa normal sin llamar setOptOut', async () => {
    const userRepo = makeUserRepo();
    const interpreter = {
      execute: jest.fn().mockResolvedValue({
        outputs: [{ kind: 'text', text: 'hola' }],
        nextNodeId: 'end',
        contextUpdates: {},
        flowEnded: false,
      }),
    } as unknown as jest.Mocked<FlowInterpreter>;

    const ctrl = buildController(userRepo, interpreter);
    await ctrl.processMessage(TENANT_ID, USER_PHONE, 'hola');

    expect(userRepo.setOptOut).not.toHaveBeenCalled();
    expect(interpreter.execute).toHaveBeenCalledTimes(1);
  });

  it('el dueño (ownerPhone) queda fuera de la lógica de opt-out aunque escriba "stop"', async () => {
    const OWNER_PHONE = baseConfig.ownerPhone!;
    const userRepo = makeUserRepo({
      findByPhoneNumber: jest.fn().mockResolvedValue(makeUser({ phoneNumber: OWNER_PHONE })),
    });
    const interpreter = {
      execute: jest.fn().mockResolvedValue({
        outputs: [{ kind: 'text', text: 'respuesta normal' }],
        nextNodeId: 'end',
        contextUpdates: {},
        flowEnded: false,
      }),
    } as unknown as jest.Mocked<FlowInterpreter>;

    const ctrl = buildController(userRepo, interpreter);
    const result = await ctrl.processMessage(TENANT_ID, OWNER_PHONE, 'stop');

    expect(userRepo.setOptOut).not.toHaveBeenCalled();
    expect(interpreter.execute).toHaveBeenCalledTimes(1);
    expect(result).toBe('respuesta normal');
  });
});
