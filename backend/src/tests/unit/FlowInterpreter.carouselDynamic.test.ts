/**
 * Carrusel con cards hidratadas desde el catálogo del tenant.
 *
 * Hermano de FlowInterpreter.carousel.test.ts, que cubre el bucle cerrado de
 * un carrusel de cards literales. Aquí se prueba el camino dinámico completo:
 * hidratación desde `catalog_items`, routing con `card_any` (un carrusel de
 * catálogo no puede usar `button`: los ids los genera el resolver en runtime,
 * no los escribe el autor del flow) y el desvío al `default` cuando no hay
 * cards que enviar.
 */

import type { CatalogItem, Message, User, TenantConfig } from '@/domain/entities';
import { BotTone, UserState } from '@/domain/entities';
import type { BotFlow } from '@/domain/entities/flow';
import { FlowInterpreter } from '@/domain/services/FlowInterpreter';
import type { VariableResolver } from '@/domain/services/VariableResolver';
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
  return {
    id: 'm1',
    tenantId: 't1',
    from: '521234567890',
    content,
    timestamp: new Date(),
  };
}

function makeItem(id: string, name: string, price: number, imageUrl?: string): CatalogItem {
  return {
    id,
    name,
    description: '',
    price,
    category: '',
    available: true,
    ...(imageUrl ? { imageUrl } : {}),
  };
}

function makeConfig(catalog: CatalogItem[], fallbackImageUrl?: string): TenantConfig {
  return {
    tenantId: 't1',
    botName: 'TestBot',
    nombreNegocio: 'Papeleria Test',
    tone: BotTone.AMIGABLE,
    welcomeMessage: 'Hola',
    menuMessage: 'Menu',
    outOfHoursMessage: 'Cerrado',
    notUnderstoodMessage: 'No entendi',
    orderConfirmationMessage: 'Confirmado',
    catalog,
    ...(fallbackImageUrl ? { fallbackImageUrl } : {}),
    serviceDirectory: [],
    horarioSemana: null,
    horarioSabado: null,
    abreDomingo: false,
    catalogSynonyms: {},
  };
}

const mockVR = { resolve: async (t: string) => t } as unknown as VariableResolver;
const mockCatalogSearch = { search: async () => null } as unknown as CatalogSearchService;

function makeInterpreter(): FlowInterpreter {
  return new FlowInterpreter(
    mockVR,
    new DynamicSectionResolver(logger),
    new CarouselCardResolver(logger),
    new ServiceDirectoryMatcher(),
    mockCatalogSearch,
    logger,
  );
}

const CATALOGO = [
  makeItem('prod-cuaderno', 'Cuaderno profesional', 34.5, 'https://cdn.test/c.jpg'),
  makeItem('prod-pluma', 'Pluma azul', 12, 'https://cdn.test/p.jpg'),
];

/** Carrusel de catálogo enrutado con card_any. */
function makeDynamicFlow(saveTo?: string): BotFlow {
  return {
    version: '1.0',
    start_node_id: 'catalogo',
    nodes: [
      {
        id: 'catalogo',
        type: 'send_media_carousel',
        content: {
          body: 'Esto es lo que tenemos',
          dynamic_cards: { cards_source: 'catalog_items', button_title: 'Lo quiero' },
        },
        transitions: [
          {
            condition: { type: 'card_any', ...(saveTo ? { save_to_context: saveTo } : {}) },
            next_node_id: 'confirmar',
          },
          { condition: { type: 'default' }, next_node_id: 'sin_catalogo' },
        ],
      },
      {
        id: 'confirmar',
        type: 'send_text',
        content: { text: 'Anotado' },
        transitions: [{ condition: { type: 'default' }, next_node_id: 'fin' }],
      },
      {
        id: 'sin_catalogo',
        type: 'send_text',
        content: { text: 'Todavia no tenemos catalogo en linea' },
        transitions: [{ condition: { type: 'default' }, next_node_id: 'fin' }],
      },
      { id: 'fin', type: 'end', content: {}, transitions: [] },
    ],
  };
}

// ============================================================================
// HIDRATACION
// ============================================================================

describe('carrusel dinamico - hidratacion desde catalogo', () => {
  it('genera una card por producto y espera el tap', async () => {
    const result = await makeInterpreter().execute({
      flow: makeDynamicFlow(),
      user: makeUser(),
      message: makeMessage('hola'),
      tenantConfig: makeConfig(CATALOGO),
    });

    expect(result.nextNodeId).toBe('catalogo');
    expect(result.outputs).toHaveLength(1);

    const out = result.outputs[0];
    if (out.kind !== 'media_carousel') throw new Error(`kind inesperado: ${out.kind}`);
    expect(out.cards).toHaveLength(2);
    expect(out.cards[0].body).toBe('Cuaderno profesional\n$34.50');
    expect(out.cards[0].buttons[0]).toEqual({
      type: 'quick_reply',
      id: 'prod-cuaderno',
      title: 'Lo quiero',
    });
  });

  it('con imagen de respaldo, los productos sin foto tambien generan card', async () => {
    const sinFotos = [makeItem('prod-a', 'Sin foto A', 10), makeItem('prod-b', 'Sin foto B', 20)];
    const result = await makeInterpreter().execute({
      flow: makeDynamicFlow(),
      user: makeUser(),
      message: makeMessage('hola'),
      tenantConfig: makeConfig(sinFotos, 'https://cdn.test/logo.jpg'),
    });

    const out = result.outputs[0];
    if (out.kind !== 'media_carousel') throw new Error(`kind inesperado: ${out.kind}`);
    expect(out.cards).toHaveLength(2);
    expect(out.cards.every((c) => c.header.link === 'https://cdn.test/logo.jpg')).toBe(true);
  });
});

