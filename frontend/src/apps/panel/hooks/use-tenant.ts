import { useQuery } from '@tanstack/react-query';
import { getTenant, type TenantDetail } from '@/shared/api/tenants';

export function useTenant(id: string) {
  return useQuery<TenantDetail>({
    queryKey: ['tenant', id],
    queryFn: () => getTenant(id),
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
    enabled: Boolean(id),
  });
}
