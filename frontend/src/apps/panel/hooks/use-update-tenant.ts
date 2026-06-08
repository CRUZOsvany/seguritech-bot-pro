import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateTenant, type UpdateTenantInput } from '@/shared/api/tenants';

export function useUpdateTenant(tenantId: string) {
  const qc = useQueryClient();
  return useMutation<void, Error, UpdateTenantInput>({
    mutationFn: (patch) => updateTenant(tenantId, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenant', tenantId] });
      qc.invalidateQueries({ queryKey: ['tenants'] });
    },
  });
}
