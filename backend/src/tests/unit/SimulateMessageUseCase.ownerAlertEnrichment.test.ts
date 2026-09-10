/**
 * Depuración motor+simulador, Fase 2: la alerta al dueño que ve el operador
 * en el panel debe ser la MISMA que recibiría el dueño de verdad.
 *
 * Antes, `BotController.dispatchOutputs` enriquecía el `ownerAlert` (link
 * wa.me, hora, código `#listo XXXX`) con un método privado, y
 * `SimulateMessageUseCase` devolvía el `owner_alert_template` crudo del
 * flow. El formato se extrajo a `domain/services/OwnerAlertFormatter` y
 * ahora ambos caminos lo comparten.
 *
 * Mismo patrón de mocks que `SimulateMessageUseCase.test.ts`.
 */
import pino from 'pino';
import { SimulateMessageUseCase } from '@/domain/use-cases/SimulateMessageUseCase';
import { UserRepository, TenantConfigPort, BotFlowRepository } from '@/domain/ports';
import { FlowInterpreter } from '@/domain/services/FlowInterpreter';
import type { BusinessHoursService } from '@/domain/services/BusinessHoursService';
import type { TenantConfig } from '@/domain/entities';
import type { BotFlow } from '@/domain/entities/flow';

const logger = pino({ level: 'silent' });

const TENANT_ID = 't1';
const USER_PHONE = '+52 1 747 123 4567';

const minimalFlow: BotFlow = {
  version: '1.0',
  start_node_id: 'end',
  nodes: [{ id: 'end', type: 'end', content: {}, transitions: [] }],
};

describe('SimulateMessageUseCase — alerta al dueño enriquecida (Fase 2)', () => {
  let userRepository: jest.Mocked<UserRepository>;
  let tenantConfigPort: jest.Mocked<TenantConfigPort>;
  let botFlowRepository: jest.Mocked<BotFlowRepository>;
  let flowInterpreter: jest.Mocked<FlowInterpreter>;
  let businessHoursService: jest.Mocked<BusinessHoursService>;

  beforeEach(() => {
    userRepository = {
      findByPhoneNumber: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      resetUserState: jest.fn(),
    } as unknown as jest.Mocked<UserRepository>;

    tenantConfigPort = {
      getConfig: jest.fn().mockResolvedValue({} as TenantConfig),
    } as unknown as jest.Mocked<TenantConfigPort>;

    botFlowRepository = {
      findActiveByTenant: jest.fn().mockResolvedValue(minimalFlow),
    } as unknown as jest.Mocked<BotFlowRepository>;

    // Ningún test de este archivo manda `simulateAt` ni
    // `simulatedElapsedMinutes`: los gates no deben consultarse.
    businessHoursService = {
      isOpenNow: jest.fn(),
      hadClosureBetween: jest.fn(),
    } as unknown as jest.Mocked<BusinessHoursService>;

    flowInterpreter = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<FlowInterpreter>;
  });

  function buildUseCase() {
    return new SimulateMessageUseCase(
      userRepository,
      tenantConfigPort,
      botFlowRepository,
      flowInterpreter,
      businessHoursService,
      logger,
    );
  }

  const base = {
    tenantId: TENANT_ID,
    phoneNumber: USER_PHONE,
    content: 'necesito hablar con alguien',
    persist: false,
  };

  it('un output escape_to_human sale con el ownerAlert enriquecido (wa.me + hora + #listo)', async () => {
    flowInterpreter.execute.mockResolvedValue({
      outputs: [
        {
          kind: 'escape_to_human',
          userResponse: 'Ya le avisé al encargado 🙂',
          ownerAlert: 'texto de prueba',
        },
      ],
      nextNodeId: 'end',
      contextUpdates: {},
      flowEnded: false,
    });

    const result = await buildUseCase().execute({ ...base });

    expect(result.outputs).toHaveLength(1);
    const out = result.outputs[0];
    expect(out.kind).toBe('escape_to_human');
    if (out.kind !== 'escape_to_human') throw new Error('output inesperado');

    // El texto escrito a mano en el flow se conserva íntegro…
    expect(out.ownerAlert).toContain('texto de prueba');
    // …y encima trae el pie fijo que arma OwnerAlertFormatter.
    expect(out.ownerAlert).toContain('wa.me/');
    // Los dígitos del teléfono van normalizados (sin +, espacios ni guiones).
    expect(out.ownerAlert).toContain('wa.me/5217471234567');
    expect(out.ownerAlert).toMatch(/\b\d{2}:\d{2}\b/);
    expect(out.ownerAlert).toContain('#listo 4567');
    // El mensaje que ve el CLIENTE no se toca.
    expect(out.userResponse).toBe('Ya le avisé al encargado 🙂');
  });

  it('sin ningún escape_to_human, los outputs se devuelven sin modificación', async () => {
    const originalOutputs = [
      { kind: 'text' as const, text: 'hola' },
      {
        kind: 'buttons' as const,
        text: '¿Qué necesitas?',
        buttons: [{ id: 'b1', title: 'Pedido' }],
      },
    ];
    flowInterpreter.execute.mockResolvedValue({
      outputs: originalOutputs,
      nextNodeId: 'end',
      contextUpdates: {},
      flowEnded: false,
    });

    const result = await buildUseCase().execute({ ...base });

    expect(result.outputs).toEqual(originalOutputs);
  });
});
