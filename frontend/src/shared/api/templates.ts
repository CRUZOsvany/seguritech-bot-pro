import { apiFetch } from './client';

/**
 * Espejo de Array<{ slug, giro, nombre, descripcion }> que devuelve
 * GET /api/admin/templates.
 * Ver: backend/src/domain/ports/BotFlowRepository.ts → listTemplates()
 */
export interface BotFlowTemplate {
  slug: string;
  giro: string;
  nombre: string;
  descripcion: string | null;
}

interface ListTemplatesResponse {
  templates: BotFlowTemplate[];
}

export async function listTemplates(): Promise<BotFlowTemplate[]> {
  const res = await apiFetch<ListTemplatesResponse>('GET', '/api/admin/templates');
  return res.templates;
}
