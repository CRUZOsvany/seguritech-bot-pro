import type { PosCategory } from '@/domain/entities/pos/Category';

/**
 * Puerto: persistencia de categorías POS.
 *
 * Sprint 5.1a expone solo lectura. CRUD en Sprint 5.2.
 */
export interface PosCategoryRepository {
  findById(tenantId: string, id: string): Promise<PosCategory | null>;
  list(tenantId: string, activeOnly?: boolean): Promise<PosCategory[]>;
}
