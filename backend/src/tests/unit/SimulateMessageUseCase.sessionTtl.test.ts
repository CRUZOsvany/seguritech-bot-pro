/**
 * Depuración motor+simulador, Fase 3: gate de expiración de sesión (DEC-07)
 * en el panel de simulación.
 *
 * `BotController` ya reseteaba una conversación a media captura pasadas 2h
 * (o si el negocio cerró en el intervalo), avisando con
 * SESSION_EXPIRED_NOTICE. `SimulateMessageUseCase` no tenía nada de eso: un
 * operador no podía probar "¿qué le pasa a un cliente que dejó a medias
 * `pedido_cantidad` y vuelve 3 horas después?". Ahora ambos comparten
 * `domain/services/SessionTtlPolicy` y el simulador lo dispara con
 * `simulatedElapsedMinutes`.
 *
 * Mismo patrón de mocks que `SimulateMessageUseCase.businessHours.test.ts`.
 */
import pino from 'pino';
import { SimulateMessageUseCase } from '@/domain/use-cases/SimulateMessageUseCase';
import { UserRepository, TenantConfigPort, BotFlowRepository } from '@/domain/ports';
import { FlowInterpreter } from '@/domain/services/FlowInterpreter';
import { BusinessHoursService } from '@/domain/services/BusinessHoursService';
import { SESSION_EXPIRED_NOTICE } from '@/domain/services/SessionTtlPolicy';
import { BotTone } from '@/domain/entities';
import type { TenantConfig } from '@/domain/entities';
import type { BotFlow } from '@/domain/entities/flow';

const logger = pino({ level: 'silent' });

const TENANT_ID = 'tenant-test';
const USER_PHONE = '521234567890';

const minimalFlow: BotFlow = {
  version: '1.0',
  start_node_id: 'bienvenida',
  nodes: [
    { id: 'bienvenida', type: 'send_text', content: { text: 'Hola' }, transitions: [] },
    { id: 'end', type: 'end', content: {}, transitions: [] },
  ],
};

function makeConfig(): TenantConfig {
  return {
    tenantId: TENANT_ID,
    botName: 'TestBot',
    nombreNegocio: 'Test',
    tone: BotTone.AMIGABLE,
    welcomeMessage: 'hola',
    menuMessage: '',
    outOfHoursMessage: 'Cerrado',
    notUnderstoodMessage: '',
    orderConfirmationMessage: '',
    catalog: [],
    serviceDirectory: [],
    horarioSemana: '09:00-19:00',
    horarioSabado: null,
    abreDomingo: false,
    catalogSynonyms: {},
  };
}

/**
 * El negocio nunca cerró en el intervalo — así el único disparador posible
 * del gate en estos tests es el TTL, no `hadClosureBetween`.
 */
function makeBusinessHoursStub(): jest.Mocked<BusinessHoursService> {
  return {
    isOpenNow: jest.fn().mockReturnValue({ isOpen: true, unknown: false }),
    hadClosureBetween: jest.fn().mockReturnValue(false),
  } as unknown as jest.Mocked<BusinessHoursService>;
}

describe('SimulateMessageUseCase — gate de expiración de sesión (Fase 3, DEC-07)', () => {
  let userRepo: jest.Mocked<UserRepository>;
  let tenantConfigPort: jest.Mocked<TenantConfigPort>;
  let botFlowRepo: jest.Mocked<BotFlowRepository>;
  let interpreter: jest.Mocked<FlowInterpreter>;
  let businessHours: jest.Mocked<BusinessHoursService>;

  beforeEach(() => {
    userRepo = {
      findByPhoneNumber: jest.fn(),
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
        nextNodeId: 'bienvenida',
        contextUpdates: {},
        flowEnded: false,
      }),
    } as unknown as jest.Mocked<FlowInterpreter>;

    businessHours = makeBusinessHoursStub();
  });

  function buildUseCase() {
    return new SimulateMessageUseCase(
      userRepo,
      tenantConfigPort,
      botFlowRepo,
      interpreter,
      businessHours,
      logger,
    );
  }

  const base = {
    tenantId: TENANT_ID,
    phoneNumber: USER_PHONE,
    content: 'hola de nuevo',
    persist: false,
  };

  it('a media captura + simulatedElapsedMinutes=180: avisa "empezamos de nuevo" y reinicia desde start_node_id', async () => {
    const result = await buildUseCase().execute({
      ...base,
      state: { currentNodeId: 'pedido_cantidad', context: { selected_product_id: 'p1' } },
      simulatedElapsedMinutes: 180,
    });

    // El aviso va PRIMERO, igual que en BotController.
    expect(result.outputs[0]).toEqual({ kind: 'text', text: SESSION_EXPIRED_NOTICE });
    expect(result.outputs[1]).toEqual({ kind: 'text', text: 'respuesta del flow' });

    // El flow se re-ejecuta con el user reseteado: sin currentNodeId, el
    // "Caso 2" del interpreter arranca desde flow.start_node_id.
    expect(interpreter.execute).toHaveBeenCalledTimes(1);
    const passedUser = interpreter.execute.mock.calls[0][0].user;
    expect(passedUser.currentNodeId).toBeUndefined();
    expect(passedUser.context).toEqual({});

    // El contexto de la sesión vieja no se filtra en la nueva.
    expect(result.context).toEqual({});
  });

  it('a media captura SIN simulatedElapsedMinutes: comportamiento idéntico al de antes (sin aviso, sigue donde iba)', async () => {
    const result = await buildUseCase().execute({
      ...base,
      state: { currentNodeId: 'pedido_cantidad', context: { selected_product_id: 'p1' } },
    });

    expect(result.outputs).toEqual([{ kind: 'text', text: 'respuesta del flow' }]);
    const passedUser = interpreter.execute.mock.calls[0][0].user;
    expect(passedUser.currentNodeId).toBe('pedido_cantidad');
    expect(passedUser.context).toEqual({ selected_product_id: 'p1' });
    expect(result.context).toEqual({ selected_product_id: 'p1' });
  });

  it('primer mensaje de la conversación (sin currentNodeId) + simulatedElapsedMinutes=180: el gate NO se activa', async () => {
    const result = await buildUseCase().execute({
      ...base,
      simulatedElapsedMinutes: 180,
    });

    expect(result.outputs).toEqual([{ kind: 'text', text: 'respuesta del flow' }]);
    expect(businessHours.hadClosureBetween).not.toHaveBeenCalled();
  });

  it('flow ya terminado (currentNodeId="end") + simulatedElapsedMinutes=180: tampoco se activa (nada que expirar)', async () => {
    const result = await buildUseCase().execute({
      ...base,
      state: { currentNodeId: 'end', context: {} },
      simulatedElapsedMinutes: 180,
    });

    expect(result.outputs).toEqual([{ kind: 'text', text: 'respuesta del flow' }]);
    expect(businessHours.hadClosureBetween).not.toHaveBeenCalled();
  });

  it('a media captura con simulatedElapsedMinutes por DEBAJO del TTL (30 min): no expira', async () => {
    const result = await buildUseCase().execute({
      ...base,
      state: { currentNodeId: 'pedido_cantidad', context: { selected_product_id: 'p1' } },
      simulatedElapsedMinutes: 30,
    });

    expect(result.outputs).toEqual([{ kind: 'text', text: 'respuesta del flow' }]);
    const passedUser = interpreter.execute.mock.calls[0][0].user;
    expect(passedUser.currentNodeId).toBe('pedido_cantidad');
  });
});
