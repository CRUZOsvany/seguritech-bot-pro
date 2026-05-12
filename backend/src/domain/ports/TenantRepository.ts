/**
 * Resumen de un tenant para el panel de administración.
 * Incluye has_active_flow (calculado desde bot_flows) para mostrar estado de molde.
 */
export interface TenantSummary {
  id: string;
  nombre_negocio: string;
  giro: string;
  status: string;
  webhook_verified: boolean;
  has_active_flow: boolean;
}

/**
 * Puerto para operaciones de administración de tenants.
 * Solo usado por el panel interno de SegurITech — no expuesto al cliente final.
 */
export interface TenantRepository {
  findAll(): Promise<TenantSummary[]>;
  findById(id: string): Promise<TenantSummary | null>;
  setStatus(id: string, status: 'active' | 'paused'): Promise<void>;
}
