/**
 * Tests del gate de horario de atención en BotController (§2.2 del plan V1).
 * Mismo patrón de mocks que humanHandoff.test.ts/metaCompliance.test.ts.
 * BusinessHoursService en sí ya está probado a fondo en
 * BusinessHoursService.test.ts — aquí solo se cubre el PUNTO DE INSERCIÓN:
 * qué hace BotController con el resultado del gate.
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
const OWNER_PHONE = '+521111111111';
const OUT_OF_HOURS_TEXT = 'Estamos cerrados. Abrimos de 9 a 19h.';

const minimalFlow: BotFlow = {
  version: '1.0',
  start_node_id: 'end',
  nodes: [{ id: 'end', type: 'end', content: {}, transitions: [] }],
};

function makeConfig(overrides: Partial<TenantConfig> = {}): TenantConfig {
  return {
    tenantId: TENANT_ID,
    botName: 'TestBot',
    nombreNegocio: 'Test',
    tone: 'amigable' as any,
    welcomeMessage: 'hola',
    menuMessage: '',
    outOfHoursMessage: OUT_OF_HOURS_TEXT,
    notUnderstoodMessage: '',
    orderConfirmationMessage: '',
    catalog: [],
    ownerPhone: OWNER_PHONE,
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
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/** businessHours.isOpenNow siempre fuerza el resultado indicado — no depende del reloj real. */
function makeBusinessHoursStub(isOpen: boolean): jest.Mocked<BusinessHoursService> {
  return {
    isOpenNow: jest.fn().mockReturnValue({ isOpen, unknown: false }),
  } as unknown as jest.Mocked<BusinessHoursService>;
}

function buildController(params: {
  userRepo: jest.Mocked<UserRepository>;
  interpreter: jest.Mocked<FlowInterpreter>;
  businessHours: jest.Mocked<BusinessHoursService>;
  config?: TenantConfig;
}) {
  const { userRepo, interpreter, businessHours, config = makeConfig() } = params;

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
    getConfig: jest.fn().mockResolvedValue(config),
    invalidate: jest.fn(),
  } as unknown as jest.Mocked<TenantConfigPort>;

  const botFlowRepo = {
    findActiveByTenant: jest.fn().mockResolvedValue(minimalFlow),
  } as unknown as jest.Mocked<BotFlowRepository>;

  const audit = { log: jest.fn() } as unknown as jest.Mocked<AuditPort>;

  const controller = new BotController(
    userRepo, notif, tenantConfig, botFlowRepo, interpreter, audit, businessHours, logger,
  );

  return { controller, notif };
}

describe('BotController — gate de horario de atención (§2.2)', () => {
  let userRepo: jest.Mocked<UserRepository>;
  let interpreter: jest.Mocked<FlowInterpreter>;

  beforeEach(() => {
    userRepo = {
      findByPhoneNumber: jest.fn().mockResolvedValue(makeUser()),
      save: jest.fn().mockResolvedValue(undefined),
      update: jest.fn().mockResolvedValue(undefined),
      resetUserState: jest.fn(),
      setHumanHandoff: jest.fn().mockResolvedValue(undefined),
      listPaused: jest.fn().mockResolvedValue([]),
      touchLastInbound: jest.fn().mockResolvedValue(undefined),
      setOptOut: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<UserRepository>;

    interpreter = {
      execute: jest.fn().mockResolvedValue({
        outputs: [{ kind: 'text', text: 'respuesta del flow' }],
        nextNodeId: 'end',
        contextUpdates: {},
        flowEnded: false,
      }),
    } as unknown as jest.Mocked<FlowInterpreter>;
  });

  it('fuera de horario: envía outOfHoursMessage, NO ejecuta el flow, NO actualiza al usuario', async () => {
    const businessHours = makeBusinessHoursStub(false);
    const { controller, notif } = buildController({ userRepo, interpreter, businessHours });

    const result = await controller.processMessage(TENANT_ID, USER_PHONE, 'quiero un tornillo');

    expect(result).toBe(OUT_OF_HOURS_TEXT);
    expect(notif.sendMessage).toHaveBeenCalledWith(TENANT_ID, USER_PHONE, OUT_OF_HOURS_TEXT);
    expect(interpreter.execute).not.toHaveBeenCalled();
    expect(userRepo.update).not.toHaveBeenCalled();
  });

  it('fuera de horario: el gate consulta horarioSemana/horarioSabado/abreDomingo del TenantConfig', async () => {
    const businessHours = makeBusinessHoursStub(false);
    const config = makeConfig({ horarioSemana: '09:00-19:00', horarioSabado: '10:00-14:00', abreDomingo: true });
    const { controller } = buildController({ userRepo, interpreter, businessHours, config });

    await controller.processMessage(TENANT_ID, USER_PHONE, 'hola');

    expect(businessHours.isOpenNow).toHaveBeenCalledWith({
      horarioSemana: '09:00-19:00',
      horarioSabado: '10:00-14:00',
      abreDomingo: true,
    });
  });

  it('fuera de horario pero el mensaje viene del dueño: el gate NO aplica, el flow sigue normal', async () => {
    userRepo.findByPhoneNumber.mockResolvedValue(makeUser({ phoneNumber: OWNER_PHONE }));
    const businessHours = makeBusinessHoursStub(false);
    const { controller, notif } = buildController({ userRepo, interpreter, businessHours });

    const result = await controller.processMessage(TENANT_ID, OWNER_PHONE, 'probando mi bot a las 3am');

    expect(result).toBe('respuesta del flow');
    expect(interpreter.execute).toHaveBeenCalledTimes(1);
    expect(notif.sendMessage).not.toHaveBeenCalledWith(TENANT_ID, OWNER_PHONE, OUT_OF_HOURS_TEXT);
  });

  it('dentro de horario: el flow se ejecuta normal, sin cambios de comportamiento', async () => {
    const businessHours = makeBusinessHoursStub(true);
    const { controller, notif } = buildController({ userRepo, interpreter, businessHours });

    const result = await controller.processMessage(TENANT_ID, USER_PHONE, 'hola');

    expect(result).toBe('respuesta del flow');
    expect(interpreter.execute).toHaveBeenCalledTimes(1);
    expect(userRepo.update).toHaveBeenCalledTimes(1);
    expect(notif.sendMessage).not.toHaveBeenCalledWith(TENANT_ID, USER_PHONE, OUT_OF_HOURS_TEXT);
  });

  it('el gate de horario se evalúa DESPUÉS del gate de handoff humano (handoff gana)', async () => {
    const futureDate = new Date(Date.now() + 10 * 60 * 60 * 1000);
    userRepo.findByPhoneNumber.mockResolvedValue(makeUser({ humanPausedUntil: futureDate }));
    const businessHours = makeBusinessHoursStub(false);
    const { controller, notif } = buildController({ userRepo, interpreter, businessHours });

    const result = await controller.processMessage(TENANT_ID, USER_PHONE, 'hola');

    expect(result).toBeNull();
    expect(businessHours.isOpenNow).not.toHaveBeenCalled();
    expect(notif.sendMessage).not.toHaveBeenCalled();
  });
});