// ============================================================================
// ROUTING CON card_any
// ============================================================================

describe('carrusel dinamico - routing con card_any', () => {
  it('enruta el tap y guarda el id en selected_product_id por defecto', async () => {
    const result = await makeInterpreter().execute({
      flow: makeDynamicFlow(),
      user: makeUser({ currentNodeId: 'catalogo' }),
      message: makeMessage('prod-pluma'),
      tenantConfig: makeConfig(CATALOGO),
    });

    expect(result.outputs[0]).toEqual({ kind: 'text', text: 'Anotado' });
    // El id del producto en contexto es lo que deja resolver
    // {{selected_product_name}} / {{selected_product_price}} despues.
    expect(result.contextUpdates).toEqual({ selected_product_id: 'prod-pluma' });
  });

  it('respeta un save_to_context explicito', async () => {
    const result = await makeInterpreter().execute({
      flow: makeDynamicFlow('producto_elegido'),
      user: makeUser({ currentNodeId: 'catalogo' }),
      message: makeMessage('prod-cuaderno'),
      tenantConfig: makeConfig(CATALOGO),
    });

    expect(result.contextUpdates).toEqual({ producto_elegido: 'prod-cuaderno' });
  });

  it('un id que no esta en el catalogo del tenant no matchea', async () => {
    const result = await makeInterpreter().execute({
      flow: makeDynamicFlow(),
      user: makeUser({ currentNodeId: 'catalogo' }),
      message: makeMessage('prod-de-otro-tenant'),
      tenantConfig: makeConfig(CATALOGO),
    });

    expect(result.outputs[0]).toEqual({
      kind: 'text',
      text: 'Todavia no tenemos catalogo en linea',
    });
    expect(result.contextUpdates).toEqual({});
  });

  it('un producto que dejo de estar disponible no matchea aunque el id exista', async () => {
    // El catalogo pudo cambiar entre el envio del carrusel y el tap del
    // cliente: la validacion va contra el catalogo vivo, no contra lo que se
    // renderizo.
    const agotado = [{ ...CATALOGO[1], available: false }, CATALOGO[0]];
    const result = await makeInterpreter().execute({
      flow: makeDynamicFlow(),
      user: makeUser({ currentNodeId: 'catalogo' }),
      message: makeMessage('prod-pluma'),
      tenantConfig: makeConfig(agotado),
    });

    expect(result.outputs[0]).toEqual({
      kind: 'text',
      text: 'Todavia no tenemos catalogo en linea',
    });
  });

  it('el button_title compartido no enruta - solo el id distingue una card de otra', async () => {
    const result = await makeInterpreter().execute({
      flow: makeDynamicFlow(),
      user: makeUser({ currentNodeId: 'catalogo' }),
      message: makeMessage('Lo quiero'),
      tenantConfig: makeConfig(CATALOGO),
    });

    expect(result.outputs[0]).toEqual({
      kind: 'text',
      text: 'Todavia no tenemos catalogo en linea',
    });
  });
});

// ============================================================================
// CARRUSEL VACIO
// ============================================================================

describe('carrusel dinamico - sin cards que enviar', () => {
  it('catalogo vacio: no se envia el carrusel y se toma el default', async () => {
    const result = await makeInterpreter().execute({
      flow: makeDynamicFlow(),
      user: makeUser(),
      message: makeMessage('hola'),
      tenantConfig: makeConfig([]),
    });

    // Meta exige 1-10 cards: mandar un carrusel vacio seria un 400.
    expect(result.outputs.map((o) => o.kind)).toEqual(['text']);
    expect(result.outputs[0]).toEqual({
      kind: 'text',
      text: 'Todavia no tenemos catalogo en linea',
    });
  });

  it('catalogo sin fotos ni respaldo se comporta como catalogo vacio', async () => {
    const sinFotos = [makeItem('prod-a', 'Sin foto A', 10), makeItem('prod-b', 'Sin foto B', 20)];
    const result = await makeInterpreter().execute({
      flow: makeDynamicFlow(),
      user: makeUser(),
      message: makeMessage('hola'),
      tenantConfig: makeConfig(sinFotos),
    });

    expect(result.outputs.map((o) => o.kind)).toEqual(['text']);
  });

  it('sin transicion default, un carrusel vacio no avanza ni envia nada', async () => {
    const flow = makeDynamicFlow();
    const nodo = flow.nodes.find((n) => n.id === 'catalogo')!;
    nodo.transitions = [{ condition: { type: 'card_any' }, next_node_id: 'confirmar' }];

    const result = await makeInterpreter().execute({
      flow,
      user: makeUser(),
      message: makeMessage('hola'),
      tenantConfig: makeConfig([]),
    });

    expect(result.outputs).toEqual([]);
    expect(result.nextNodeId).toBe('catalogo');
    expect(result.flowEnded).toBe(false);
  });
});
