import { apiUpload } from './client';

// ============================================================
// Import de catálogo POS (Bloque 5) — POST .../pos/products/import
// ============================================================

export interface CatalogImportRowError {
  row: number;
  sku?: string;
  message: string;
}

export interface CatalogImportResult {
  created: number;
  updated: number;
  errors: CatalogImportRowError[];
}

/**
 * dryRun=true → preview: corre toda la validación y resolución de
 * categorías/SKUs existentes, pero no escribe nada. El panel lo usa para
 * mostrar "se van a crear X, actualizar Y, N errores" antes de confirmar.
 */
export async function importPosCatalog(
  tenantId: string,
  file: File,
  dryRun: boolean,
): Promise<CatalogImportResult> {
  const form = new FormData();
  form.append('file', file);
  form.append('dryRun', String(dryRun));
  return apiUpload<CatalogImportResult>(
    `/api/admin/tenants/${tenantId}/pos/products/import`,
    form,
  );
}
