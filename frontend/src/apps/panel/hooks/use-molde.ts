import { useMutation, useQueryClient } from '@tanstack/react-query';
import { assignMolde, removeMolde } from '@/shared/api/tenants';

export function useAssignMolde(tenantId: string) {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (slug) => assignMolde(tenantId, slug),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tenant', tenantId] }),
  });
}

export function useRemoveMolde(tenantId: string) {
  const qc = useQueryClient();
  return useMutation<void, Error, void>({
    mutationFn: () => removeMolde(tenantId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tenant', tenantId] }),
  });
}
