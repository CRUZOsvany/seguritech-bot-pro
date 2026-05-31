import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateBotConfiguration, type BotConfigPatch } from '@/shared/api/tenants';

export function useUpdateBotConfig(tenantId: string) {
  const qc = useQueryClient();
  return useMutation<void, Error, BotConfigPatch>({
    mutationFn: (patch) => updateBotConfiguration(tenantId, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tenant', tenantId] }),
  });
}
