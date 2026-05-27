import { apiFetch } from './client';

/**
 * Match exacto del shape que devuelve GET /api/admin/tenants en el backend.
 * Ver: backend/src/domain/ports/TenantRepository.ts → TenantSummary
 */
export interface TenantSummary {
  id: string;
  nombre_negocio: string;
  giro: string;
  status: TenantStatus;
  webhook_verified: boolean;
  has_active_flow: boolean;
}

export type TenantStatus =
  | 'draft'
  | 'sandbox'
  | 'live'
  | 'paused'
  | 'archived';

interface ListTenantsResponse {
  tenants: TenantSummary[];
}

export async function listTenants(): Promise<TenantSummary[]> {
  const res = await apiFetch<ListTenantsResponse>('GET', '/api/admin/tenants');
  return res.tenants;
}
