import type { TenantSummary } from '@/shared/api/tenants';

/** Minúsculas y sin acentos: «papelería» encuentra el giro «papeleria» y al revés. */
function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * Buscador de la tabla de Clientes: coincidencia parcial contra nombre, giro y
 * status, sin distinguir mayúsculas ni acentos. Client-side a propósito: son
 * pocos tenants y la lista ya está cargada.
 */
export function filterTenants(tenants: TenantSummary[], query: string): TenantSummary[] {
  const q = fold(query.trim());
  if (!q) return tenants;
  return tenants.filter((t) =>
    [t.nombre_negocio, t.giro, t.status].some((field) => fold(field).includes(q)),
  );
}
