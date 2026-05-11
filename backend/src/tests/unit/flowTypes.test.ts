/**
 * Tests del contrato de tipos del motor de flujos (Sprint A).
 * Valida que los 4 templates iniciales sean estructuralmente válidos
 * contra los tipos de flow.ts. Si TS los acepta sin `as any`, la forma
 * está bien.
 */

import {
  BotFlow,
  FlowNode,
  ListSection,
  Transition,
  SendTextNode,
  SendButtonsNode,
  SendListNode,
  SendMediaNode,
  WaitInputNode,
  EscapeToHumanNode,
  EndNode,
} from '@/domain/entities/flow';

describe('Flow contract types (Sprint A)', () => {
  it('acepta un BotFlow mínimo válido', () => {
    const minimal: BotFlow = {
      version: '1.0',
      start_node_id: 'end',
      nodes: [
        {
          id: 'end',
          type: 'end',
          content: {},
          transitions: [],
        },
      ],
    };
    expect(minimal.start_node_id).toBe('end');
    expect(minimal.nodes).toHaveLength(1);
  });

  it('acepta cada uno de los 7 tipos de nodo', () => {
    const text: SendTextNode = {
      id: 'a',
      type: 'send_text',
      content: { text: 'hola' },
      transitions: [{ condition: { type: 'default' }, next_node_id: 'b' }],
    };

    const buttons: SendButtonsNode = {
      id: 'b',
      type: 'send_buttons',
      content: {
        text: '?',
        buttons: [{ id: 'x', title: 'X' }],
      },
      transitions: [{ condition: { type: 'button', value: 'x' }, next_node_id: 'c' }],
    };

    const list: SendListNode = {
      id: 'c',
      type: 'send_list',
      content: {
        text: 'elige',
        button_label: 'Ver',
        sections: [
          {
            type: 'static',
            title: 'Opciones',
            items: [{ id: 'i1', title: 'Item 1' }],
          },
          {
            type: 'dynamic',
            title: 'Productos',
            items_source: 'catalog_items',
          },
        ],
      },
      transitions: [
        { condition: { type: 'list_item', value: 'i1' }, next_node_id: 'd' },
        {
          condition: { type: 'list_item_any', save_to_context: 'selected_product_id' },
          next_node_id: 'd',
        },
      ],
    };

    const media: SendMediaNode = {
      id: 'd',
      type: 'send_media',
      content: { media_type: 'image', url: 'https://example.com/img.jpg' },
      transitions: [{ condition: { type: 'default' }, next_node_id: 'e' }],
    };

    const wait: WaitInputNode = {
      id: 'e',
      type: 'wait_input',
      content: { prompt: 'tu nombre?', save_to_context: 'phone' },
      transitions: [{ condition: { type: 'default' }, next_node_id: 'f' }],
    };

    const escape: EscapeToHumanNode = {
      id: 'f',
      type: 'escape_to_human',
      content: {
        user_response: 'ok',
        owner_alert_template: 'cliente {{phone}}',
      },
      transitions: [{ condition: { type: 'default' }, next_node_id: 'g' }],
    };

    const end: EndNode = {
      id: 'g',
      type: 'end',
      content: {},
      transitions: [],
    };

    const all: FlowNode[] = [text, buttons, list, media, wait, escape, end];
    expect(all).toHaveLength(7);
  });

  it('acepta keyword transition con array de strings', () => {
    const t: Transition = {
      condition: { type: 'keyword', values: ['sí', 'si', 'confirmar'] },
      next_node_id: 'next',
    };
    expect(t.condition.type).toBe('keyword');
  });

  it('section discriminated union narrowing', () => {
    const staticSection: ListSection = {
      type: 'static',
      title: 'X',
      items: [{ id: '1', title: 'uno' }],
    };
    const dynamicSection: ListSection = {
      type: 'dynamic',
      title: 'Y',
      items_source: 'catalog_items',
    };

    if (staticSection.type === 'static') {
      // TS debe aceptar acceso a items sin `as`
      expect(staticSection.items.length).toBeGreaterThan(0);
    }
    if (dynamicSection.type === 'dynamic') {
      // TS debe aceptar acceso a items_source sin `as`
      expect(dynamicSection.items_source).toBe('catalog_items');
    }
  });
});