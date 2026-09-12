/**
 * Fusión de mensajes (Fase 5, V-COSTO-01): el texto suelto se vuelve el
 * mensaje que le sigue, con el texto arriba, sin mover ninguna flecha.
 */
import type { BotFlow, FlowNode } from '@/domain/entities/flow';
import { planMerge } from '@/domain/validation/mergeMessages';
import { validateFlowDesign } from '@/domain/validation/flowDesignValidator';
import { validateFlow } from '@/domain/validators/flowSchema';
import { loadMold } from '../utils/conversationHarness';

const byId = (flow: BotFlow, id: string) => flow.nodes.find((n) => n.id === id);

function small(nodes: Partial<Record<'a' | 'b', Partial<FlowNode>>> = {}): BotFlow {
  return {
    version: '1.0',
    start_node_id: 'a',
    nodes: [
      { id: 'a', type: 'send_text', content: { text: 'Hola.' }, transitions: [{ condition: { type: 'default' }, next_node_id: 'b' }], ...nodes.a },
      {
        id: 'b',
        type: 'send_buttons',
        content: { text: '¿Qué necesitas?', buttons: [{ id: 'x', title: 'X' }] },
        transitions: [{ condition: { type: 'default' }, next_node_id: 'fin' }],
        ...nodes.b,
      },
      { id: 'fin', type: 'end', content: {}, transitions: [] },
    ],
  } as BotFlow;
}

describe('planMerge', () => {
  it('securitech: el saludo se vuelve el menú con el saludo arriba; el menú se queda porque otros lo usan', () => {
    const flow = loadMold('securitech');
    const plan = planMerge(flow, 'saludo');

    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    const menu = byId(flow, 'menu_principal')!;
    expect(byId(plan.flow, 'saludo')).toEqual({
      ...menu,
      id: 'saludo',
      content: { ...menu.content, text: '¡Hola! Bienvenido a SECURITECH, tu proveedor de tecnología en Chilpancingo. ¿En qué te apoyamos hoy?\n\nElige una opción 👇' },
    });
    expect(plan.removed).toBeNull();
    expect(byId(plan.flow, 'menu_principal')).toEqual(menu);
    expect(() => validateFlow(plan.flow)).not.toThrow();
    expect(validateFlowDesign(plan.flow).issues.map((i) => `${i.code}:${i.nodeId}`)).toEqual(['V-COSTO-01:no_entendi']);
  });

  it('quita el mensaje de después si ya nadie lo usa', () => {
    const plan = planMerge(small(), 'a');

    expect(plan).toMatchObject({ ok: true, removed: 'b' });
    if (!plan.ok) return;
    expect(plan.flow.nodes.map((n) => n.id)).toEqual(['a', 'fin']);
    expect(byId(plan.flow, 'a')).toMatchObject({ type: 'send_buttons', content: { text: 'Hola.\n\n¿Qué necesitas?' } });
  });

  it('dos textos del negocio: junta sus claves de config_bound, como el saludo del asistente', () => {
    const plan = planMerge(
      small({
        a: { config_bound: ['welcome_message'], content: { text: '{{welcome_message}}' } } as Partial<FlowNode>,
        b: { config_bound: ['menu_message'], content: { text: '{{menu_message}}', buttons: [{ id: 'x', title: 'X' }] } } as Partial<FlowNode>,
      }),
      'a',
    );

    expect(plan.ok && byId(plan.flow, 'a')).toMatchObject({ config_bound: ['welcome_message', 'menu_message'], content: { text: '{{welcome_message}}\n\n{{menu_message}}' } });
    expect(plan.ok && validateFlowDesign(plan.flow).schema.ok).toBe(true);
  });

  it.each([
    ['uno es del negocio y el otro no', small({ a: { config_bound: ['welcome_message'], content: { text: '{{welcome_message}}' } } as Partial<FlowNode> }), 'a', 'config_bound'],
    ['juntos pasan del límite del menú', small({ a: { content: { text: 'x'.repeat(1020) } } as Partial<FlowNode> }), 'a', '1024 caracteres'],
    ['no es un texto', small(), 'b', 'no es un texto suelto'],
    ['no existe', small(), 'nadie', 'no existe'],
  ])('no fusiona si %s', (_name, flow, nodeId, reason) => {
    const plan = planMerge(flow, nodeId);

    expect(plan.ok).toBe(false);
    expect(!plan.ok && plan.reason).toContain(reason);
  });
});

describe('el validador propone la fusión', () => {
  it('V-COSTO-01 trae el arreglo cuando se puede, y el motivo cuando no', () => {
    const ok = validateFlowDesign(small()).issues.find((i) => i.code === 'V-COSTO-01');
    const tooLong = validateFlowDesign(small({ a: { content: { text: 'x'.repeat(1020) } } as Partial<FlowNode> })).issues.find((i) => i.code === 'V-COSTO-01');

    expect(ok?.fix).toEqual({ kind: 'merge_next', nodeId: 'a' });
    expect(tooLong?.fix).toBeUndefined();
    expect(tooLong?.message).toContain('No se puede hacer solo: juntos pasan de 1024 caracteres.');
  });

  it('el reporte dice cuántos mensajes manda cada turno', () => {
    expect(validateFlowDesign(loadMold('securitech')).turns).toContainEqual({ entry: 'saludo', messages: 2, path: ['saludo', 'menu_principal'] });
  });
});
