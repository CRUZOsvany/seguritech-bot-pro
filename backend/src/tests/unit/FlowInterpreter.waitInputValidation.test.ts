/**
 * Depuración motor+simulador, Fase 4 — cierra C-04 del tracker de auditoría.
 *
 * `wait_input` aceptaba cualquier texto libre sin validar, incluso donde el
 * flow espera un número: un cliente que escribía "no sé cuántas" en
 * `pedido_cantidad` lo veía interpolado tal cual en la alerta al dueño
 * (`🛒 PEDIDO: no sé cuántas × Cuaderno…`).
 *
 * Alcance deliberadamente chico: un solo tipo de validación (`numeric`),
 * declarado por el flow en `content.validation`. NO es el sistema genérico
 * de validación de flows (eso sigue siendo DEC-11/E-01).
 *
 * Mismo patrón de stubs que FlowInterpreter.searchCatalog.test.ts.
 */
import type { Message, User, TenantConfig } from '@/domain/entities';
import { BotTone, UserState } from '@/domain/entities';
import type { BotFlow } from '@/domain/entities/flow';
import { FlowInterpreter } from '@/domain/services/FlowInterpreter';
import { VariableResolver } from '@/domain/services/VariableResolver';
import { DynamicSectionResolver } from '@/domain/services/DynamicSectionResolver';
import { CarouselCardResolver } from '@/domain/services/CarouselCardResolver';
import { ServiceDirectoryMatcher } from '@/domain/services/ServiceDirectoryMatcher';
import type { CatalogSearchService } from '@/domain/services/CatalogSearchService';
import pino from 'pino';

const logger = pino({ level: 'silent' });

const GENERIC_ERROR =
  'No logré entender la cantidad 🤔. Escríbela solo con el número, por ejemplo: *3*';

function makeUser(overrides?: Partial<User>): User {
  return {
    id: 'u1',
    tenantId: 't1',
    phoneNumber: '521234567890',
    currentState: UserState.INITIAL,
    context: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeMessage(content: string): Message {
  return { id: 'm1', tenantId: 't1', from: '521234567890', content, timestamp: new Date() };
}

function makeTenantConfig(): TenantConfig {
  return {
    tenantId: 't1',
    botName: 'TestBot',
    nombreNegocio: 'Papelería Prueba',
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
    catalogSynonyms: {},
  };
}

const mockVR = { resolve: async (t: string) => t } as unknown as VariableResolver;
const mockDSR = new DynamicSectionResolver(logger);
const serviceDirectoryMatcher = new ServiceDirectoryMatcher();
const catalogSearchService = {
  search: jest.fn().mockResolvedValue(null),
} as unknown as CatalogSearchService;

function makeInterpreter(): FlowInterpreter {
  return new FlowInterpreter(mockVR, mockDSR, new CarouselCardResolver(logger), serviceDirectoryMatcher, catalogSearchService, logger);
}

/** Forma reducida de `pedido_cantidad` del flow de papelería. */
function makeFlow(
  content: {
    prompt?: string;
    save_to_context?: string;
    validation?: 'numeric';
    validation_error?: string;
  },
): BotFlow {
  return {
    version: '1.0',
    start_node_id: 'pedido_cantidad',
    nodes: [
      {
        id: 'pedido_cantidad',
        type: 'wait_input',
        content,
        transitions: [{ condition: { type: 'default' }, next_node_id: 'pedido_confirma' }],
      },
      {
        id: 'pedido_confirma',
        type: 'send_text',
        content: { text: 'Tu pedido: {{cantidad_producto}} piezas' },
        transitions: [],
      },
    ],
  };
}

const validatedContent = {
  prompt: '¿Cuántas piezas quieres?',
  save_to_context: 'cantidad_producto',
  validation: 'numeric' as const,
  validation_error: 'texto de prueba',
};

describe('FlowInterpreter — validación numérica de wait_input (Fase 4 / C-04)', () => {
  it('texto no numérico: re-renderiza el nodo con validation_error, no avanza y no guarda contexto', async () => {
    const interpreter = makeInterpreter();
    const user = makeUser({ currentNodeId: 'pedido_cantidad' });

    const result = await interpreter.execute({
      flow: makeFlow(validatedContent),
      user,
      message: makeMessage('cinco'),
      tenantConfig: makeTenantConfig(),
    });

    expect(result.outputs).toEqual([{ kind: 'text', text: 'texto de prueba' }]);
    expect(result.nextNodeId).toBe('pedido_cantidad');
    expect(result.contextUpdates).toEqual({});
    expect(result.flowEnded).toBe(false);
  });

  it('texto numérico: avanza por la transición default y guarda save_to_context', async () => {
    const interpreter = makeInterpreter();
    const user = makeUser({ currentNodeId: 'pedido_cantidad' });

    const result = await interpreter.execute({
      flow: makeFlow(validatedContent),
      user,
      message: makeMessage('5'),
      tenantConfig: makeTenantConfig(),
    });

    expect(result.nextNodeId).toBe('pedido_confirma');
    expect(result.contextUpdates).toEqual({ cantidad_producto: '5' });
  });

  it.each(['3.5', '3,5'])('decimal "%s" (punto y coma, como se escribe en México) es válido', async (input) => {
    const interpreter = makeInterpreter();
    const user = makeUser({ currentNodeId: 'pedido_cantidad' });

    const result = await interpreter.execute({
      flow: makeFlow(validatedContent),
      user,
      message: makeMessage(input),
      tenantConfig: makeTenantConfig(),
    });

    expect(result.nextNodeId).toBe('pedido_confirma');
    expect(result.contextUpdates).toEqual({ cantidad_producto: input });
  });

  it('nodo SIN content.validation: cualquier texto libre se guarda igual que siempre (regresión)', async () => {
    const interpreter = makeInterpreter();
    const user = makeUser({ currentNodeId: 'pedido_cantidad' });

    const result = await interpreter.execute({
      flow: makeFlow({
        prompt: '¿Cuántas piezas quieres?',
        save_to_context: 'cantidad_producto',
      }),
      user,
      message: makeMessage('no sé cuántas'),
      tenantConfig: makeTenantConfig(),
    });

    expect(result.nextNodeId).toBe('pedido_confirma');
    expect(result.contextUpdates).toEqual({ cantidad_producto: 'no sé cuántas' });
  });

  it('sin validation_error declarado: usa el mensaje genérico por default', async () => {
    const interpreter = makeInterpreter();
    const user = makeUser({ currentNodeId: 'pedido_cantidad' });

    const result = await interpreter.execute({
      flow: makeFlow({
        prompt: '¿Cuántas piezas quieres?',
        save_to_context: 'cantidad_producto',
        validation: 'numeric',
      }),
      user,
      message: makeMessage('las que sean'),
      tenantConfig: makeTenantConfig(),
    });

    expect(result.outputs).toEqual([{ kind: 'text', text: GENERIC_ERROR }]);
    expect(result.nextNodeId).toBe('pedido_cantidad');
    expect(result.contextUpdates).toEqual({});
  });
});
