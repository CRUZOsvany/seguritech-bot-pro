/**
 * Catálogo local de la caja: búsqueda, pestañas y actualización desde el
 * servidor. La búsqueda es 100% local para que funcione sin internet.
 */
import type { CajaDb, CatalogProduct } from './db';
import type { ServerProduct } from './api';

export type CatalogTab = 'all' | 'products' | 'services';

/** Servicio = no descuenta stock (impresión, engargolado). */
export function isService(p: CatalogProduct): boolean {
  return p.unitType === 'service' || !p.trackStock;
}

/** Minúsculas y sin acentos: "Lápiz" y "lapiz" son lo mismo para el cajero. */
export function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

export function filterCatalog(
  products: CatalogProduct[],
  tab: CatalogTab,
  search: string,
): CatalogProduct[] {
  const q = normalize(search);
  return products
    .filter((p) => (tab === 'all' ? true : tab === 'services' ? isService(p) : !isService(p)))
    .filter(
      (p) =>
        !q ||
        normalize(p.name).includes(q) ||
        normalize(p.sku).includes(q) ||
        (p.barcode ?? '').includes(q),
    )
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

export interface QuickMatch {
  /** Coincidencia única: se agrega directo al presionar Enter. */
  exact: CatalogProduct | null;
  suggestions: CatalogProduct[];
}

/**
 * "Agregar rápido": lector de código de barras o teclado.
 *   1. código de barras exacto
 *   2. SKU exacto (sin importar mayúsculas)
 *   3. nombre/SKU que contiene el texto — si queda uno solo, es exacto
 */
export function quickMatch(products: CatalogProduct[], query: string, limit = 8): QuickMatch {
  const raw = query.trim();
  if (!raw) return { exact: null, suggestions: [] };

  const byBarcode = products.find((p) => p.barcode === raw);
  if (byBarcode) return { exact: byBarcode, suggestions: [byBarcode] };

  const q = normalize(raw);
  const bySku = products.find((p) => normalize(p.sku) === q);
  if (bySku) return { exact: bySku, suggestions: [bySku] };

  const matches = products
    .filter((p) => normalize(p.name).includes(q) || normalize(p.sku).includes(q))
    .sort((a, b) => {
      // Primero los que empiezan con el texto.
      const aStarts = normalize(a.name).startsWith(q) ? 0 : 1;
      const bStarts = normalize(b.name).startsWith(q) ? 0 : 1;
      return aStarts - bStarts || a.name.localeCompare(b.name, 'es');
    });
  return {
    exact: matches.length === 1 ? matches[0] : null,
    suggestions: matches.slice(0, limit),
  };
}

const PAGE = 500;

/**
 * Reemplaza el catálogo local por el del servidor. Solo trae productos
 * activos: lo que se desactivó en el panel desaparece de la caja.
 */
export async function refreshCatalog(
  db: CajaDb,
  fetchPage: (limit: number, offset: number) => Promise<{ products: ServerProduct[] }>,
): Promise<number> {
  const all: CatalogProduct[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { products } = await fetchPage(PAGE, offset);
    for (const p of products) {
      all.push({
        id: p.id,
        sku: p.sku,
        barcode: p.barcode,
        name: p.name,
        unitType: p.unitType,
        unitPrice: p.unitPrice,
        taxRate: p.taxRate,
        stockQty: p.stockQty,
        stockMin: p.stockMin,
        trackStock: p.trackStock,
      });
    }
    if (products.length < PAGE) break;
  }

  await db.transaction('rw', db.catalog, db.meta, async () => {
    await db.catalog.clear();
    await db.catalog.bulkPut(all);
    await db.meta.put({ key: 'catalogRefreshedAt', value: new Date().toISOString() });
  });
  return all.length;
}
