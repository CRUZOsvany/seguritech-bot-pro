import type { NewPosProduct, PosProduct } from '@/domain/entities/pos/Product';

export interface PosProductListOptions {
  categoryId?: string;
  activeOnly?: boolean;
  limit?: number;
  offset?: number;
}

/** Patch parcial para update() — todo opcional salvo lo que identifica el registro (tenantId/id van aparte). */
export type PosProductPatch = Partial<Omit<NewPosProduct, 'tenantId' | 'sku'>> & {
  sku?: string;
};

/**
 * Puerto: persistencia de productos POS.
 *
 * IMPORTANTE: todos los métodos reciben tenantId y deben aplicar
 * `WHERE tenant_id = ?` en la query. La RLS de Supabase es segunda barrera.
 *
 * Sprint 5.1a expuso solo lectura. Sprint 5.2 (Bloque 5, carga de catálogo)
 * agrega create/update/upsertBySku.
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
  /** Crea un producto nuevo. Falla si (tenantId, sku) ya existe (constraint unique). */
  create(product: NewPosProduct): Promise<PosProduct>;
  /** Actualiza un producto existente por id. */
  update(tenantId: string, id: string, patch: PosProductPatch): Promise<PosProduct>;
  /**
   * Crea si (tenantId, sku) no existe, actualiza si ya existe. Usado por el
   * import de catálogo (Bloque 5) — hace de `create`/`update` un solo paso
   * idempotente por SKU.
   */
  upsertBySku(product: NewPosProduct): Promise<{ product: PosProduct; created: boolean }>;
}
