import type { NewPosCategory, PosCategory } from '@/domain/entities/pos/Category';

/**
 * Puerto: persistencia de categorías POS.
 *
 * Sprint 5.1a expuso solo lectura. Sprint 5.2 (Bloque 5) agrega
 * findByName/create — el import de catálogo resuelve categorías por nombre
 * (el CSV trae texto, no UUIDs) y las crea sobre la marcha si no existen.
 */
export interface PosCategoryRepository {
  findById(tenantId: string, id: string): Promise<PosCategory | null>;
  /** Match exacto por nombre (constraint unique(tenant_id, name)). */
  findByName(tenantId: string, name: string): Promise<PosCategory | null>;
  list(tenantId: string, activeOnly?: boolean): Promise<PosCategory[]>;
  /** Crea una categoría. Falla si (tenantId, name) ya existe. */
  create(category: NewPosCategory): Promise<PosCategory>;
}
