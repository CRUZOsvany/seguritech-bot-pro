import { useQuery } from '@tanstack/react-query';
import {
  listTenantServices,
  type TenantServiceItem,
} from '@/shared/api/tenants';

export function useTenantServices(tenantId: string) {
  return useQuery<TenantServiceItem[]>({
    queryKey: ['tenant-services', tenantId],
    queryFn: () => listTenantServices(tenantId),
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
    enabled: Boolean(tenantId),
  });
}
