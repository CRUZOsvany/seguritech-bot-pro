import type { PosSale, ResolvedPosSale } from '@/domain/entities/pos/Sale';

/**
 * Puerto: persistencia de ventas POS (pos_sales + pos_sale_items).
 *
 * IMPORTANTE: todos los métodos reciben tenantId y deben aplicar
 * `WHERE tenant_id = ?` en la query. La RLS de Supabase es segunda barrera.
 *
 * El repositorio NUNCA toca pos_products.stock_qty ni pos_inventory_movements:
 * insertar las líneas en pos_sale_items dispara los triggers de la migración
 * 011 que hacen ambas cosas. Hacerlo aquí sería doble descuento.
 */
export interface PosSaleRepository {
  /**
   * Inserta encabezado + líneas. Idempotente por (tenantId, clientId): si la
   * venta ya existe (reintento de sincronización), devuelve la fila existente
   * sin insertar líneas de nuevo — así los triggers de stock no se disparan dos
   * veces.
   */
  create(tenantId: string, cashierId: string, sale: ResolvedPosSale): Promise<PosSale>;
  findByClientId(tenantId: string, clientId: string): Promise<PosSale | null>;
  /** Ventas de una sesión de caja, más recientes primero. */
  listByCashSession(tenantId: string, cashSessionId: string): Promise<PosSale[]>;
  /** Cuántas ventas tiene la sesión — base del ticket secuencial. */
  countByCashSession(tenantId: string, cashSessionId: string): Promise<number>;
}
