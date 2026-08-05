/**
 * Tests de la regla config_bound (P3): un nodo que declara estar gobernado
 * por `bot_configurations` debe tener su content.text compuesto EXCLUSIVAMENTE
 * por los placeholders {{key}} de las claves declaradas (más espacios en
 * blanco) — ni texto literal mezclado, ni variables no declaradas, ni faltantes.
 *
 * Ver docs/whatsapp/PLAN_CONTROL_GUION_OLEADAS_1_2.md (P3).
 */

import { describe, expect, it } from '@jest/globals';
import { FlowSchema } from '@/domain/validators/flowSchema';

function flowWith(node: Record<string, unknown>) {
  return {
    version: '1.0' as const,
    start_node_id: node.id,
    nodes: [
      node,
      { id: 'end_1', type: 'end', content: {}, transitions: [] },
    ],
  };
}

describe('FlowSchema — config_bound (P3)', () => {
  it('acepta un nodo send_buttons con dos claves combinadas en un solo texto (caso real: bienvenida)', () => {
    const result = FlowSchema.safeParse(
      flowWith({
        id: 'bienvenida',
        type: 'send_buttons',
        config_bound: ['welcome_message', 'menu_message'],
        content: {
          text: '{{welcome_message}}\n\n{{menu_message}}',
          buttons: [{ id: 'a', title: 'Opción' }],
        },
        transitions: [{ condition: { type: 'default' }, next_node_id: 'end_1' }],
      }),
    );
    expect(result.success).toBe(true);
  });

  it('acepta un nodo send_text con una sola clave', () => {
    const result = FlowSchema.safeParse(
      flowWith({
        id: 'no_entendi',
        type: 'send_text',
        config_bound: ['not_understood_message'],
        content: { text: '{{not_understood_message}}' },
        transitions: [{ condition: { type: 'default' }, next_node_id: 'end_1' }],
      }),
    );
    expect(result.success).toBe(true);
  });

  it('rechaza texto literal mezclado con la variable declarada', () => {
    const result = FlowSchema.safeParse(
      flowWith({
        id: 'bienvenida',
        type: 'send_buttons',
        config_bound: ['welcome_message'],
        content: {
          text: 'Hola, {{welcome_message}}',
          buttons: [{ id: 'a', title: 'Opción' }],
        },
        transitions: [{ condition: { type: 'default' }, next_node_id: 'end_1' }],
      }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i) => i.message.includes('texto literal fuera de las variables')),
      ).toBe(true);
    }
  });

  it('rechaza cuando falta una de las variables declaradas', () => {
    const result = FlowSchema.safeParse(
      flowWith({
        id: 'bienvenida',
        type: 'send_buttons',
        config_bound: ['welcome_message', 'menu_message'],
        content: {
          text: '{{welcome_message}}',
          buttons: [{ id: 'a', title: 'Opción' }],
        },
        transitions: [{ condition: { type: 'default' }, next_node_id: 'end_1' }],
      }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes('faltan {{menu_message}}'))).toBe(
        true,
      );
    }
  });

  it('rechaza una variable en el texto que no está declarada en config_bound', () => {
    const result = FlowSchema.safeParse(
      flowWith({
        id: 'bienvenida',
        type: 'send_buttons',
        config_bound: ['welcome_message'],
        content: {
          text: '{{welcome_message}}{{menu_message}}',
          buttons: [{ id: 'a', title: 'Opción' }],
        },
        transitions: [{ condition: { type: 'default' }, next_node_id: 'end_1' }],
      }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i) => i.message.includes('variables no declaradas: {{menu_message}}')),
      ).toBe(true);
    }
  });

  it('no exige nada en un nodo sin config_bound (comportamiento previo intacto)', () => {
    const result = FlowSchema.safeParse(
      flowWith({
        id: 'info',
        type: 'send_text',
        content: { text: 'Cualquier texto libre, {{nombre_negocio}} incluido.' },
        transitions: [{ condition: { type: 'default' }, next_node_id: 'end_1' }],
      }),
    );
    expect(result.success).toBe(true);
  });

  it('rechaza una clave fuera del enum permitido (out_of_hours_message queda excluida por D1)', () => {
    const result = FlowSchema.safeParse(
      flowWith({
        id: 'fuera_horario',
        type: 'send_text',
        config_bound: ['out_of_hours_message'],
        content: { text: '{{out_of_hours_message}}' },
        transitions: [{ condition: { type: 'default' }, next_node_id: 'end_1' }],
      }),
    );
    expect(result.success).toBe(false);
  });
});
