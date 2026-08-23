/**
 * Validación Zod del nodo search_catalog y las condiciones catalog_found /
 * catalog_not_found (§2.1 del plan V1).
 */
import { describe, expect, it } from '@jest/globals';
import { FlowNodeSchema, FlowSchema } from '@/domain/validators/flowSchema';

describe('FlowNodeSchema — search_catalog', () => {
  it('acepta un nodo válido con prompt y transiciones catalog_found/catalog_not_found', () => {
    const result = FlowNodeSchema.safeParse({
      id: 'search_1',
      type: 'search_catalog',
      content: { prompt: '¿Qué producto buscas?' },
      transitions: [
        { condition: { type: 'catalog_found', save_to_context: 'selected_product_id' }, next_node_id: 'found' },
        { condition: { type: 'catalog_not_found' }, next_node_id: 'human' },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('acepta un nodo sin prompt (content vacío)', () => {
    const result = FlowNodeSchema.safeParse({
      id: 'search_1',
      type: 'search_catalog',
      content: {},
      transitions: [{ condition: { type: 'catalog_not_found' }, next_node_id: 'human' }],
    });
    expect(result.success).toBe(true);
  });

  it('rechaza prompt de más de 4096 chars', () => {
    const result = FlowNodeSchema.safeParse({
      id: 'search_1',
      type: 'search_catalog',
      content: { prompt: 'x'.repeat(4097) },
      transitions: [],
    });
    expect(result.success).toBe(false);
  });

  it('rechaza catalog_found con save_to_context vacío', () => {
    const result = FlowNodeSchema.safeParse({
      id: 'search_1',
      type: 'search_catalog',
      content: {},
      transitions: [{ condition: { type: 'catalog_found', save_to_context: '' }, next_node_id: 'n1' }],
    });
    expect(result.success).toBe(false);
  });

  it('rechaza id faltante', () => {
    const result = FlowNodeSchema.safeParse({
      type: 'search_catalog',
      content: {},
      transitions: [],
    });
    expect(result.success).toBe(false);
  });
});

describe('FlowSchema — flow completo con search_catalog', () => {
  it('valida un flow mínimo con search_catalog → catalog_found/not_found → end', () => {
    const result = FlowSchema.safeParse({
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
          content: { text: 'Encontrado: {{selected_product_name}}' },
          transitions: [{ condition: { type: 'default' }, next_node_id: 'end' }],
        },
        {
          id: 'human',
          type: 'escape_to_human',
          content: { user_response: 'Ya te comunico con alguien.', owner_alert_template: 'Sin match' },
          transitions: [],
        },
        { id: 'end', type: 'end', content: {}, transitions: [] },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rechaza catalog_found apuntando a un nodo que no existe', () => {
    const result = FlowSchema.safeParse({
      version: '1.0',
      start_node_id: 'search',
      nodes: [
        {
          id: 'search',
          type: 'search_catalog',
          content: {},
          transitions: [{ condition: { type: 'catalog_found' }, next_node_id: 'no_existe' }],
        },
        { id: 'end', type: 'end', content: {}, transitions: [] },
      ],
    });
    expect(result.success).toBe(false);
  });
});
