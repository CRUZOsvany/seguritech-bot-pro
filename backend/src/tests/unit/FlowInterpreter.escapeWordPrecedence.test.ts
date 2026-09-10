/**
 * Depuración motor+simulador, Fase 1: precedencia de ESCAPE_WORDS.
 *
 * Antes, el "Caso 1" de `FlowInterpreter.execute` (palabra de escape global
 * → reset total del flow) corría SIEMPRE antes que las transiciones propias
 * del nodo. Eso rompía dos casos reales de `backend/scripts/papeleria-flow.json`:
 *
 *  - En `pedido_confirma`, "cancelar" reseteaba TODO el contexto en vez de
 *    caer en la transición local que devuelve a `pedido_cantidad`
 *    preservando `selected_product_id`.
 *  - En `bienvenida`, la transición `{keyword:['salir',...]} → despedida`
 *    era código muerto para la palabra exacta "salir".
 *
 * Regla nueva: el escape global solo aplica si el nodo actual NO tiene una
 * transición propia (distinta de `default`) que matchee el mensaje.
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
    nombreNegocio: 'Test',
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

/**
 * Forma reducida de `pedido_confirma`: el nodo actual sabe qué hacer con
 * "cancelar" por sí mismo. `withLocalKeyword=false` deja solo el `default`,
 * que es el caso en que el escape global SÍ debe ganar.
 */
function makePedidoFlow(withLocalKeyword: boolean): BotFlow {
  return {
    version: '1.0',
    start_node_id: 'bienvenida',
    nodes: [
      { id: 'bienvenida', type: 'send_text', content: { text: 'Hola' }, transitions: [] },
      {
        id: 'pedido_confirma',
        type: 'send_buttons',
        content: {
          text: '¿Es correcto? 5 × Cuaderno',
          buttons: [{ id: 'si', title: 'Sí' }],
        },
        transitions: [
          ...(withLocalKeyword
            ? [
              {
                condition: { type: 'keyword' as const, values: ['cancelar', 'no', 'corregir'] },
                next_node_id: 'pedido_cantidad',
              },
            ]
            : []),
          { condition: { type: 'default' as const }, next_node_id: 'pedido_listo' },
        ],
      },
      {
        id: 'pedido_cantidad',
        type: 'wait_input',
        content: { prompt: '¿Cuántas piezas?' },
        transitions: [],
      },
      { id: 'pedido_listo', type: 'send_text', content: { text: 'Listo' }, transitions: [] },
    ],
  };
}

