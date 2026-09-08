/**
 * Guardrails de publicación del carrusel dinámico.
 *
 * El panel deja soltar un carrusel en el canvas, así que el schema es lo único
 * que impide publicar un nodo que se rompe en silencio en runtime. Tres
 * candados, todos aquí:
 *
 *  1. `cards` y `dynamic_cards` son mutuamente excluyentes — con ambas,
 *     renderNode enviaría solo las dinámicas y las literales serían texto
 *     muerto en el JSON.
 *  2. Un carrusel sin ninguna de las dos no tiene nada que enviar.
 *  3. Un carrusel dinámico no admite transiciones `button`: sus ids los genera
 *     CarouselCardResolver desde el catálogo en runtime, así que un `button`
 *     del JSON no puede nombrar ninguno. El routing correcto es `card_any`.
 */

import { describe, expect, it } from '@jest/globals';
import { FlowNodeSchema, FlowSchema } from '@/domain/validators/flowSchema';

const CARD_LITERAL = {
  header: { type: 'image', link: 'https://cdn.test/a.jpg' },
  body: 'Cuaderno profesional',
  buttons: [{ type: 'quick_reply', id: 'card_1', title: 'Ver' }],
};

const DYNAMIC = { cards_source: 'catalog_items', button_title: 'Lo quiero' };

function carousel(content: unknown, transitions: unknown[] = []) {
  return { id: 'carrusel', type: 'send_media_carousel', content, transitions };
}

describe('send_media_carousel — cards literales vs dynamic_cards', () => {
  it('acepta un carrusel dinámico enrutado con card_any', () => {
    const result = FlowNodeSchema.safeParse(
      carousel({ body: 'Nuestro catálogo', dynamic_cards: DYNAMIC }, [
        { condition: { type: 'card_any', save_to_context: 'selected_product_id' }, next_node_id: 'x' },
        { condition: { type: 'default' }, next_node_id: 'y' },
      ]),
    );
    expect(result.success).toBe(true);
  });

  it('sigue aceptando un carrusel de cards literales', () => {
    const result = FlowNodeSchema.safeParse(
      carousel({ body: 'Herramientas', cards: [CARD_LITERAL] }, [
        { condition: { type: 'button', value: 'card_1' }, next_node_id: 'x' },
      ]),
    );
    expect(result.success).toBe(true);
  });

  it('rechaza declarar cards y dynamic_cards a la vez', () => {
    const result = FlowNodeSchema.safeParse(
      carousel({ body: 'Ambas', cards: [CARD_LITERAL], dynamic_cards: DYNAMIC }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes('mutuamente excluyentes'))).toBe(
        true,
      );
    }
  });

  it('rechaza un carrusel sin cards ni dynamic_cards', () => {
    const result = FlowNodeSchema.safeParse(carousel({ body: 'Vacío' }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes('debe declarar'))).toBe(true);
    }
  });

  it('rechaza una fuente de cards desconocida', () => {
    const result = FlowNodeSchema.safeParse(
      carousel({
        body: 'x',
        dynamic_cards: { cards_source: 'pos_products', button_title: 'Ver' },
      }),
    );
    expect(result.success).toBe(false);
  });

  it('rechaza button_title de más de 20 chars (regla Meta)', () => {
    const result = FlowNodeSchema.safeParse(
      carousel({
        body: 'x',
        dynamic_cards: {
          cards_source: 'catalog_items',
          button_title: 'Quiero este producto ahora mismo',
        },
      }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('button_title'))).toBe(true);
    }
  });
});

describe('send_media_carousel — transiciones inalcanzables', () => {
  it('rechaza una transición button sobre un carrusel dinámico', () => {
    const result = FlowNodeSchema.safeParse(
      carousel({ body: 'x', dynamic_cards: DYNAMIC }, [
        { condition: { type: 'button', value: 'prod-cuaderno' }, next_node_id: 'x' },
        { condition: { type: 'default' }, next_node_id: 'y' },
      ]),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes('card_any'))).toBe(true);
    }
  });

  it('la regla cross-card sigue aplicando a las cards literales', () => {
    const result = FlowNodeSchema.safeParse(
      carousel({
        body: 'x',
        cards: [
          CARD_LITERAL,
          {
            header: { type: 'image', link: 'https://cdn.test/b.jpg' },
            body: 'Otra',
            buttons: [{ type: 'cta_url', display_text: 'Abrir', url: 'https://test.mx' }],
          },
        ],
      }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes('mismo tipo de botón'))).toBe(true);
    }
  });
});

describe('FlowSchema — flow completo con carrusel dinámico', () => {
  it('publica un flow de catálogo válido de punta a punta', () => {
    const result = FlowSchema.safeParse({
      version: '1.0',
      start_node_id: 'carrusel',
      nodes: [
        carousel({ body: 'Esto tenemos', dynamic_cards: DYNAMIC }, [
          { condition: { type: 'card_any' }, next_node_id: 'confirmar' },
          { condition: { type: 'default' }, next_node_id: 'sin_catalogo' },
        ]),
        {
          id: 'confirmar',
          type: 'send_text',
          content: { text: 'Anotado' },
          transitions: [{ condition: { type: 'default' }, next_node_id: 'fin' }],
        },
        {
          id: 'sin_catalogo',
          type: 'send_text',
          content: { text: 'Aún no hay catálogo' },
          transitions: [{ condition: { type: 'default' }, next_node_id: 'fin' }],
        },
        { id: 'fin', type: 'end', content: {}, transitions: [] },
      ],
    });
    expect(result.success).toBe(true);
  });
});
