/**
 * search_catalog / catalog_found / catalog_not_found (§2.1 del plan V1).
 *
 * Mismo patrón de stubs que v23Nodes.test.ts: VariableResolver pasa el texto
 * sin modificar, CatalogSearchService es un stub controlado por test.
 */
import type { Message, User, TenantConfig } from '@/domain/entities';
import { BotTone, UserState } from '@/domain/entities';
import type { BotFlow } from '@/domain/entities/flow';
import type { PosProduct } from '@/domain/entities/pos/Product';
import { FlowInterpreter } from '@/domain/services/FlowInterpreter';
import { VariableResolver } from '@/domain/services/VariableResolver';
import { DynamicSectionResolver } from '@/domain/services/DynamicSectionResolver';
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
    nombreNegocio: 'Ferretería Prueba',
    tone: BotTone.AMIGABLE,
    welcomeMessage: 'Hola',
    menuMessage: 'Menú',
    outOfHoursMessage: 'Fuera de horario',
    notUnderstoodMessage: 'No entendí',
    orderConfirmationMessage: 'Pedido confirmado',
    catalog: [],
    serviceDirectory: [],
  };
}

function makePosProduct(overrides: Partial<PosProduct> = {}): PosProduct {
  return {
    id: 'pos-1',
    tenantId: 't1',
    sku: 'SKU-1',
    barcode: null,
    name: 'Tornillo Estrella 2 pulgadas',
    description: null,
    categoryId: null,
    unitType: 'piece',
    unitPrice: 3.5,
    costPrice: null,
    taxRate: 0,
    stockQty: 100,
    stockMin: 10,
    trackStock: true,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

const mockVR = { resolve: async (t: string) => t } as unknown as VariableResolver;
const mockDSR = new DynamicSectionResolver(logger);
const serviceDirectoryMatcher = new ServiceDirectoryMatcher();

function makeInterpreter(matchResult: PosProduct | null): {
  interpreter: FlowInterpreter;
  searchSpy: jest.Mock;
} {
  const searchSpy = jest.fn().mockResolvedValue(matchResult);
  const catalogSearchService = { search: searchSpy } as unknown as CatalogSearchService;
  const interpreter = new FlowInterpreter(
    mockVR,
    mockDSR,
    serviceDirectoryMatcher,
    catalogSearchService,
    logger,
  );
  return { interpreter, searchSpy };
}

/** Flow: search node en espera → catalog_found a 'found', catalog_not_found a 'human'. */
function makeFlow(): BotFlow {
  return {
    version: '1.0',
    start_node_id: 'search',
    nodes: [
      {
        id: 'search',
        type: 'search_catalog',
        content: { prompt: '¿Qué buscas?' },
        transitions: [
          { condition: { type: 'catalog_found' }, next_node_id: 'found' },
          { condition: { type: 'catalog_not_found' }, next_node_id: 'human' },
        ],
      },
      {
        id: 'found',
        type: 'send_text',
        content: { text: 'Encontrado: {{selected_product_name}} — ${{selected_product_price}}' },
        transitions: [{ condition: { type: 'default' }, next_node_id: 'end' }],
      },
      {
        id: 'human',
        type: 'escape_to_human',
        content: { user_response: 'Ya te comunico con alguien.', owner_alert_template: 'Cliente sin match' },
        transitions: [],
      },
      { id: 'end', type: 'end', content: {}, transitions: [] },
    ],
  };
}

describe('FlowInterpreter — search_catalog', () => {
  it('renderiza el prompt y queda en espera (WAIT_NODE_TYPES)', async () => {
    const { interpreter, searchSpy } = makeInterpreter(null);
    const flow = makeFlow();
    const user = makeUser({ currentNodeId: undefined });

    const result = await interpreter.execute({
      flow,
      user,
      message: makeMessage('hola'),
      tenantConfig: makeTenantConfig(),
    });

    expect(result.nextNodeId).toBe('search');
    expect(result.outputs).toEqual([{ kind: 'text', text: '¿Qué buscas?' }]);
    // El nodo aún no recibió la pregunta real del cliente — no debe buscar todavía.
    expect(searchSpy).not.toHaveBeenCalled();
  });

  it('catalog_found: guarda selected_product_id en contexto y avanza al nodo de éxito', async () => {
    const product = makePosProduct();
    const { interpreter, searchSpy } = makeInterpreter(product);
    const flow = makeFlow();
    const user = makeUser({ currentNodeId: 'search', context: {} });

    const result = await interpreter.execute({
      flow,
      user,
      message: makeMessage('tornillo estrella'),
      tenantConfig: makeTenantConfig(),
    });

    expect(searchSpy).toHaveBeenCalledWith('t1', 'tornillo estrella');
    expect(result.contextUpdates.selected_product_id).toBe('pos-1');
    expect(result.nextNodeId).toBe('end');
    expect(result.outputs[0]).toEqual({
      kind: 'text',
      text: 'Encontrado: {{selected_product_name}} — ${{selected_product_price}}',
    });
  });

  it('catalog_not_found: sin match, transiciona a escape_to_human sin escribir contexto', async () => {
    const { interpreter, searchSpy } = makeInterpreter(null);
    const flow = makeFlow();
    const user = makeUser({ currentNodeId: 'search', context: {} });

    const result = await interpreter.execute({
      flow,
      user,
      message: makeMessage('algo que no existe'),
      tenantConfig: makeTenantConfig(),
    });

    expect(searchSpy).toHaveBeenCalledWith('t1', 'algo que no existe');
    expect(result.contextUpdates.selected_product_id).toBeUndefined();
    // escape_to_human sin transitions[] propias termina el flow (mismo
    // comportamiento que cualquier nodo sin salida — ver humanHandoff.test.ts).
    expect(result.flowEnded).toBe(true);
    expect(result.outputs[0]).toMatchObject({ kind: 'escape_to_human' });
  });

  it('catalog_found respeta save_to_context explícito si el flow lo declara', async () => {
    const product = makePosProduct();
    const { interpreter } = makeInterpreter(product);
    const flow = makeFlow();
    flow.nodes[0].transitions[0] = {
      condition: { type: 'catalog_found', save_to_context: 'custom_key' },
      next_node_id: 'found',
    };
    const user = makeUser({ currentNodeId: 'search', context: {} });

    const result = await interpreter.execute({
      flow,
      user,
      message: makeMessage('tornillo'),
      tenantConfig: makeTenantConfig(),
    });

    expect(result.contextUpdates.custom_key).toBe('pos-1');
    expect(result.contextUpdates.selected_product_id).toBeUndefined();
  });

  it('la búsqueda se ejecuta UNA sola vez por mensaje aunque haya varias transiciones', async () => {
    const { interpreter, searchSpy } = makeInterpreter(null);
    const flow = makeFlow();
    const user = makeUser({ currentNodeId: 'search', context: {} });

    await interpreter.execute({
      flow,
      user,
      message: makeMessage('x'),
      tenantConfig: makeTenantConfig(),
    });

    expect(searchSpy).toHaveBeenCalledTimes(1);
  });
});
