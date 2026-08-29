/**
 * DEC-12 (auditoría 2026-08-26): wiring de enforceRestrictedGiroGuardrail
 * dentro de publishDraft(). Cubre solo el camino de RECHAZO a propósito —
 * ahí publishDraft lanza antes de llegar a insertar la versión o activar
 * el flow (setActiveFlow), así que no hace falta mockear esos pasos
 * posteriores. Los casos "permitido" (giro no restringido, flow sin
 * catalog_items, categorías limpias) ya están cubiertos exhaustivamente y
 * sin mocks de Supabase en restrictedGiroCatalogGuardrail.test.ts — ese es
 * el lugar correcto para esa lógica, esto solo prueba que el repositorio
 * la invoca con los datos reales del tenant.
 *
 * Mismo patrón de mock fluent de PostgREST que TenantServiceRepository.test.ts
 * (builder thenable para queries sin .maybeSingle() al final, ej. listados).
 */
import pino from 'pino';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseBotFlowRepository } from '@/infrastructure/repositories/SupabaseBotFlowRepository';
import { RestrictedGiroGuardrailError } from '@/domain/validators/restrictedGiroCatalogGuardrail';

const FLOW_ID = '00000000-0000-0000-0000-000000000010';
const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const silentLogger = pino({ level: 'silent' });

interface Step {
  data?: unknown;
  error?: { message: string } | null;
}

/** flow válido (flowSchema) con un send_list que expone catalog_items. */
const DRAFT_WITH_CATALOG_LIST = {
  version: '1.0',
  start_node_id: 'menu',
  nodes: [
    {
      id: 'menu',
      type: 'send_list',
      content: {
        text: 'Catálogo',
        button_label: 'Ver',
        sections: [{ type: 'dynamic', title: 'Productos', items_source: 'catalog_items' }],
      },
      transitions: [{ condition: { type: 'default' }, next_node_id: 'fin' }],
    },
    { id: 'fin', type: 'end', content: {}, transitions: [] },
  ],
};

function makeSupabase(steps: Step[]): { client: SupabaseClient } {
  let i = 0;
  function next(): Step {
    const s = steps[i++];
    if (!s) throw new Error(`No more mock steps (consumed ${i})`);
    return s;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function chain(): any {
    const terminal = (): Promise<Step> => Promise.resolve(next());
    const builder: any = {
      select: () => builder,
      eq: () => builder,
      order: () => builder,
      limit: () => builder,
      maybeSingle: () => terminal(),
      // Sin .maybeSingle() al final (ej. la query de categorías, que trae
      // varias filas): el builder mismo es thenable, como el PostgrestFilterBuilder real.
      then: (resolve: (v: Step) => unknown, reject?: (e: unknown) => unknown) =>
        terminal().then(resolve, reject),
    };
    return builder;
  }

  const client = {
    from: (_table: string) => ({ select: chain }),
  } as unknown as SupabaseClient;

  return { client };
}

describe('SupabaseBotFlowRepository.publishDraft — guardrail de giro restringido (DEC-12)', () => {
  it('rechaza: giro=farmacia, flow expone catalog_items, catálogo tiene categoría restringida', async () => {
    const { client } = makeSupabase([
      { data: { draft_json: DRAFT_WITH_CATALOG_LIST, channel: 'whatsapp' } }, // 1. read bot_flows
      { data: { giro: 'farmacia' } }, // 2. read tenants.giro
      { data: [{ category: 'Medicamentos Controlados' }, { category: 'Higiene' }] }, // 3. read catalog_items
    ]);
    const repo = new SupabaseBotFlowRepository(client, silentLogger);

    await expect(
      repo.publishDraft({ flowId: FLOW_ID, tenantId: TENANT_ID, createdBy: null }),
    ).rejects.toBeInstanceOf(RestrictedGiroGuardrailError);
  });

  it('el error incluye las categorías ofensoras reales del tenant', async () => {
    const { client } = makeSupabase([
      { data: { draft_json: DRAFT_WITH_CATALOG_LIST, channel: 'whatsapp' } },
      { data: { giro: 'medico' } },
      { data: [{ category: 'Psicotrópicos' }] },
    ]);
    const repo = new SupabaseBotFlowRepository(client, silentLogger);

    await expect(
      repo.publishDraft({ flowId: FLOW_ID, tenantId: TENANT_ID, createdBy: null }),
    ).rejects.toMatchObject({ offendingCategories: ['Psicotrópicos'] });
  });

  it('giro no restringido: NO consulta tenants/catalog_items del guardrail (se agota en el 4º step, el insert de versión)', async () => {
    // Solo damos 1 step (read bot_flows) -- si el código intentara leer
    // tenants o catalog_items, el mock tronaría con "No more mock steps"
    // ANTES de llegar al insert. Como flowExposesCatalogItems() es true
    // pero el giro no es restringido, isRestrictedGiro() corta ahí (ver
    // enforceRestrictedGiroGuardrail) -- solo se hace la query de tenants,
    // ninguna de catalog_items.
    const { client } = makeSupabase([
      { data: { draft_json: DRAFT_WITH_CATALOG_LIST, channel: 'whatsapp' } }, // 1. read bot_flows
      { data: { giro: 'papeleria' } }, // 2. read tenants.giro -- no restringido, corta aquí
    ]);
    const repo = new SupabaseBotFlowRepository(client, silentLogger);

    // Después del guardrail (que no lanza), publishDraft sigue a insertar
    // la versión -- eso SÍ tronaría por falta de steps, y es la señal de
    // que el guardrail no hizo la 3ª query (catalog_items) de más.
    await expect(
      repo.publishDraft({ flowId: FLOW_ID, tenantId: TENANT_ID, createdBy: null }),
    ).rejects.toThrow('No more mock steps');
  });
});
