import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  listFlows,
  getDraft,
  saveDraft,
  publishFlow,
  type FlowSummary,
} from '@/shared/api/flows';

/** Lista de flows del tenant (resuelve el flowId del designer). */
export function useFlows(tenantId: string) {
  return useQuery<FlowSummary[]>({
    queryKey: ['flows', tenantId],
    queryFn: () => listFlows(tenantId),
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
    enabled: Boolean(tenantId),
  });
}

/** Draft crudo de un flow (unknown: el backend no lo valida). */
export function useDraft(tenantId: string, flowId: string | null) {
  return useQuery<unknown>({
    queryKey: ['flow-draft', tenantId, flowId],
    queryFn: () => getDraft(tenantId, flowId as string),
    refetchOnWindowFocus: false,
    enabled: Boolean(tenantId && flowId),
  });
}

export function useSaveDraft(tenantId: string) {
  const qc = useQueryClient();
  return useMutation<void, Error, { flowId: string; flow: unknown }>({
    mutationFn: ({ flowId, flow }) => saveDraft(tenantId, flowId, flow),
    onSuccess: (_data, { flowId }) => {
      qc.invalidateQueries({ queryKey: ['flows', tenantId] });
      qc.invalidateQueries({ queryKey: ['flow-draft', tenantId, flowId] });
    },
  });
}

export function usePublish(tenantId: string) {
  const qc = useQueryClient();
  return useMutation<{ versionNumber: number }, Error, { flowId: string }>({
    mutationFn: ({ flowId }) => publishFlow(tenantId, flowId),
    onSuccess: (_data, { flowId }) => {
      qc.invalidateQueries({ queryKey: ['flows', tenantId] });
      qc.invalidateQueries({ queryKey: ['flow-draft', tenantId, flowId] });
      qc.invalidateQueries({ queryKey: ['tenant', tenantId] });
    },
  });
}
