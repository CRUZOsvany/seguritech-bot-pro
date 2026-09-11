import { afterEach, describe, expect, it } from 'vitest';
import { addToCart, cartTotals, overStockLines, paymentProblem, setQuantity } from './cart';
import { filterCatalog, isService, quickMatch, refreshCatalog } from './catalog';
import { parseMoney, roundMoney } from './money';
import { tenantIdFromPath } from './tenant';
import { CajaDb, type CatalogProduct } from './db';
import type { ServerProduct } from './api';

function product(over: Partial<CatalogProduct>): CatalogProduct {
  return {
    id: over.sku ?? 'id',
    sku: 'SKU',
    barcode: null,
    name: 'Producto',
    unitType: 'piece',
    unitPrice: 10,
    taxRate: 0,
    stockQty: 5,
    stockMin: 1,
    trackStock: true,
    ...over,
  };
}

const lapiz = product({ id: 'lapiz', sku: 'LAP-001', barcode: '7501031', name: 'Lápiz Mirado', unitPrice: 5 });
const lapicero = product({ id: 'lapicero', sku: 'LAPC-2', name: 'Lapicero azul', unitPrice: 8 });
const cuaderno = product({ id: 'cuaderno', sku: 'CUA-1', name: 'Cuaderno', unitPrice: 50, taxRate: 16 });
const impresion = product({ id: 'imp', sku: 'IMP', name: 'Impresión B/N', unitType: 'service', trackStock: false, stockQty: 0, unitPrice: 2 });
const catalog = [lapiz, lapicero, cuaderno, impresion];

describe('carrito', () => {
  it('agrega, suma cantidades del mismo producto y quita con cantidad 0', () => {
    let lines = addToCart([], lapiz);
    lines = addToCart(lines, lapiz, 2);
    lines = addToCart(lines, cuaderno);
    expect(lines.map((l) => [l.productId, l.quantity])).toEqual([['lapiz', 3], ['cuaderno', 1]]);

    lines = setQuantity(lines, 'lapiz', 0);
    expect(lines.map((l) => l.productId)).toEqual(['cuaderno']);
  });

  it('calcula totales igual que el servidor (impuesto aditivo, centavos)', () => {
    const lines = addToCart(addToCart([], cuaderno, 3), lapiz, 1);
    expect(cartTotals(lines)).toEqual({ subtotal: 155, taxTotal: 24, total: 179 });
  });

  it('avisa (sin bloquear) cuando se vende más de lo que marca el inventario', () => {
    const lines = addToCart(addToCart([], lapiz, 6), impresion, 50);
    expect(overStockLines(lines).map((l) => l.productId)).toEqual(['lapiz']);
  });

  it('valida el pago: efectivo cubre el total; tarjeta no pide monto', () => {
    const lines = addToCart([], lapiz, 2);
    expect(paymentProblem([], 'cash', 100)).toBe('Agrega al menos un producto');
    expect(paymentProblem(lines, 'cash', null)).toBe('Escribe cuánto te dieron');
    expect(paymentProblem(lines, 'cash', 9.99)).toBe('Lo recibido no cubre el total');
    expect(paymentProblem(lines, 'cash', 10)).toBeNull();
    expect(paymentProblem(lines, 'card', null)).toBeNull();
  });
});

describe('catálogo', () => {
  it('separa productos y servicios', () => {
    expect(isService(impresion)).toBe(true);
    expect(filterCatalog(catalog, 'services', '').map((p) => p.id)).toEqual(['imp']);
    expect(filterCatalog(catalog, 'products', '').map((p) => p.id)).toEqual(['cuaderno', 'lapicero', 'lapiz']);
  });

  it('busca sin importar acentos ni mayúsculas', () => {
    expect(filterCatalog(catalog, 'all', 'LAPIZ').map((p) => p.id)).toEqual(['lapiz']);
    expect(filterCatalog(catalog, 'all', 'impresion').map((p) => p.id)).toEqual(['imp']);
  });

  it('agregar rápido: código de barras y SKU exactos ganan', () => {
    expect(quickMatch(catalog, '7501031').exact?.id).toBe('lapiz');
    expect(quickMatch(catalog, 'cua-1').exact?.id).toBe('cuaderno');
  });

  it('agregar rápido: una sola coincidencia por nombre es exacta; varias son sugerencias', () => {
    expect(quickMatch(catalog, 'cuader').exact?.id).toBe('cuaderno');
    const many = quickMatch(catalog, 'lap');
    expect(many.exact).toBeNull();
    expect(many.suggestions.map((p) => p.id)).toEqual(['lapicero', 'lapiz']);
    expect(quickMatch(catalog, '   ')).toEqual({ exact: null, suggestions: [] });
  });

  it('refreshCatalog pagina de 500 en 500 y reemplaza lo local', async () => {
    const db = new CajaDb(`test-${crypto.randomUUID()}`);
    await db.catalog.put(product({ id: 'viejo', sku: 'OLD' }));
    const page = (n: number, from: number): ServerProduct[] =>
      Array.from({ length: n }, (_, i) => ({
        id: `p${from + i}`,
        sku: `S${from + i}`,
        barcode: null,
        name: `P ${from + i}`,
        unitType: 'piece',
        unitPrice: 1,
        taxRate: 0,
        stockQty: 1,
        stockMin: 0,
        trackStock: true,
        isActive: true,
      }));
    const offsets: number[] = [];

    const count = await refreshCatalog(db, async (limit, offset) => {
      offsets.push(offset);
      return { products: offset === 0 ? page(limit, 0) : page(3, offset) };
    });

    expect(offsets).toEqual([0, 500]);
    expect(count).toBe(503);
    expect(await db.catalog.get('viejo')).toBeUndefined();
    expect(await db.catalog.count()).toBe(503);
    await db.delete();
  });
});

describe('dinero y URL', () => {
  it('parseMoney acepta formatos comunes y rechaza basura', () => {
    expect(parseMoney('500')).toBe(500);
    expect(parseMoney('500,50')).toBe(500.5);
    expect(parseMoney('$1,200.00')).toBe(1200);
    expect(parseMoney('')).toBeNull();
    expect(parseMoney('-5')).toBeNull();
    expect(parseMoney('abc')).toBeNull();
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
  });

  it('el tenant sale de /caja/<uuid>/', () => {
    const id = '00000000-0000-0000-0000-0000000000AA';
    expect(tenantIdFromPath(`/caja/${id}/`)).toBe(id.toLowerCase());
    expect(tenantIdFromPath(`/caja/${id}`)).toBe(id.toLowerCase());
    expect(tenantIdFromPath('/caja/')).toBeNull();
    expect(tenantIdFromPath('/caja/no-es-uuid/')).toBeNull();
  });
});

afterEach(() => undefined);
