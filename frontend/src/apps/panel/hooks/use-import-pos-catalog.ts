import { useMutation } from '@tanstack/react-query';
import { importPosCatalog, type CatalogImportResult } from '@/shared/api/pos';

interface Vars {
  tenantId: string;
  file: File;
  dryRun: boolean;
}

/**
 * Import de catálogo POS (Bloque 5). Sin invalidación de query — el panel
 * no tiene todavía una lista de productos que refrescar (esa pantalla es
 * trabajo futuro); el resultado se muestra inline en la misma página.
 */
export function useImportPosCatalog() {
  return useMutation<CatalogImportResult, Error, Vars>({
    mutationFn: ({ tenantId, file, dryRun }) => importPosCatalog(tenantId, file, dryRun),
  });
}
