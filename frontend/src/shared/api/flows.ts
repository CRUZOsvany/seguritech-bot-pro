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
