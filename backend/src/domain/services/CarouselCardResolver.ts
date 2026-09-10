import type pino from 'pino';
import type {
  CarouselCardsSource,
  DynamicCarouselCards,
  MediaCarouselCard,
} from '@/domain/entities/flow';
import type { TenantConfig } from '@/domain/entities';

/**
 * Hidrata las cards de un nodo send_media_carousel declarado con
 * `dynamic_cards`, leyendo el catálogo del tenant. Hermano de
 * DynamicSectionResolver, que hace lo mismo para las secciones de send_list.
 *
 * La diferencia dura con las listas: Meta exige header image/video en CADA
 * card. Un producto sin foto propia usa `TenantConfig.fallbackImageUrl` (la
 * imagen genérica del negocio, migración 021); si el tenant tampoco la tiene
 * configurada, ese producto queda fuera del carrusel. Es preferible un
 * carrusel más corto que un mensaje que Meta rechaza entero.
 *
 * Comportamiento ante catálogo vacío o sin fotos: devuelve []. El
 * FlowInterpreter cuenta las cards después de resolver y, con 0, transiciona
 * al `default` del nodo — mismo contrato que un send_list que resuelve a 0
 * items.
 */
export class CarouselCardResolver {
  /** Meta: máximo 10 cards por carrusel. */
  private static readonly MAX_CARDS = 10;
  /** Meta: title de un quick_reply <= 20 chars. */
  private static readonly MAX_BUTTON_TITLE = 20;
  /** Meta: body de una card <= 1024 chars. */
  private static readonly MAX_CARD_BODY = 1024;

  constructor(private readonly logger: pino.Logger) {}

  resolve(dynamic: DynamicCarouselCards, tenantConfig: TenantConfig): MediaCarouselCard[] {
    const buttonTitle = this.truncate(dynamic.button_title, CarouselCardResolver.MAX_BUTTON_TITLE);
    const cards = this.resolveSource(dynamic.cards_source, tenantConfig, buttonTitle);

    if (cards.length === 0) {
      this.logger.warn(
        { tenantId: tenantConfig.tenantId, source: dynamic.cards_source },
        'Carrusel dinámico resolvió a 0 cards (catálogo vacío o sin imágenes)',
      );
    }
    return cards;
  }

  private resolveSource(
    source: CarouselCardsSource,
    tenantConfig: TenantConfig,
    buttonTitle: string,
  ): MediaCarouselCard[] {
    switch (source) {
    case 'catalog_items': {
      const cards: MediaCarouselCard[] = [];
      let sinImagen = 0;

      for (const item of tenantConfig.catalog) {
        if (!item.available) continue;
        if (cards.length >= CarouselCardResolver.MAX_CARDS) break;

        const link = item.imageUrl ?? tenantConfig.fallbackImageUrl;
        if (!link) {
          sinImagen += 1;
          continue;
        }

        cards.push({
          header: { type: 'image', link },
          body: this.truncate(
            `${item.name}\n$${item.price.toFixed(2)}`,
            CarouselCardResolver.MAX_CARD_BODY,
          ),
          // El id del botón ES el id del producto: así `card_any` puede
          // guardarlo en contexto y {{selected_product_name}} /
          // {{selected_product_price}} resuelven sin lookup extra.
          buttons: [{ type: 'quick_reply', id: item.id, title: buttonTitle }],
        });
      }

      if (sinImagen > 0) {
        this.logger.warn(
          { tenantId: tenantConfig.tenantId, sinImagen },
          'Productos omitidos del carrusel por no tener imagen ni respaldo del tenant',
        );
      }
      return cards;
    }
    default: {
      const _exhaustive: never = source;
      this.logger.warn({ source: _exhaustive }, 'cards_source desconocido');
      return [];
    }
    }
  }

  private truncate(s: string, max: number): string {
    return s.length <= max ? s : s.slice(0, max - 1) + '…';
  }
}
