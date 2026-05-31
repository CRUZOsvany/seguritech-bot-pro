import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  setServiceStatus,
  type ServiceType,
  type ServiceStatus,
} from '@/shared/api/tenants';

interface Vars {
  tenantId: string;
  serviceType: ServiceType;
  status: ServiceStatus;
}

export function useSetServiceStatus() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, Vars>({
    mutationFn: ({ tenantId, serviceType, status }) =>
      setServiceStatus(tenantId, serviceType, status),
    onSuccess: (_data, { tenantId }) => {
      queryClient.invalidateQueries({ queryKey: ['tenant-services', tenantId] });
    },
  });
}
