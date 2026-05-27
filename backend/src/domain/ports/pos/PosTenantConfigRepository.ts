import type { PosTenantConfig } from '@/domain/entities/pos/PosTenantConfig';

/**
 * Puerto: configuración POS por tenant.
 *
 * Sprint 5.1a expone solo getByTenant. La escritura (cuando un cajero/admin
 * actualiza header/footer/etc) llega en Sprint 5.2.
 */
export interface PosTenantConfigRepository {
  getByTenant(tenantId: string): Promise<PosTenantConfig | null>;
}
