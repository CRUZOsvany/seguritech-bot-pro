import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/shared/api/client';
import { updateTenant, type UpdateTenantInput } from '@/shared/api/tenants';

export function useUpdateTenant(tenantId: string) {
  const qc = useQueryClient();
  return useMutation<void, Error, UpdateTenantInput>({
    mutationFn: (patch) => updateTenant(tenantId, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenant', tenantId] });
      qc.invalidateQueries({ queryKey: ['tenants'] });
      toast.success('Datos guardados');
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });
}
