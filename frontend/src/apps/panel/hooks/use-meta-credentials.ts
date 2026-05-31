import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  upsertMetaCredentials,
  revokeMetaCredentials,
  type MetaCredentialsInput,
} from '@/shared/api/tenants';

export function useUpsertMetaCredentials(tenantId: string) {
  const qc = useQueryClient();
  return useMutation<{ rotatedAt: string }, Error, MetaCredentialsInput>({
    mutationFn: (input) => upsertMetaCredentials(tenantId, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tenant', tenantId] }),
  });
}

export function useRevokeMetaCredentials(tenantId: string) {
  const qc = useQueryClient();
  return useMutation<void, Error, void>({
    mutationFn: () => revokeMetaCredentials(tenantId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tenant', tenantId] }),
  });
}
