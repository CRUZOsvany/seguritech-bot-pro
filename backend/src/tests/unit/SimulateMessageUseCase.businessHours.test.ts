/**
 * Fase 4 del cierre "Reconectar el Designer/Simulador ya construido":
 * `SimulateMessageUseCase` no tenía forma de probar el gate de horario de
 * atención — `BusinessHoursService.isOpenNow()` ya acepta un `now` opcional
 * (pensado para esto), pero solo `BotController` lo usaba. Mismo patrón de
 * mocks que `businessHours.gate.test.ts` (BotController) — aquí se cubre el
 * mismo PUNTO DE INSERCIÓN, ahora en el simulador.
 */
import pino from 'pino';
import { SimulateMessageUseCase } from '@/domain/use-cases/SimulateMessageUseCase';
import { UserRepository, TenantConfigPort, BotFlowRepository } from '@/domain/ports';
import { FlowInterpreter } from '@/domain/services/FlowInterpreter';
import { BusinessHoursService } from '@/domain/services/BusinessHoursService';
import { BotTone } from '@/domain/entities';
import type { TenantConfig, User, UserState } from '@/domain/entities';
import type { BotFlow } from '@/domain/entities/flow';

const logger = pino({ level: 'silent' });

const TENANT_ID = 'tenant-test';
const USER_PHONE = '521234567890';
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
    tone: BotTone.AMIGABLE,
    welcomeMessage: 'hola',
    menuMessage: '',
    outOfHoursMessage: OUT_OF_HOURS_TEXT,
    notUnderstoodMessage: '',
    orderConfirmationMessage: '',
    catalog: [],
    serviceDirectory: [],
    horarioSemana: '09:00-19:00',
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
    currentNodeId: 'some_node',
    context: { foo: 'bar' },
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

describe('SimulateMessageUseCase — gate de horario de atención (Fase 4)', () => {
  let userRepo: jest.Mocked<UserRepository>;
  let tenantConfigPort: jest.Mocked<TenantConfigPort>;
  let botFlowRepo: jest.Mocked<BotFlowRepository>;
  let interpreter: jest.Mocked<FlowInterpreter>;

  beforeEach(() => {
    userRepo = {
      findByPhoneNumber: jest.fn().mockResolvedValue(makeUser()),
      save: jest.fn().mockResolvedValue(undefined),
      update: jest.fn().mockResolvedValue(undefined),
      resetUserState: jest.fn(),
    } as unknown as jest.Mocked<UserRepository>;

    tenantConfigPort = {
      getConfig: jest.fn().mockResolvedValue(makeConfig()),
      invalidate: jest.fn(),
    } as unknown as jest.Mocked<TenantConfigPort>;

    botFlowRepo = {
      findActiveByTenant: jest.fn().mockResolvedValue(minimalFlow),
    } as unknown as jest.Mocked<BotFlowRepository>;

    interpreter = {
      execute: jest.fn().mockResolvedValue({
        outputs: [{ kind: 'text', text: 'respuesta del flow' }],
        nextNodeId: 'end',
        contextUpdates: {},
        flowEnded: false,
      }),
    } as unknown as jest.Mocked<FlowInterpreter>;
  });

  function buildUseCase(businessHours: jest.Mocked<BusinessHoursService>) {
    return new SimulateMessageUseCase(
      userRepo,
      tenantConfigPort,
      botFlowRepo,
      interpreter,
      businessHours,
      logger,
    );
  }

  it('con simulateAt fuera de horario: responde outOfHoursMessage, NO ejecuta el flow, nextNodeId/context no avanzan', async () => {
    const businessHours = makeBusinessHoursStub(false);
    const useCase = buildUseCase(businessHours);

    const result = await useCase.execute({
      tenantId: TENANT_ID,
      phoneNumber: USER_PHONE,
      content: 'hola',
      persist: false,
      simulateAt: '2026-01-01T22:00:00-06:00', // fuera de 09:00-19:00
      state: { currentNodeId: 'some_node', context: { foo: 'bar' } },
    });

    expect(result.outputs).toEqual([{ kind: 'text', text: OUT_OF_HOURS_TEXT }]);
    expect(result.nextNodeId).toBe('some_node');
    expect(result.context).toEqual({ foo: 'bar' });
    expect(result.flowEnded).toBe(false);
    expect(interpreter.execute).not.toHaveBeenCalled();
    expect(userRepo.update).not.toHaveBeenCalled();
  });

  it('con simulateAt, pasa esa hora exacta (parseada) a businessHoursService.isOpenNow junto con el horario del tenant', async () => {
    const businessHours = makeBusinessHoursStub(false);
    const useCase = buildUseCase(businessHours);

    await useCase.execute({
      tenantId: TENANT_ID,
      phoneNumber: USER_PHONE,
      content: 'hola',
      persist: false,
      simulateAt: '2026-01-01T22:00:00-06:00',
    });

    expect(businessHours.isOpenNow).toHaveBeenCalledWith(
      { horarioSemana: '09:00-19:00', horarioSabado: null, abreDomingo: false },
      new Date('2026-01-01T22:00:00-06:00'),
    );
  });

  it('sin simulateAt (comportamiento actual): no se consulta el gate de horario, el flow corre normal', async () => {
    const businessHours = makeBusinessHoursStub(false); // aunque diga "cerrado", no debe importar
    const useCase = buildUseCase(businessHours);

    const result = await useCase.execute({
      tenantId: TENANT_ID,
      phoneNumber: USER_PHONE,
      content: 'hola',
      persist: false,
    });

    expect(businessHours.isOpenNow).not.toHaveBeenCalled();
    expect(interpreter.execute).toHaveBeenCalledTimes(1);
    expect(result.outputs).toEqual([{ kind: 'text', text: 'respuesta del flow' }]);
  });

  it('con simulateAt DENTRO de horario: el flow corre normal, sin cambios de comportamiento', async () => {
    const businessHours = makeBusinessHoursStub(true);
    const useCase = buildUseCase(businessHours);

    const result = await useCase.execute({
      tenantId: TENANT_ID,
      phoneNumber: USER_PHONE,
      content: 'hola',
      persist: false,
      simulateAt: '2026-01-01T12:00:00-06:00',
    });

    expect(interpreter.execute).toHaveBeenCalledTimes(1);
    expect(result.outputs).toEqual([{ kind: 'text', text: 'respuesta del flow' }]);
  });
});
