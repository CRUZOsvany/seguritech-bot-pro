import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getPausedPhones, resumeHandoff, type PausedPhone } from '@/shared/api/tenants';

/**
 * Teléfonos actualmente pausados por handoff humano (P5, endpoint agregado
 * ex profeso — ver comentario en tenantsRouter.ts). staleTime corto: es
 * estado operativo que cambia con cada #listo del dueño o TTL vencido.
 */
export function usePausedPhones(tenantId: string) {
  return useQuery<PausedPhone[]>({
    queryKey: ['paused-phones', tenantId],
    queryFn: () => getPausedPhones(tenantId),
    staleTime: 10 * 1000,
    refetchOnWindowFocus: true,
    enabled: Boolean(tenantId),
  });
}

export function useResumeHandoff(tenantId: string) {
  const qc = useQueryClient();
  return useMutation<void, Error, { phoneNumber: string }>({
    mutationFn: ({ phoneNumber }) => resumeHandoff(tenantId, phoneNumber),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['paused-phones', tenantId] });
    },
  });
}
