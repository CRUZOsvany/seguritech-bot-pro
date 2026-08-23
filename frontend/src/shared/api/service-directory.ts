import { apiFetch } from './client';

/**
 * API del directorio de servicios de un tenant (Capa 2 de la arquitectura
 * híbrida sin IA — ver `.claude/PLAN_V1_BOT_FLOWS_SIN_IA.md`). Backend:
 * backend/src/infrastructure/server/admin/serviceDirectoryRouter.ts.
 *
 * Data-driven: el operador carga/edita entradas desde el panel; el flow solo
 * referencia la condición `service_directory_match` — nunca el texto en sí.
 */

export interface ServiceDirectoryEntry {
  id: string;
  tenantId: string;
  nombre: string;
  keywords: string[];
  respuesta: string;
  precio?: number;
  activo: boolean;
  orden: number;
}

export interface ServiceDirectoryEntryInput {
  nombre: string;
  keywords: string[];
  respuesta: string;
  precio?: number;
  activo?: boolean;
  orden?: number;
}

export type ServiceDirectoryEntryPatch = Partial<ServiceDirectoryEntryInput>;

export async function listServiceDirectory(
  tenantId: string,
): Promise<ServiceDirectoryEntry[]> {
  const res = await apiFetch<{ entries: ServiceDirectoryEntry[] }>(
    'GET',
    `/api/admin/tenants/${tenantId}/service-directory`,
  );
  return res.entries;
}

export async function createServiceDirectoryEntry(
  tenantId: string,
  input: ServiceDirectoryEntryInput,
): Promise<ServiceDirectoryEntry> {
  const res = await apiFetch<{ entry: ServiceDirectoryEntry }>(
    'POST',
    `/api/admin/tenants/${tenantId}/service-directory`,
    input,
  );
  return res.entry;
}

export async function updateServiceDirectoryEntry(
  tenantId: string,
  entryId: string,
  patch: ServiceDirectoryEntryPatch,
): Promise<ServiceDirectoryEntry> {
  const res = await apiFetch<{ entry: ServiceDirectoryEntry }>(
    'PUT',
    `/api/admin/tenants/${tenantId}/service-directory/${entryId}`,
    patch,
  );
  return res.entry;
}

export async function deleteServiceDirectoryEntry(
  tenantId: string,
  entryId: string,
): Promise<void> {
  await apiFetch<{ ok: true }>(
    'DELETE',
    `/api/admin/tenants/${tenantId}/service-directory/${entryId}`,
  );
}
