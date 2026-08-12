import { apiFetch } from './client';

/**
 * API de flows del Bot Designer (Bloque A1, ya existente en el backend:
 * backend/src/infrastructure/server/admin/flowsRouter.ts). Aquí solo se
 * consume; A2.1 no toca backend.
 *
 * El draft se tipa como `unknown` a propósito: el backend NO lo valida
 * (puede ser parcial mientras se edita). El designer lo normaliza con
 * `isBotFlowish` antes de cargarlo al canvas.
 */

/** Espejo de listFlowsByTenant() del BotFlowRepository. */
export interface FlowSummary {
  id: string;
  channel: 'whatsapp' | 'messenger';
  nombre: string;
  isActive: boolean;
  hasDraft: boolean;
  updatedAt: string;
}

export async function listFlows(tenantId: string): Promise<FlowSummary[]> {
  const res = await apiFetch<{ flows: FlowSummary[] }>(
    'GET',
    `/api/admin/tenants/${tenantId}/flows`,
  );
  return res.flows;
}

export async function getDraft(
  tenantId: string,
  flowId: string,
): Promise<unknown | null> {
  const res = await apiFetch<{ draft: unknown | null }>(
    'GET',
    `/api/admin/tenants/${tenantId}/flows/${flowId}/draft`,
  );
  return res.draft;
}

export async function saveDraft(
  tenantId: string,
  flowId: string,
  flow: unknown,
): Promise<void> {
  await apiFetch<{ ok: true }>(
    'PUT',
    `/api/admin/tenants/${tenantId}/flows/${flowId}/draft`,
    { flow },
  );
}

export async function publishFlow(
  tenantId: string,
  flowId: string,
): Promise<{ versionNumber: number }> {
  return apiFetch<{ versionNumber: number }>(
    'POST',
    `/api/admin/tenants/${tenantId}/flows/${flowId}/publish`,
  );
}

/**
 * Forma del body de error 400 del publish: `{ error, issues }`. `issues` es la
 * lista de problemas de validación (límites Meta) que el backend devuelve.
 */
export interface PublishErrorBody {
  error: string;
  issues?: Array<{ path?: string; message: string } | string>;
}

// ============================================================
// Versiones / rollback (P6)
// ============================================================

/** Espejo de listVersions() del BotFlowRepository. */
export interface FlowVersion {
  id: string;
  versionNumber: number;
  createdAt: string;
  /** UUID de admin_users, sin resolver a email/nombre — el backend no hace el join. */
  createdBy: string | null;
  note: string | null;
}

export async function listVersions(
  tenantId: string,
  flowId: string,
): Promise<FlowVersion[]> {
  const res = await apiFetch<{ versions: FlowVersion[] }>(
    'GET',
    `/api/admin/tenants/${tenantId}/flows/${flowId}/versions`,
  );
  return res.versions;
}

/**
 * Trae el flow_json completo de una versión histórica — para "restaurar
 * como draft" (cargar al canvas SIN publicar). Distinto de rollback():
 * esto es de solo lectura, no toca bot_flows ni crea una versión nueva.
 */
export async function getVersionFlow(
  tenantId: string,
  flowId: string,
  versionId: string,
): Promise<unknown> {
  const res = await apiFetch<{ flow: unknown }>(
    'GET',
    `/api/admin/tenants/${tenantId}/flows/${flowId}/versions/${versionId}`,
  );
  return res.flow;
}

/**
 * Rollback INMEDIATO: publica la versión elegida como una nueva versión
 * activa. super_admin only (backend lo exige con 403; la UI no debe ofrecer
 * este botón a nadie más — D5).
 */
export async function rollbackToVersion(
  tenantId: string,
  flowId: string,
  versionNumber: number,
): Promise<{ versionNumber: number }> {
  return apiFetch<{ versionNumber: number }>(
    'POST',
    `/api/admin/tenants/${tenantId}/flows/${flowId}/rollback`,
    { versionNumber },
  );
}
