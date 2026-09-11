/**
 * Carrito de la venta actual. Funciones puras: reciben las líneas y devuelven
 * líneas nuevas, sin tocar IndexedDB.
 *
 * La aritmética es la misma que RegisterSaleUseCase en el backend (impuesto
 * aditivo, redondeo a centavos) para que lo que ve el cajero coincida con lo
 * que calcula el servidor mientras el catálogo de la laptop esté al día.
 */
import type { CatalogProduct, PaymentMethod } from './db';
import { roundMoney } from './money';

export interface CartLine {
  productId: string;
  name: string;
  sku: string;
  unitPrice: number;
  taxRate: number;
  quantity: number;
  trackStock: boolean;
  stockQty: number;
}

export interface CartTotals {
  subtotal: number;
  taxTotal: number;
  total: number;
}

export function addToCart(lines: CartLine[], product: CatalogProduct, quantity = 1): CartLine[] {
  const existing = lines.find((l) => l.productId === product.id);
  if (existing) {
    return lines.map((l) =>
      l.productId === product.id ? { ...l, quantity: l.quantity + quantity } : l,
    );
  }
  return [
    ...lines,
    {
      productId: product.id,
      name: product.name,
      sku: product.sku,
      unitPrice: product.unitPrice,
      taxRate: product.taxRate,
      quantity,
      trackStock: product.trackStock,
      stockQty: product.stockQty,
    },
  ];
}

/** Cantidad ≤ 0 quita la línea. */
export function setQuantity(lines: CartLine[], productId: string, quantity: number): CartLine[] {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return lines.filter((l) => l.productId !== productId);
  }
  return lines.map((l) => (l.productId === productId ? { ...l, quantity } : l));
}

export function lineSubtotal(line: CartLine): number {
  return roundMoney(line.unitPrice * line.quantity);
}

export function cartTotals(lines: CartLine[]): CartTotals {
  let subtotal = 0;
  let taxTotal = 0;
  for (const line of lines) {
    const sub = lineSubtotal(line);
    subtotal += sub;
    taxTotal += roundMoney((sub * line.taxRate) / 100);
  }
  subtotal = roundMoney(subtotal);
  taxTotal = roundMoney(taxTotal);
  return { subtotal, taxTotal, total: roundMoney(subtotal + taxTotal) };
}

/**
 * Productos que se van a vender por encima de lo que marca el inventario.
 * No bloquea la venta: el producto está físicamente en el mostrador y el
 * servidor la registrará marcada para revisión.
 */
export function overStockLines(lines: CartLine[]): CartLine[] {
  return lines.filter((l) => l.trackStock && l.quantity > l.stockQty);
}

/**
 * ¿Se puede cobrar? Efectivo: lo recibido cubre el total. Tarjeta y
 * transferencia: se cobra exacto, sin cambio.
 */
export function paymentProblem(
  lines: CartLine[],
  method: PaymentMethod,
  amountPaid: number | null,
): string | null {
  if (lines.length === 0) return 'Agrega al menos un producto';
  const { total } = cartTotals(lines);
  if (method !== 'cash') return null;
  if (amountPaid === null) return 'Escribe cuánto te dieron';
  if (amountPaid < total) return 'Lo recibido no cubre el total';
  return null;
}
