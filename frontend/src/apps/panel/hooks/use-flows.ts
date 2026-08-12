import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  listFlows,
  getDraft,
  saveDraft,
  publishFlow,
  listVersions,
  getVersionFlow,
  rollbackToVersion,
  type FlowSummary,
  type FlowVersion,
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
      qc.invalidateQueries({ queryKey: ['flow-versions', tenantId, flowId] });
    },
  });
}

/** Historial de versiones publicadas de un flow (P6). */
export function useVersions(tenantId: string, flowId: string | null) {
  return useQuery<FlowVersion[]>({
    queryKey: ['flow-versions', tenantId, flowId],
    queryFn: () => listVersions(tenantId, flowId as string),
    staleTime: 15 * 1000,
    refetchOnWindowFocus: false,
    enabled: Boolean(tenantId && flowId),
  });
}

/**
 * Trae el flow_json de una versión histórica (sin publicar). El caller
 * (designer.tsx) lo carga al canvas vía `loadFromBotFlow(flow, flowId, true)`
 * — el `true` marca dirty, porque el contenido ya difiere de lo persistido.
 */
export function useFetchVersionFlow(tenantId: string) {
  return useMutation<unknown, Error, { flowId: string; versionId: string }>({
    mutationFn: ({ flowId, versionId }) => getVersionFlow(tenantId, flowId, versionId),
  });
}

/** Rollback inmediato — super_admin only (D5, 403 si no lo es). */
export function useRollback(tenantId: string) {
  const qc = useQueryClient();
  return useMutation<
    { versionNumber: number },
    Error,
    { flowId: string; versionNumber: number }
  >({
    mutationFn: ({ flowId, versionNumber }) => rollbackToVersion(tenantId, flowId, versionNumber),
    onSuccess: (_data, { flowId }) => {
      qc.invalidateQueries({ queryKey: ['flows', tenantId] });
      qc.invalidateQueries({ queryKey: ['flow-draft', tenantId, flowId] });
      qc.invalidateQueries({ queryKey: ['flow-versions', tenantId, flowId] });
      qc.invalidateQueries({ queryKey: ['tenant', tenantId] });
    },
  });
}
