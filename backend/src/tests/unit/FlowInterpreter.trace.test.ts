/**
 * Traza del intérprete (Fase 1 del Studio): el "por qué" de cada decisión.
 * La traza es solo lectura; estos tests fijan que dice la verdad sobre lo
 * que el intérprete hizo, no que el intérprete haga algo distinto.
 */
import { UserState } from '@/domain/entities';
import type { User } from '@/domain/entities';
import type { BotFlow } from '@/domain/entities/flow';
import {
  loadMold,
  makeInterpreter,
  makeTenantConfig,
} from '../utils/conversationHarness';

function userAt(nodeId?: string, context: Record<string, unknown> = {}): User {
  return {
    id: 'u1',
    tenantId: 't1',
    phoneNumber: '5217471234567',
    currentState: UserState.INITIAL,
    currentNodeId: nodeId,
    context,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

async function execute(flow: BotFlow, nodeId: string | undefined, content: string, opts: {
  orderIdFactory?: () => string;
  context?: Record<string, unknown>;
} = {}) {
  return makeInterpreter().execute({
    flow,
    user: userAt(nodeId, opts.context),
    message: { id: 'm1', tenantId: 't1', from: '5217471234567', content, timestamp: new Date() },
    tenantConfig: makeTenantConfig(),
    orderIdFactory: opts.orderIdFactory,
  });
}

describe('FlowInterpreter · traza', () => {
  it('palabra de escape sin transición local: la registra, reinicia y lo dice', async () => {
    const result = await execute(loadMold('cerrajeria'), 'menu_emergencia', 'cancelar');

    expect(result.trace?.slice(0, 2)).toEqual([
      { kind: 'escape_word', word: 'cancelar', category: 'restart', target: 'bienvenida', handledLocally: false },
      { kind: 'session_start', startNodeId: 'bienvenida', reason: 'escape_word' },
    ]);
    // El pre-chequeo de la palabra de escape no se reporta como la decisión del turno.
    expect(result.trace?.some((s) => s.kind === 'transitions')).toBe(false);
  });

  it('palabra de escape que el nodo sí maneja: queda registrada como local', async () => {
    // bienvenida de papelería tiene keyword "salir" → despedida.
    const result = await execute(loadMold('papeleria'), 'bienvenida', 'salir');

    expect(result.trace?.[0]).toEqual({ kind: 'escape_word', word: 'salir', category: 'restart', target: 'bienvenida', handledLocally: true });
    expect(result.nextNodeId).toBe('end');
  });

  it('volver al menú: pasa al menú sin reiniciar la sesión', async () => {
    const result = await execute(loadMold('securitech'), 'rama_camaras', '¡Menú!');

    expect(result.trace?.slice(0, 2)).toEqual([
      { kind: 'escape_word', word: 'menu', category: 'menu', target: 'menu_principal', handledLocally: false },
      { kind: 'node_entered', nodeId: 'menu_principal', nodeType: 'send_buttons' },
    ]);
  });

  it('validación numérica fallida: validación inválida y espera en el mismo nodo', async () => {
    const result = await execute(loadMold('papeleria'), 'pedido_cantidad', 'muchos');

    expect(result.trace).toEqual([
      { kind: 'validation', nodeId: 'pedido_cantidad', validator: 'numeric', valid: false },
      { kind: 'wait', nodeId: 'pedido_cantidad' },
    ]);
  });

  it('ninguna transición coincide: todas marcadas como no coincidentes y no_match', async () => {
    const flow: BotFlow = {
      version: '1.0',
      start_node_id: 'pregunta',
      nodes: [
        {
          id: 'pregunta',
          type: 'send_buttons',
          content: { text: '¿Sí o no?', buttons: [{ id: 'si', title: 'Sí' }, { id: 'no', title: 'No' }] },
          transitions: [
            { condition: { type: 'button', value: 'si' }, next_node_id: 'fin' },
            { condition: { type: 'button', value: 'no' }, next_node_id: 'fin' },
          ],
        },
        { id: 'fin', type: 'end', content: {}, transitions: [] },
      ],
    };

    const result = await execute(flow, 'pregunta', 'quizá');

    expect(result.trace).toEqual([
      {
        kind: 'transitions',
        nodeId: 'pregunta',
        candidates: [
          { condition: 'button', detail: 'si', target: 'fin', matched: false, score: 100 },
          { condition: 'button', detail: 'no', target: 'fin', matched: false, score: 100 },
        ],
        winner: null,
      },
      { kind: 'no_match', nodeId: 'pregunta' },
      { kind: 'wait', nodeId: 'pregunta' },
    ]);
  });

  it('lista dinámica vacía: salto automático al default, con destino', async () => {
    const flow = loadMold('papeleria');
    const result = await makeInterpreter().execute({
      flow,
      user: userAt('bienvenida'),
      message: { id: 'm1', tenantId: 't1', from: '5217471234567', content: '🖨️ Servicios', timestamp: new Date() },
      tenantConfig: makeTenantConfig({ serviceDirectory: [] }),
    });

    expect(result.trace).toContainEqual({
      kind: 'auto_skip',
      nodeId: 'menu_servicios',
      reason: 'empty_list',
      target: 'no_entendi',
    });
  });

  it('el folio de {{order_id}} sale del generador inyectado', async () => {
    const flow = loadMold('papeleria');
    const result = await execute(flow, 'pedido_confirma', '✅ Sí, correcto', {
      orderIdFactory: () => 'FOLIO-FIJO',
      context: { selected_product_id: 'pos-cuaderno-prof', cantidad_producto: '3' },
    });

    expect(result.contextUpdates.order_id).toBe('FOLIO-FIJO');
  });
});
