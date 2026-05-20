import type { PosProduct } from '@/domain/entities/pos/Product';

export interface PosProductListOptions {
  categoryId?: string;
  activeOnly?: boolean;
  limit?: number;
  offset?: number;
}

/**
 * Puerto: persistencia de productos POS.
 *
 * IMPORTANTE: todos los métodos reciben tenantId y deben aplicar
 * `WHERE tenant_id = ?` en la query. La RLS de Supabase es segunda barrera.
 *
 * Sprint 5.1a expone solo lectura. CRUD completo en Sprint 5.2.
 */
export interface PosProductRepository {
  findById(tenantId: string, id: string): Promise<PosProduct | null>;
  findByBarcode(tenantId: string, barcode: string): Promise<PosProduct | null>;
  findBySku(tenantId: string, sku: string): Promise<PosProduct | null>;
  /**
   * Búsqueda fulltext-lite por nombre/sku/barcode. Limit por defecto 20.
   */
  search(tenantId: string, query: string, limit?: number): Promise<PosProduct[]>;
  list(
    tenantId: string,
    options?: PosProductListOptions,
  ): Promise<PosProduct[]>;
  countActive(tenantId: string): Promise<number>;
}