describe('FlowInterpreter — precedencia de ESCAPE_WORDS vs transición local (Fase 1)', () => {
  it('el nodo actual tiene transición propia para "cancelar": gana la intención local, no resetea', async () => {
    const flow = makePedidoFlow(true);
    const interpreter = makeInterpreter();
    const user = makeUser({
      currentNodeId: 'pedido_confirma',
      context: { selected_product_id: 'p1', cantidad_producto: '5' },
    });

    const result = await interpreter.execute({
      flow,
      user,
      message: makeMessage('cancelar'),
      tenantConfig: makeTenantConfig(),
    });

    expect(result.nextNodeId).toBe('pedido_cantidad');
    expect(result.nextNodeId).not.toBe(flow.start_node_id);
    // El contexto previo queda intacto: no debe llegar `null` a ninguna clave.
    expect(result.contextUpdates.selected_product_id).toBeUndefined();
    expect(result.contextUpdates.cantidad_producto).toBeUndefined();
    expect(Object.values(result.contextUpdates)).not.toContain(null);
  });

  it('el nodo actual solo tiene `default`: el escape global sigue aplicando (reset con contexto limpio)', async () => {
    const flow = makePedidoFlow(false);
    const interpreter = makeInterpreter();
    const user = makeUser({
      currentNodeId: 'pedido_confirma',
      context: { selected_product_id: 'p1', cantidad_producto: '5' },
    });

    const result = await interpreter.execute({
      flow,
      user,
      message: makeMessage('cancelar'),
      tenantConfig: makeTenantConfig(),
    });

    expect(result.nextNodeId).toBe('bienvenida');
    expect(result.contextUpdates.selected_product_id).toBeNull();
    expect(result.contextUpdates.cantidad_producto).toBeNull();
  });

  it('caso literal del bug: "salir" en `bienvenida` llega a `despedida`, no reinicia el flow', async () => {
    const flow: BotFlow = {
      version: '1.0',
      start_node_id: 'bienvenida',
      nodes: [
        {
          id: 'bienvenida',
          type: 'send_text',
          content: { text: '¿En qué te ayudo?' },
          transitions: [
            {
              condition: { type: 'keyword', values: ['salir', 'gracias', 'eso es todo'] },
              next_node_id: 'despedida',
            },
            { condition: { type: 'default' }, next_node_id: 'no_entendi' },
          ],
        },
        { id: 'despedida', type: 'send_text', content: { text: 'Hasta pronto' }, transitions: [] },
        { id: 'no_entendi', type: 'send_text', content: { text: 'No entendí' }, transitions: [] },
      ],
    };
    const interpreter = makeInterpreter();
    const user = makeUser({ currentNodeId: 'bienvenida', context: {} });

    const result = await interpreter.execute({
      flow,
      user,
      message: makeMessage('salir'),
      tenantConfig: makeTenantConfig(),
    });

    expect(result.nextNodeId).toBe('despedida');
  });

  it('"gracias" (no es escape word) sigue llegando a `despedida` igual que siempre', async () => {
    const flow: BotFlow = {
      version: '1.0',
      start_node_id: 'bienvenida',
      nodes: [
        {
          id: 'bienvenida',
          type: 'send_text',
          content: { text: '¿En qué te ayudo?' },
          transitions: [
            {
              condition: { type: 'keyword', values: ['salir', 'gracias'] },
              next_node_id: 'despedida',
            },
            { condition: { type: 'default' }, next_node_id: 'no_entendi' },
          ],
        },
        { id: 'despedida', type: 'send_text', content: { text: 'Hasta pronto' }, transitions: [] },
        { id: 'no_entendi', type: 'send_text', content: { text: 'No entendí' }, transitions: [] },
      ],
    };
    const interpreter = makeInterpreter();
    const user = makeUser({ currentNodeId: 'bienvenida', context: {} });

    const result = await interpreter.execute({
      flow,
      user,
      message: makeMessage('gracias'),
      tenantConfig: makeTenantConfig(),
    });

    expect(result.nextNodeId).toBe('despedida');
  });

  it('regresión DEC-06: button sigue ganando sobre keyword (el scoring no se rompió)', async () => {
    const flow: BotFlow = {
      version: '1.0',
      start_node_id: 'menu',
      nodes: [
        {
          id: 'menu',
          type: 'send_buttons',
          content: { text: '¿Qué necesitas?', buttons: [{ id: 'buscar', title: 'Buscar' }] },
          transitions: [
            // Orden deliberadamente "equivocado": la genérica va primero.
            { condition: { type: 'keyword', values: ['buscar'] }, next_node_id: 'via_keyword' },
            { condition: { type: 'button', value: 'buscar' }, next_node_id: 'via_button' },
            { condition: { type: 'default' }, next_node_id: 'via_default' },
          ],
        },
        { id: 'via_keyword', type: 'send_text', content: { text: 'via_keyword' }, transitions: [] },
        { id: 'via_button', type: 'send_text', content: { text: 'via_button' }, transitions: [] },
        { id: 'via_default', type: 'send_text', content: { text: 'via_default' }, transitions: [] },
      ],
    };
    const interpreter = makeInterpreter();
    const user = makeUser({ currentNodeId: 'menu', context: {} });

    const result = await interpreter.execute({
      flow,
      user,
      message: makeMessage('buscar'),
      tenantConfig: makeTenantConfig(),
    });

    expect(result.nextNodeId).toBe('via_button');
  });

  it('usuario nuevo (sin currentNodeId) con palabra de escape: sigue arrancando en start_node_id', async () => {
    const flow = makePedidoFlow(true);
    const interpreter = makeInterpreter();
    const user = makeUser({ currentNodeId: undefined, context: {} });

    const result = await interpreter.execute({
      flow,
      user,
      message: makeMessage('menu'),
      tenantConfig: makeTenantConfig(),
    });

    expect(result.nextNodeId).toBe('bienvenida');
  });

  it('nodo search_catalog: "menu" resetea al start, NO se absorbe como catalog_not_found', async () => {
    // Forma real del nodo `buscar` de backend/scripts/papeleria-flow.json:
    // sus únicas transiciones son catalog_found / service_directory_match /
    // catalog_not_found — ninguna `default`. `catalog_not_found` es TRUE por
    // ausencia de cómputo (el pre-chequeo del escape no corre
    // CatalogSearchService), así que sin la exclusión explícita cualquier
    // palabra de escape quedaba absorbida como "búsqueda sin resultado".
    const flow: BotFlow = {
      version: '1.0',
      start_node_id: 'bienvenida',
      nodes: [
        { id: 'bienvenida', type: 'send_text', content: { text: 'Hola' }, transitions: [] },
        {
          id: 'buscar',
          type: 'search_catalog',
          content: { prompt: '🔍 ¿Qué producto buscas?' },
          transitions: [
            {
              condition: { type: 'catalog_found', save_to_context: 'selected_product_id' },
              next_node_id: 'buscar_encontrado',
            },
            {
              condition: { type: 'service_directory_match', save_to_context: 'matched_service_id' },
              next_node_id: 'buscar_servicio_encontrado',
            },
            { condition: { type: 'catalog_not_found' }, next_node_id: 'buscar_no_encontrado' },
          ],
        },
        { id: 'buscar_encontrado', type: 'send_text', content: { text: 'ok' }, transitions: [] },
        {
          id: 'buscar_servicio_encontrado',
          type: 'send_text',
          content: { text: 'servicio' },
          transitions: [],
        },
        {
          id: 'buscar_no_encontrado',
          type: 'send_text',
          content: { text: 'no encontrado' },
          transitions: [],
        },
      ],
    };
    const interpreter = makeInterpreter();
    const user = makeUser({ currentNodeId: 'buscar', context: { algo: 'previo' } });

    const result = await interpreter.execute({
      flow,
      user,
      // "menu" no matchea ningún producto (el stub de CatalogSearchService
      // devuelve null) ni ninguna entrada del directorio (vacío en el config
      // de prueba).
      message: makeMessage('menu'),
      tenantConfig: makeTenantConfig(),
    });

    expect(result.nextNodeId).toBe('bienvenida');
    expect(result.nextNodeId).not.toBe('buscar_no_encontrado');
    // Reset de verdad: el contexto previo se limpia, como en cualquier
    // palabra de escape que sí aplica.
    expect(result.contextUpdates.algo).toBeNull();
  });
});
