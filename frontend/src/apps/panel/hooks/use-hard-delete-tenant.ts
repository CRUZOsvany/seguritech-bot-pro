import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/shared/api/client';
import { hardDeleteTenant } from '@/shared/api/tenants';

/** La variable de la mutación es el nombre que escribió el operador. */
export function useHardDeleteTenant(tenantId: string) {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (confirmNombreNegocio) => hardDeleteTenant(tenantId, confirmNombreNegocio),
    onSuccess: () => {
      qc.removeQueries({ queryKey: ['tenant', tenantId] });
      qc.invalidateQueries({ queryKey: ['tenants'] });
      toast.success('Cliente eliminado permanentemente');
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });
}
