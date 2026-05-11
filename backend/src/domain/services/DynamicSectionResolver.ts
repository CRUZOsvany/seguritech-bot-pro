import type pino from 'pino';
import type { ListSection, ListItem, ItemsSource } from '@/domain/entities/flow';
import type { TenantConfig } from '@/domain/entities';

/**
 * Hidrata secciones dinámicas (items_source) de un nodo send_list, leyendo
 * datos del tenant. En V1 la única fuente válida es 'catalog_items', que se
 * lee desde el TenantConfig.catalog (precargado por SupabaseTenantConfigService).
 *
 * Comportamiento ante catálogo vacío:
 *  - Si una sección dinámica resuelve a 0 items → devuelve sección con items=[].
 *  - El FlowInterpreter cuenta items totales después de resolver. Si total = 0,
 *    transiciona al `default` del nodo. Si total > 0, omite secciones vacías
 *    individuales y envía el list.
 */
export class DynamicSectionResolver {
  constructor(private readonly logger: pino.Logger) {}

  resolve(
    sections: ListSection[],
    tenantConfig: TenantConfig,
  ): Array<{ title: string; items: ListItem[] }> {
    return sections.map((section) => {
      if (section.type === 'static') {
        return { title: section.title, items: section.items };
      }
      return {
        title: section.title,
        items: this.resolveSource(section.items_source, tenantConfig),
      };
    });
  }

  private resolveSource(source: ItemsSource, tenantConfig: TenantConfig): ListItem[] {
    switch (source) {
    case 'catalog_items':
      return tenantConfig.catalog
        .filter((c) => c.available)
        .slice(0, 10)
        .map((c) => ({
          id: c.id,
          title: this.truncate(c.name, 24),
          description: this.truncate(`$${c.price.toFixed(2)}`, 72),
        }));
    default: {
      const _exhaustive: never = source;
      this.logger.warn({ source: _exhaustive }, 'items_source desconocido');
      return [];
    }
    }
  }

  private truncate(s: string, max: number): string {
    return s.length <= max ? s : s.slice(0, max - 1) + '…';
  }
}