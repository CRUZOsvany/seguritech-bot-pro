/**
 * CarouselCardResolver — hidratación de cards de carrusel desde el catálogo.
 *
 * La regla dura que gobierna todo este archivo: Meta exige header image/video
 * en CADA card de un media_carousel. Un producto sin foto propia usa la imagen
 * de respaldo del tenant (bot_configurations.imagen_fallback_url, migración
 * 021) y, si tampoco la hay, queda fuera del carrusel. Mejor un carrusel más
 * corto que un mensaje que Meta rechaza entero.
 */

import type { CatalogItem, TenantConfig } from '@/domain/entities';
import { BotTone } from '@/domain/entities';
import type { DynamicCarouselCards } from '@/domain/entities/flow';
import { CarouselCardResolver } from '@/domain/services/CarouselCardResolver';
import pino from 'pino';

const logger = pino({ level: 'silent' });

function makeItem(overrides: Partial<CatalogItem> & { id: string }): CatalogItem {
  return {
    name: 'Producto',
    description: '',
    price: 10,
    category: '',
    available: true,
    ...overrides,
  };
}

function makeTenantConfig(
  catalog: CatalogItem[],
  fallbackImageUrl?: string,
): TenantConfig {
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

const DYNAMIC: DynamicCarouselCards = {
  cards_source: 'catalog_items',
  button_title: 'Ver detalle',
};

function resolve(catalog: CatalogItem[], fallback?: string, dynamic = DYNAMIC) {
  return new CarouselCardResolver(logger).resolve(dynamic, makeTenantConfig(catalog, fallback));
}

// ============================================================================
// IMAGEN: la restricción que define el resto
// ============================================================================

describe('CarouselCardResolver - origen de la imagen', () => {
  it('usa la foto propia del producto cuando existe', () => {
    const cards = resolve([
      makeItem({ id: 'p1', name: 'Cuaderno', imageUrl: 'https://cdn.test/cuaderno.jpg' }),
    ]);

    expect(cards).toHaveLength(1);
    expect(cards[0].header).toEqual({ type: 'image', link: 'https://cdn.test/cuaderno.jpg' });
  });

  it('cae a la imagen de respaldo del tenant si el producto no tiene foto', () => {
    const cards = resolve([makeItem({ id: 'p1', name: 'Cuaderno' })], 'https://cdn.test/logo.jpg');

    expect(cards).toHaveLength(1);
    expect(cards[0].header).toEqual({ type: 'image', link: 'https://cdn.test/logo.jpg' });
  });

  it('la foto propia le gana al respaldo', () => {
    const cards = resolve(
      [makeItem({ id: 'p1', imageUrl: 'https://cdn.test/propia.jpg' })],
      'https://cdn.test/logo.jpg',
    );

    expect(cards[0].header).toEqual({ type: 'image', link: 'https://cdn.test/propia.jpg' });
  });

  it('omite el producto sin foto cuando el tenant tampoco tiene respaldo', () => {
    const cards = resolve([
      makeItem({ id: 'p1', name: 'Con foto', imageUrl: 'https://cdn.test/a.jpg' }),
      makeItem({ id: 'p2', name: 'Sin foto' }),
    ]);

    expect(cards).toHaveLength(1);
    expect(cards[0].buttons[0]).toMatchObject({ id: 'p1' });
  });

  it('devuelve [] si ningun producto tiene foto ni hay respaldo', () => {
    expect(resolve([makeItem({ id: 'p1' }), makeItem({ id: 'p2' })])).toEqual([]);
  });

  it('devuelve [] con catalogo vacio', () => {
    expect(resolve([])).toEqual([]);
  });
});

// ============================================================================
// FILTROS Y LIMITES DE META
// ============================================================================

describe('CarouselCardResolver - filtros y limites Meta', () => {
  it('excluye los productos no disponibles', () => {
    const cards = resolve(
      [
        makeItem({ id: 'p1', name: 'Disponible', available: true }),
        makeItem({ id: 'p2', name: 'Agotado', available: false }),
      ],
      'https://cdn.test/logo.jpg',
    );

    expect(cards.map((c) => c.buttons[0])).toEqual([
      { type: 'quick_reply', id: 'p1', title: 'Ver detalle' },
    ]);
  });

  it('corta en 10 cards aunque el catalogo tenga mas', () => {
    const catalog = Array.from({ length: 25 }, (_, i) => makeItem({ id: `p${i}` }));
    const cards = resolve(catalog, 'https://cdn.test/logo.jpg');

    expect(cards).toHaveLength(10);
    expect(cards[9].buttons[0]).toMatchObject({ id: 'p9' });
  });

  it('el corte de 10 cuenta cards reales, no productos leidos', () => {
    // Los 12 primeros no tienen foto y no hay respaldo: se omiten. Deben
    // entrar los 10 siguientes, no quedarse el carrusel corto.
    const sinFoto = Array.from({ length: 12 }, (_, i) => makeItem({ id: `x${i}` }));
    const conFoto = Array.from({ length: 15 }, (_, i) =>
      makeItem({ id: `p${i}`, imageUrl: 'https://cdn.test/a.jpg' }),
    );

    const cards = resolve([...sinFoto, ...conFoto]);

    expect(cards).toHaveLength(10);
    expect(cards[0].buttons[0]).toMatchObject({ id: 'p0' });
  });

  it('trunca el titulo del boton a 20 chars (regla Meta)', () => {
    const cards = resolve([makeItem({ id: 'p1', imageUrl: 'https://cdn.test/a.jpg' })], undefined, {
      cards_source: 'catalog_items',
      button_title: 'Quiero este producto ahora mismo',
    });

    const title = cards[0].buttons[0].type === 'quick_reply' ? cards[0].buttons[0].title : '';
    expect(title).toHaveLength(20);
    expect(title.endsWith('…')).toBe(true);
  });
});

// ============================================================================
// FORMA DE LA CARD
// ============================================================================

describe('CarouselCardResolver - forma de la card generada', () => {
  it('el body lleva nombre y precio con dos decimales', () => {
    const cards = resolve([
      makeItem({ id: 'p1', name: 'Cuaderno profesional', price: 34.5, imageUrl: 'https://cdn.test/a.jpg' }),
    ]);

    expect(cards[0].body).toBe('Cuaderno profesional\n$34.50');
  });

  it('el id del boton ES el id del producto - es lo que card_any guarda en contexto', () => {
    const cards = resolve([
      makeItem({ id: 'uuid-del-producto', imageUrl: 'https://cdn.test/a.jpg' }),
    ]);

    expect(cards[0].buttons).toEqual([
      { type: 'quick_reply', id: 'uuid-del-producto', title: 'Ver detalle' },
    ]);
  });

  it('cada card lleva exactamente un boton quick_reply', () => {
    const cards = resolve(
      [makeItem({ id: 'p1' }), makeItem({ id: 'p2' })],
      'https://cdn.test/logo.jpg',
    );

    for (const card of cards) {
      expect(card.buttons).toHaveLength(1);
      expect(card.buttons[0].type).toBe('quick_reply');
    }
  });
});
