/**
 * Bucle cerrado del carrusel (send_media_carousel).
 *
 * Antes de este cambio el carrusel era un folleto de ida: se enviaba bien,
 * pero tocar una card no podía enrutar a ningún lado. Dos causas
 * independientes, ambas cubiertas aquí:
 *
 *  1. El nodo no paraba el avance — no estaba en WAIT_NODE_TYPES — así que
 *     el intérprete seguía a `transitions[0]` y movía `currentNodeId` antes
 *     de que el cliente tocara nada.
 *  2. `matchesCondition` caso 'button' cortaba con
 *     `if (node.type !== 'send_buttons') return false`, así que una
 *     transición declarada sobre un carrusel nunca matcheaba.
 *
 * La espera es CONDICIONAL (isWaitNode): un carrusel de cta_url no genera
 * mensaje entrante — sus botones abren el navegador — así que parar ahí
 * dejaría la conversación colgada en un nodo que jamás puede avanzar.
 */

import type { Message, User, TenantConfig } from '@/domain/entities';
import { BotTone, UserState } from '@/domain/entities';
import type { BotFlow, MediaCarouselCard } from '@/domain/entities/flow';
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

function makeTenantConfig(): TenantConfig {
  return {
    tenantId: 't1',
    botName: 'TestBot',
    nombreNegocio: 'Ferreteria Test',
    tone: BotTone.AMIGABLE,
    welcomeMessage: 'Hola',
    menuMessage: 'Menu',
    outOfHoursMessage: 'Fuera de horario',
    notUnderstoodMessage: 'No entendi',
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

const QUICK_REPLY_CARDS: MediaCarouselCard[] = [
  {
    header: { type: 'image', link: 'https://cdn.test/taladro.jpg' },
    body: 'Taladro percutor de media pulgada',
    buttons: [{ type: 'quick_reply', id: 'card_taladro', title: 'Ver taladro' }],
  },
  {
    header: { type: 'image', link: 'https://cdn.test/esmeril.jpg' },
    body: 'Esmeril angular',
    buttons: [{ type: 'quick_reply', id: 'card_esmeril', title: 'Ver esmeril' }],
  },
];

/** Flow con un carrusel de quick_reply y una salida distinta por card. */
function makeQuickReplyFlow(): BotFlow {
  return {
    version: '1.0',
    start_node_id: 'carrusel',
    nodes: [
      {
        id: 'carrusel',
        type: 'send_media_carousel',
        content: { body: 'Nuestras herramientas', cards: QUICK_REPLY_CARDS },
        transitions: [
          { condition: { type: 'button', value: 'card_taladro' }, next_node_id: 'detalle_taladro' },
          { condition: { type: 'button', value: 'card_esmeril' }, next_node_id: 'detalle_esmeril' },
          { condition: { type: 'default' }, next_node_id: 'no_entendi' },
        ],
      },
      {
        id: 'detalle_taladro',
        type: 'send_text',
        content: { text: 'Taladro: 1290 pesos' },
        transitions: [{ condition: { type: 'default' }, next_node_id: 'fin' }],
      },
      {
        id: 'detalle_esmeril',
        type: 'send_text',
        content: { text: 'Esmeril: 890 pesos' },
        transitions: [{ condition: { type: 'default' }, next_node_id: 'fin' }],
      },
      {
        id: 'no_entendi',
        type: 'send_text',
        content: { text: 'No te entendi' },
        transitions: [{ condition: { type: 'default' }, next_node_id: 'fin' }],
      },
      { id: 'fin', type: 'end', content: {}, transitions: [] },
    ],
  };
}

// ============================================================================
// 1. ESPERA CONDICIONAL
// ============================================================================

describe('send_media_carousel - espera condicional (isWaitNode)', () => {
  it('un carrusel de quick_reply PARA en si mismo esperando el tap', async () => {
    const result = await makeInterpreter().execute({
      flow: makeQuickReplyFlow(),
      user: makeUser(),
      message: makeMessage('hola'),
      tenantConfig: makeTenantConfig(),
    });

    // Antes del fix esto era 'detalle_taladro': seguia transitions[0] sin parar.
    expect(result.nextNodeId).toBe('carrusel');
    expect(result.flowEnded).toBe(false);
    expect(result.outputs).toHaveLength(1);
    expect(result.outputs[0].kind).toBe('media_carousel');
  });

  it('un carrusel de cta_url NO para - sus botones abren el navegador', async () => {
    const flow: BotFlow = {
      version: '1.0',
      start_node_id: 'carrusel',
      nodes: [
        {
          id: 'carrusel',
          type: 'send_media_carousel',
          content: {
            body: 'Catalogo en linea',
            cards: [
              {
                header: { type: 'image', link: 'https://cdn.test/promo.jpg' },
                body: 'Promociones de la semana',
                buttons: [
                  { type: 'cta_url', display_text: 'Abrir', url: 'https://test.mx/promos' },
                ],
              },
            ],
          },
          transitions: [{ condition: { type: 'default' }, next_node_id: 'cierre' }],
        },
        {
          id: 'cierre',
          type: 'send_text',
          content: { text: 'Te ayudo con algo mas?' },
          transitions: [{ condition: { type: 'default' }, next_node_id: 'fin' }],
        },
        { id: 'fin', type: 'end', content: {}, transitions: [] },
      ],
    };

    const result = await makeInterpreter().execute({
      flow,
      user: makeUser(),
      message: makeMessage('hola'),
      tenantConfig: makeTenantConfig(),
    });

    // Parar aqui colgaria la conversacion: un cta_url no produce mensaje entrante.
    expect(result.nextNodeId).toBe('end');
    expect(result.flowEnded).toBe(true);
    expect(result.outputs.map((o) => o.kind)).toEqual(['media_carousel', 'text']);
  });
});

// ============================================================================
// 2. ROUTING DE LOS QUICK_REPLY
// ============================================================================

describe('send_media_carousel - routing de quick_reply por condicion button', () => {
  it('enruta por el id del boton de la card', async () => {
    const result = await makeInterpreter().execute({
      flow: makeQuickReplyFlow(),
      user: makeUser({ currentNodeId: 'carrusel' }),
      message: makeMessage('card_esmeril'),
      tenantConfig: makeTenantConfig(),
    });

    expect(result.outputs[0]).toEqual({ kind: 'text', text: 'Esmeril: 890 pesos' });
  });

  it('enruta por el titulo del boton - Meta manda button_reply.title, no el id', async () => {
    const result = await makeInterpreter().execute({
      flow: makeQuickReplyFlow(),
      user: makeUser({ currentNodeId: 'carrusel' }),
      message: makeMessage('Ver taladro'),
      tenantConfig: makeTenantConfig(),
    });

    expect(result.outputs[0]).toEqual({ kind: 'text', text: 'Taladro: 1290 pesos' });
  });

  it('el match por titulo es case-insensitive', async () => {
    const result = await makeInterpreter().execute({
      flow: makeQuickReplyFlow(),
      user: makeUser({ currentNodeId: 'carrusel' }),
      message: makeMessage('VER ESMERIL'),
      tenantConfig: makeTenantConfig(),
    });

    expect(result.outputs[0]).toEqual({ kind: 'text', text: 'Esmeril: 890 pesos' });
  });

  it('cada card lleva a su propio nodo - el id de una no dispara la otra', async () => {
    const interpreter = makeInterpreter();
    const taladro = await interpreter.execute({
      flow: makeQuickReplyFlow(),
      user: makeUser({ currentNodeId: 'carrusel' }),
      message: makeMessage('card_taladro'),
      tenantConfig: makeTenantConfig(),
    });
    const esmeril = await interpreter.execute({
      flow: makeQuickReplyFlow(),
      user: makeUser({ currentNodeId: 'carrusel' }),
      message: makeMessage('card_esmeril'),
      tenantConfig: makeTenantConfig(),
    });

    expect(taladro.outputs[0]).toEqual({ kind: 'text', text: 'Taladro: 1290 pesos' });
    expect(esmeril.outputs[0]).toEqual({ kind: 'text', text: 'Esmeril: 890 pesos' });
  });

  it('texto libre que no matchea ninguna card cae al default', async () => {
    const result = await makeInterpreter().execute({
      flow: makeQuickReplyFlow(),
      user: makeUser({ currentNodeId: 'carrusel' }),
      message: makeMessage('quiero otra cosa'),
      tenantConfig: makeTenantConfig(),
    });

    expect(result.outputs[0]).toEqual({ kind: 'text', text: 'No te entendi' });
  });

  it('button (100) le gana al default (0) - especificidad DEC-06 sobre carrusel', async () => {
    const flow = makeQuickReplyFlow();
    // default declarado PRIMERO: si el motor fuera first-match-wins ganaria el.
    const carrusel = flow.nodes.find((n) => n.id === 'carrusel')!;
    carrusel.transitions = [
      { condition: { type: 'default' }, next_node_id: 'no_entendi' },
      { condition: { type: 'button', value: 'card_taladro' }, next_node_id: 'detalle_taladro' },
    ];

    const result = await makeInterpreter().execute({
      flow,
      user: makeUser({ currentNodeId: 'carrusel' }),
      message: makeMessage('card_taladro'),
      tenantConfig: makeTenantConfig(),
    });

    expect(result.outputs[0]).toEqual({ kind: 'text', text: 'Taladro: 1290 pesos' });
  });

  it('un cta_url dentro de una card no se puede usar como condicion button', async () => {
    const flow: BotFlow = {
      version: '1.0',
      start_node_id: 'carrusel',
      nodes: [
        {
          id: 'carrusel',
          type: 'send_media_carousel',
          content: {
            body: 'Catalogo',
            cards: [
              {
                header: { type: 'image', link: 'https://cdn.test/promo.jpg' },
                body: 'Promos',
                buttons: [
                  { type: 'cta_url', display_text: 'Abrir', url: 'https://test.mx/promos' },
                ],
              },
            ],
          },
          transitions: [
            { condition: { type: 'button', value: 'Abrir' }, next_node_id: 'jamas' },
            { condition: { type: 'default' }, next_node_id: 'cierre' },
          ],
        },
        {
          id: 'jamas',
          type: 'send_text',
          content: { text: 'inalcanzable' },
          transitions: [{ condition: { type: 'default' }, next_node_id: 'fin' }],
        },
        {
          id: 'cierre',
          type: 'send_text',
          content: { text: 'Algo mas?' },
          transitions: [{ condition: { type: 'default' }, next_node_id: 'fin' }],
        },
        { id: 'fin', type: 'end', content: {}, transitions: [] },
      ],
    };

    const result = await makeInterpreter().execute({
      flow,
      user: makeUser({ currentNodeId: 'carrusel' }),
      message: makeMessage('Abrir'),
      tenantConfig: makeTenantConfig(),
    });

    expect(result.outputs[0]).toEqual({ kind: 'text', text: 'Algo mas?' });
  });
});
