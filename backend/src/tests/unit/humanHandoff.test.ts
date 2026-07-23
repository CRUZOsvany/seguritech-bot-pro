/**
 * Tests del gate de handoff humano en BotController.
 *
 * Cubre tres invariantes:
 *   1. Usuario con humanPausedUntil en el futuro → bot no responde (return null).
 *   2. Usuario con humanPausedUntil expirado → bot procesa normalmente.
 *   3. Nodo escape_to_human → setHumanHandoff se llama con timestamp 48h futuro.
 */

import pino from 'pino';
import { BotController } from '@/app/controllers/BotController';
import { UserRepository, TenantConfigPort, BotFlowRepository, NotificationPort } from '@/domain/ports';
import { FlowInterpreter } from '@/domain/services/FlowInterpreter';
import { config } from '@/config/env';
import type { TenantConfig, User, UserState } from '@/domain/entities';
import type { BotFlow } from '@/domain/entities/flow';

const HANDOFF_TTL_MS = config.bot.handoffPauseMinutes * 60 * 1000;

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
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function buildController(
  userRepo: jest.Mocked<UserRepository>,
  interpreter: jest.Mocked<FlowInterpreter>,
  flowRepo?: Partial<jest.Mocked<BotFlowRepository>>,
) {
  const notif = {
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
  } as unknown as jest.Mocked<NotificationPort>;

  const tenantConfig = {
    getConfig: jest.fn().mockResolvedValue(baseConfig),
    invalidate: jest.fn(),
  } as unknown as jest.Mocked<TenantConfigPort>;

  const botFlowRepo = {
    findActiveByTenant: jest.fn().mockResolvedValue(minimalFlow),
    ...flowRepo,
  } as unknown as jest.Mocked<BotFlowRepository>;

  return new BotController(userRepo, notif, tenantConfig, botFlowRepo, interpreter, logger);
}

describe('BotController — gate de handoff humano', () => {
  let userRepo: jest.Mocked<UserRepository>;
  let interpreter: jest.Mocked<FlowInterpreter>;

  beforeEach(() => {
    userRepo = {
      findByPhoneNumber: jest.fn(),
      save: jest.fn().mockResolvedValue(undefined),
      update: jest.fn().mockResolvedValue(undefined),
      resetUserState: jest.fn(),
      setHumanHandoff: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<UserRepository>;

    interpreter = {
      execute: jest.fn().mockResolvedValue({
        outputs: [{ kind: 'text', text: 'respuesta' }],
        nextNodeId: 'end',
        contextUpdates: {},
        flowEnded: false,
      }),
    } as unknown as jest.Mocked<FlowInterpreter>;
  });

  it('silencia el bot si humanPausedUntil está en el futuro', async () => {
    const futureDate = new Date(Date.now() + 10 * 60 * 60 * 1000); // +10h
    userRepo.findByPhoneNumber.mockResolvedValue(makeUser({ humanPausedUntil: futureDate }));

    const ctrl = buildController(userRepo, interpreter);
    const result = await ctrl.processMessage(TENANT_ID, USER_PHONE, 'hola');

    expect(result).toBeNull();
    expect(interpreter.execute).not.toHaveBeenCalled();
    expect(userRepo.setHumanHandoff).not.toHaveBeenCalled();
  });

  it('procesa normalmente si humanPausedUntil ya expiró', async () => {
    const pastDate = new Date(Date.now() - 1000); // hace 1 segundo
    userRepo.findByPhoneNumber.mockResolvedValue(makeUser({ humanPausedUntil: pastDate }));

    const ctrl = buildController(userRepo, interpreter);
    const result = await ctrl.processMessage(TENANT_ID, USER_PHONE, 'hola');

    expect(interpreter.execute).toHaveBeenCalledTimes(1);
    expect(result).toBe('respuesta');
  });

  it('procesa normalmente si humanPausedUntil es null', async () => {
    userRepo.findByPhoneNumber.mockResolvedValue(makeUser({ humanPausedUntil: null }));

    const ctrl = buildController(userRepo, interpreter);
    await ctrl.processMessage(TENANT_ID, USER_PHONE, 'hola');

    expect(interpreter.execute).toHaveBeenCalledTimes(1);
  });
});

describe('BotController — activación del handoff al disparar escape_to_human', () => {
  let userRepo: jest.Mocked<UserRepository>;
  let interpreter: jest.Mocked<FlowInterpreter>;

  beforeEach(() => {
    userRepo = {
      findByPhoneNumber: jest.fn().mockResolvedValue(makeUser()),
      save: jest.fn().mockResolvedValue(undefined),
      update: jest.fn().mockResolvedValue(undefined),
      resetUserState: jest.fn(),
      setHumanHandoff: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<UserRepository>;

    interpreter = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<FlowInterpreter>;
  });

  it('llama setHumanHandoff con timestamp ~48h cuando el output es escape_to_human', async () => {
    interpreter.execute.mockResolvedValue({
      outputs: [{ kind: 'escape_to_human', userResponse: 'Un agente te contactará', ownerAlert: 'Nuevo lead' }],
      nextNodeId: 'end',
      contextUpdates: {},
      flowEnded: true,
    });

    const ctrl = buildController(userRepo, interpreter);
    const before = Date.now();
    await ctrl.processMessage(TENANT_ID, USER_PHONE, 'quiero hablar con alguien');
    const after = Date.now();

    expect(userRepo.setHumanHandoff).toHaveBeenCalledTimes(1);
    const [calledTenant, calledPhone, calledDate] = userRepo.setHumanHandoff.mock.calls[0];
    expect(calledTenant).toBe(TENANT_ID);
    expect(calledPhone).toBe(USER_PHONE);
    // El timestamp debe ser approximately now + HANDOFF_TTL (leído del config, no hardcodeado)
    expect(calledDate!.getTime()).toBeGreaterThanOrEqual(before + HANDOFF_TTL_MS - 100);
    expect(calledDate!.getTime()).toBeLessThanOrEqual(after + HANDOFF_TTL_MS + 100);
  });

  it('NO llama setHumanHandoff si el output NO es escape_to_human', async () => {
    interpreter.execute.mockResolvedValue({
      outputs: [{ kind: 'text', text: 'hola' }],
      nextNodeId: 'end',
      contextUpdates: {},
      flowEnded: false,
    });

    const ctrl = buildController(userRepo, interpreter);
    await ctrl.processMessage(TENANT_ID, USER_PHONE, 'hola');

    expect(userRepo.setHumanHandoff).not.toHaveBeenCalled();
  });
});
