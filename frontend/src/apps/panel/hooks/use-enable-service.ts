import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  enableService,
  type ServiceType,
  type TenantServiceItem,
} from '@/shared/api/tenants';

interface Vars {
  tenantId: string;
  serviceType: ServiceType;
}

export function useEnableService() {
  const queryClient = useQueryClient();

  return useMutation<TenantServiceItem, Error, Vars>({
    mutationFn: ({ tenantId, serviceType }) =>
      enableService(tenantId, serviceType),
    onSuccess: (_data, { tenantId }) => {
      queryClient.invalidateQueries({ queryKey: ['tenant-services', tenantId] });
    },
  });
}
