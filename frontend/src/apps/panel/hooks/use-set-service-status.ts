import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/shared/api/client';
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

const SUCCESS_MESSAGES: Partial<Record<ServiceStatus, string>> = {
  active: 'Servicio activado',
  paused: 'Servicio pausado',
  archived: 'Servicio archivado',
};

export function useSetServiceStatus() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, Vars>({
    mutationFn: ({ tenantId, serviceType, status }) =>
      setServiceStatus(tenantId, serviceType, status),
    onSuccess: (_data, { tenantId, status }) => {
      queryClient.invalidateQueries({ queryKey: ['tenant-services', tenantId] });
      toast.success(SUCCESS_MESSAGES[status] ?? 'Estado del servicio actualizado');
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });
}
