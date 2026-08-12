import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { listPausedEscalations, resumeHandoff, type PausedEscalation } from '@/shared/api/tenants';

/**
 * Bandeja de escalaciones (P8) — cross-tenant, supervisión interna de
 * SegurITech (ADR-001: no es una herramienta del dueño). staleTime corto:
 * es estado operativo que cambia con cada #listo del dueño o TTL vencido.
 */
export function useEscalations() {
  return useQuery<PausedEscalation[]>({
    queryKey: ['escalations'],
    queryFn: listPausedEscalations,
    staleTime: 10 * 1000,
    refetchOnWindowFocus: true,
    refetchInterval: 30 * 1000,
  });
}

export function useResumeEscalation() {
  const qc = useQueryClient();
  return useMutation<void, Error, { tenantId: string; phoneNumber: string }>({
    mutationFn: ({ tenantId, phoneNumber }) => resumeHandoff(tenantId, phoneNumber),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['escalations'] });
      // La vista de conversaciones por tenant (P5) también depende de este
      // mismo estado — invalidar por si el operador tiene ambas abiertas.
      qc.invalidateQueries({ queryKey: ['paused-phones'] });
    },
  });
}
