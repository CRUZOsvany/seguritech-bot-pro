/**
 * DEC-03 / B-04 (auditoría 2026-08-26): en el nodo `buscar`, `catalog_found`
 * evaluaba primero SIEMPRE (first-match-wins sobre transitions[0]) — un
 * servicio con precio escalonado (ej. "engargolado hasta 100 hojas $35, de
 * 100-200 $50") se contestaba con el precio unitario plano del producto en
 * `pos_products` en vez de la explicación completa del `tenant_service_directory`.
 *
 * Decisión tomada con Cris: condicional por categoría. `pos_products.unit_type`
 * ya soporta el valor 'service' desde la migración 011 (CHECK constraint) —
 * no hizo falta tocar el schema. Regla: si el producto que matchea el
 * catálogo es unit_type='service' Y el directorio tiene una respuesta real
 * para el mismo mensaje, gana el directorio. Si el directorio no tiene nada,
 * el producto igual gana (mejor una respuesta real que "no entendí").
 * Productos normales (unit_type != 'service') no cambian de comportamiento.
 *
 * Mismo patrón de stubs que FlowInterpreter.searchCatalog.test.ts, pero con
 * las 3 transiciones en el orden real de papeleria-flow.json: catalog_found
 * → service_directory_match → catalog_not_found.
 */
import type { Message, User, TenantConfig, ServiceDirectoryEntry } from '@/domain/entities';
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

function makeTenantConfig(serviceDirectory: ServiceDirectoryEntry[] = []): TenantConfig {
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
    serviceDirectory,
    horarioSemana: null,
    horarioSabado: null,
    abreDomingo: false,
    catalogSynonyms: {},
  };
}

function makeServiceEntry(overrides: Partial<ServiceDirectoryEntry> = {}): ServiceDirectoryEntry {
  return {
    id: 'svc-1',
    tenantId: 't1',
    nombre: 'Engargolado',
    keywords: ['engargolado', 'engargolar'],
    respuesta: 'Engargolado hasta 100 hojas $35, de 100-200 $50, entrega el mismo día',
    activo: true,
    orden: 0,
    ...overrides,
  };
}

function makePosProduct(overrides: Partial<PosProduct> = {}): PosProduct {
  return {
    id: 'pos-1',
    tenantId: 't1',
    sku: 'SKU-1',
    barcode: null,
    name: 'Engargolado',
    description: null,
    categoryId: null,
    unitType: 'service',
    unitPrice: 40,
    costPrice: null,
    taxRate: 0,
    stockQty: 0,
    stockMin: 0,
    trackStock: false,
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

/** Orden real de papeleria-flow.json: catalog_found → service_directory_match → catalog_not_found. */
function makeFlow(): BotFlow {
  return {
    version: '1.0',
    start_node_id: 'buscar',
    nodes: [
      {
        id: 'buscar',
        type: 'search_catalog',
        content: { prompt: '¿Qué buscas?' },
        transitions: [
          { condition: { type: 'catalog_found' }, next_node_id: 'buscar_encontrado' },
          { condition: { type: 'service_directory_match' }, next_node_id: 'buscar_servicio_encontrado' },
          { condition: { type: 'catalog_not_found' }, next_node_id: 'buscar_no_encontrado' },
        ],
      },
      {
        id: 'buscar_encontrado',
        type: 'send_text',
        content: { text: 'Producto: {{selected_product_name}} — ${{selected_product_price}}' },
        transitions: [],
      },
      {
        id: 'buscar_servicio_encontrado',
        type: 'send_text',
        content: { text: 'Servicio' },
        transitions: [],
      },
      {
        id: 'buscar_no_encontrado',
        type: 'escape_to_human',
        content: { user_response: 'Ya te comunico con alguien.', owner_alert_template: 'Sin match' },
        transitions: [],
      },
    ],
  };
}

describe('FlowInterpreter — prioridad catálogo vs directorio de servicios (DEC-03 / B-04)', () => {
  it('producto unit_type=service CON respuesta en el directorio: gana el directorio, no el catálogo', async () => {
    const servicioProducto = makePosProduct({ unitType: 'service' });
    const { interpreter } = makeInterpreter(servicioProducto);
    const flow = makeFlow();
    const user = makeUser({ currentNodeId: 'buscar', context: {} });

    const result = await interpreter.execute({
      flow,
      user,
      message: makeMessage('cuánto cuesta el engargolado'),
      tenantConfig: makeTenantConfig([makeServiceEntry()]),
    });

    expect(result.nextNodeId).toBe('buscar_servicio_encontrado');
    // No se escribió el contexto de catalog_found — el producto no "ganó".
    expect(result.contextUpdates.selected_product_id).toBeUndefined();
  });

  it('producto unit_type=service SIN respuesta en el directorio: el producto igual gana (mejor algo que nada)', async () => {
    const servicioProducto = makePosProduct({ unitType: 'service' });
    const { interpreter } = makeInterpreter(servicioProducto);
    const flow = makeFlow();
    const user = makeUser({ currentNodeId: 'buscar', context: {} });

    const result = await interpreter.execute({
      flow,
      user,
      message: makeMessage('cuánto cuesta el engargolado'),
      tenantConfig: makeTenantConfig([]), // directorio vacío
    });

    expect(result.nextNodeId).toBe('buscar_encontrado');
    expect(result.contextUpdates.selected_product_id).toBe('pos-1');
  });

  it('producto normal (unit_type != service): sin cambio de comportamiento, gana el catálogo aunque el directorio matchee', async () => {
    const productoNormal = makePosProduct({ id: 'pos-2', name: 'Cuaderno Profesional', unitType: 'piece' });
    const { interpreter } = makeInterpreter(productoNormal);
    const flow = makeFlow();
    const user = makeUser({ currentNodeId: 'buscar', context: {} });
    // Entrada de directorio deliberadamente colisiona con la misma palabra.
    const entry = makeServiceEntry({ nombre: 'EDGE', keywords: ['cuaderno'] });

    const result = await interpreter.execute({
      flow,
      user,
      message: makeMessage('cuaderno'),
      tenantConfig: makeTenantConfig([entry]),
    });

    expect(result.nextNodeId).toBe('buscar_encontrado');
    expect(result.contextUpdates.selected_product_id).toBe('pos-2');
  });
});
