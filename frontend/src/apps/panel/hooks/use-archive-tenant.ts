import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/shared/api/client';
import { archiveTenant } from '@/shared/api/tenants';

export function useArchiveTenant(tenantId: string) {
  const qc = useQueryClient();
  return useMutation<void, Error, void>({
    mutationFn: () => archiveTenant(tenantId),
    onSuccess: () => {
      // Archivado = invisible para todas las lecturas (deleted_at): el detalle
      // cacheado ya no corresponde a nada que el backend vaya a devolver.
      qc.removeQueries({ queryKey: ['tenant', tenantId] });
      qc.invalidateQueries({ queryKey: ['tenants'] });
      toast.success('Cliente archivado');
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });
}
