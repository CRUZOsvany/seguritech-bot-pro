import { useQuery } from '@tanstack/react-query';
import { listTenants, type TenantSummary } from '@/shared/api/tenants';

/**
 * Lista todos los tenants visibles según el rol del admin actual.
 * El backend ya filtra a admin_operator → solo su tenant.
 *
 * staleTime 30s porque los tenants cambian raramente (creación manual del MSP)
 * y no queremos refetchear en cada navegación interna.
 */
export function useTenants() {
  return useQuery<TenantSummary[]>({
    queryKey: ['tenants'],
    queryFn: listTenants,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
  });
}
