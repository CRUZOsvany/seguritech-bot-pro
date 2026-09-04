/**
 * DEC-06 / C-03 (auditoría 2026-08-26): antes `evaluateTransitions` era
 * first-match-wins puro sobre `node.transitions[]` — el ORDEN del array
 * decidía el comportamiento del bot, invisible para quien edita el flow.
 * Ahora se evalúan todas las transiciones que matchean y gana la de mayor
 * especificidad (button > list_item > ... > default), sin importar el
 * orden del array. Empates entre transiciones del MISMO nivel sí respetan
 * el orden (comportamiento idéntico al de antes para ese caso).
 *
 * Prueba el caso real del hallazgo: un flow con las transiciones en el
 * orden "equivocado" (más genérica primero) debe seguir contestando
 * correcto — el bug que C-03 describe es justo que HOY eso rompería.
 */
import type { Message, User, TenantConfig } from '@/domain/entities';
import { BotTone, UserState } from '@/domain/entities';
import type { BotFlow } from '@/domain/entities/flow';
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
const catalogSearchService = { search: jest.fn().mockResolvedValue(null) } as unknown as CatalogSearchService;

function makeInterpreter(): FlowInterpreter {
  return new FlowInterpreter(mockVR, mockDSR, serviceDirectoryMatcher, catalogSearchService, logger);
}

describe('FlowInterpreter — scoring por especificidad de transiciones (DEC-06 / C-03)', () => {
  it('button gana sobre keyword aunque keyword esté PRIMERO en el array (el bug real que esto arregla)', async () => {
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
      flow, user, message: makeMessage('buscar'), tenantConfig: makeTenantConfig(),
    });

    expect(result.nextNodeId).toBe('via_button');
  });

  it('empate entre dos transiciones del mismo tipo (keyword): gana la que va primero en el array', async () => {
    const flow: BotFlow = {
      version: '1.0',
      start_node_id: 'menu',
      nodes: [
        {
          id: 'menu',
          type: 'send_text',
          content: { text: 'hola' },
          transitions: [
            { condition: { type: 'keyword', values: ['ayuda'] }, next_node_id: 'primero' },
            { condition: { type: 'keyword', values: ['ayuda'] }, next_node_id: 'segundo' },
            { condition: { type: 'default' }, next_node_id: 'default' },
          ],
        },
        { id: 'primero', type: 'send_text', content: { text: 'primero' }, transitions: [] },
        { id: 'segundo', type: 'send_text', content: { text: 'segundo' }, transitions: [] },
        { id: 'default', type: 'send_text', content: { text: 'default' }, transitions: [] },
      ],
    };
    const interpreter = makeInterpreter();
    const user = makeUser({ currentNodeId: 'menu', context: {} });

    const result = await interpreter.execute({
      flow, user, message: makeMessage('ayuda'), tenantConfig: makeTenantConfig(),
    });

    expect(result.nextNodeId).toBe('primero');
  });

  it('default nunca gana si algo más específico matchea, sin importar el orden', async () => {
    const flow: BotFlow = {
      version: '1.0',
      start_node_id: 'menu',
      nodes: [
        {
          id: 'menu',
          type: 'send_text',
          content: { text: 'hola' },
          transitions: [
            // default va primero, a propósito.
            { condition: { type: 'default' }, next_node_id: 'via_default' },
            { condition: { type: 'keyword', values: ['hola'] }, next_node_id: 'via_keyword' },
          ],
        },
        { id: 'via_default', type: 'send_text', content: { text: 'via_default' }, transitions: [] },
        { id: 'via_keyword', type: 'send_text', content: { text: 'via_keyword' }, transitions: [] },
      ],
    };
    const interpreter = makeInterpreter();
    const user = makeUser({ currentNodeId: 'menu', context: {} });

    const result = await interpreter.execute({
      flow, user, message: makeMessage('hola'), tenantConfig: makeTenantConfig(),
    });

    expect(result.nextNodeId).toBe('via_keyword');
  });

  it('con una sola transición que matchea, no hay cambio de comportamiento (camino feliz intacto)', async () => {
    const flow: BotFlow = {
      version: '1.0',
      start_node_id: 'menu',
      nodes: [
        {
          id: 'menu',
          type: 'send_text',
          content: { text: 'hola' },
          transitions: [
            { condition: { type: 'keyword', values: ['hola'] }, next_node_id: 'saludo' },
            { condition: { type: 'default' }, next_node_id: 'no_entendi' },
          ],
        },
        { id: 'saludo', type: 'send_text', content: { text: 'saludo' }, transitions: [] },
        { id: 'no_entendi', type: 'send_text', content: { text: 'no_entendi' }, transitions: [] },
      ],
    };
    const interpreter = makeInterpreter();
    const user = makeUser({ currentNodeId: 'menu', context: {} });

    const result = await interpreter.execute({
      flow, user, message: makeMessage('hola'), tenantConfig: makeTenantConfig(),
    });

    expect(result.nextNodeId).toBe('saludo');
  });

  it('ninguna transición matchea: sigue devolviendo null como antes (no hay default declarado)', async () => {
    const flow: BotFlow = {
      version: '1.0',
      start_node_id: 'menu',
      nodes: [
        {
          id: 'menu',
          type: 'send_text',
          content: { text: 'hola' },
          transitions: [
            { condition: { type: 'keyword', values: ['adios'] }, next_node_id: 'despedida' },
          ],
        },
        { id: 'despedida', type: 'send_text', content: { text: 'despedida' }, transitions: [] },
      ],
    };
    const interpreter = makeInterpreter();
    const user = makeUser({ currentNodeId: 'menu', context: {} });

    const result = await interpreter.execute({
      flow, user, message: makeMessage('algo random'), tenantConfig: makeTenantConfig(),
    });

    // Sin transición que matchee y sin default, el flow no avanza — se
    // queda en el mismo nodo (comportamiento ya existente, sin cambios).
    expect(result.nextNodeId).toBe('menu');
  });
});
