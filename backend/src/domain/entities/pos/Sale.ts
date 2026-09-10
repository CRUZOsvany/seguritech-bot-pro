/**
 * Venta del POS (encabezado + líneas).
 *
 * Mapeo BD: pos_sales + pos_sale_items (migración 011).
 * Multi-tenant: tenantId siempre presente. RLS en BD + WHERE en repositorio.
 *
 * Offline-first: `clientId` lo genera la PWA del cajero antes de tocar la red.
 * UNIQUE(tenant_id, client_id) hace idempotente el reintento de sincronización.
 *
 * Stock e inventario NO se tocan desde código: insertar en pos_sale_items
 * dispara `pos_decrement_stock_on_sale_item` y `pos_log_inventory_on_sale_item`.
 */
export type PosPaymentMethod = 'cash' | 'card' | 'transfer' | 'mixed';

export type PosSaleStatus = 'completed' | 'cancelled' | 'refunded';

/**
 * Línea de venta. `productName`/`productSku` son snapshot al momento de la
 * venta — no se vuelven a leer de pos_products.
 */
export interface PosSaleItem {
  id: string;
  saleId: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  taxAmount: number;
  subtotal: number;
  productName: string;
  productSku: string;
}

export interface PosSale {
  id: string;
  tenantId: string;
  cashSessionId: string;
  cashierId: string;
  ticketNumber: string;
  subtotal: number;
  taxTotal: number;
  discountTotal: number;
  total: number;
  paymentMethod: PosPaymentMethod;
  amountPaid: number;
  changeGiven: number;
  customerPhone: string | null;
  customerId: string | null;
  status: PosSaleStatus;
  notes: string | null;
  createdAt: Date;
  clientId: string;
  syncedAt: Date | null;
  items: PosSaleItem[];
}

/**
 * Lo único que el cliente manda por item. Precio, nombre, sku y subtotal se
 * resuelven en el servidor contra pos_products — nunca se confía en el cliente.
 */
export interface PosSaleItemInput {
  productId: string;
  quantity: number;
}

/**
 * Input para registrar una venta. tenantId/cashierId NO van aquí: salen de la
 * cookie POS (req.posUser), nunca del body.
 */
export interface NewPosSale {
  clientId: string;
  cashSessionId: string;
  items: PosSaleItemInput[];
  paymentMethod: PosPaymentMethod;
  amountPaid: number;
}

/** Línea ya resuelta por RegisterSaleUseCase, lista para persistir. */
export interface ResolvedPosSaleLine {
  productId: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  taxAmount: number;
  subtotal: number;
  productName: string;
  productSku: string;
}

/**
 * Venta ya resuelta (precios del servidor, totales y ticket calculados).
 * Es lo que recibe PosSaleRepository.create — el repositorio no hace
 * aritmética ni consulta precios.
 */
export interface ResolvedPosSale {
  clientId: string;
  cashSessionId: string;
  ticketNumber: string;
  subtotal: number;
  taxTotal: number;
  discountTotal: number;
  total: number;
  paymentMethod: PosPaymentMethod;
  amountPaid: number;
  changeGiven: number;
  lines: ResolvedPosSaleLine[];
}
