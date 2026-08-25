/**
 * Cierra el gap real de la auditoría 2026-08-24 (Fase 5 de
 * `.claude/PROMPT_DEMO_PAPELERIA_STRESS_TEST.md`): `TenantConfig.catalogSynonyms`
 * debe resolverse por `tenants.giro`, nunca `undefined` ni tirar si el giro
 * no tiene diccionario mapeado.
 *
 * Mismo patrón de stub de Supabase que
 * `SupabaseTenantConfigService.serviceDirectory.test.ts`.
 */
import pino from 'pino';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseTenantConfigService } from '@/infrastructure/services/SupabaseTenantConfigService';
import { PAPELERIA_SYNONYMS } from '@/domain/moulds/papeleria.synonyms';

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const silentLogger = pino({ level: 'silent' });

interface TableResult {
  data?: unknown;
  error?: { message: string } | null;
}

function makeSupabase(tables: Record<string, TableResult>): SupabaseClient {
  return {
    from: (table: string) => {
      const result = tables[table] ?? { data: null, error: null };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        order: () => builder,
        maybeSingle: () => Promise.resolve(result),
        then: (resolve: (v: TableResult) => void) => resolve(result),
      };
      return builder;
    },
  } as unknown as SupabaseClient;
}

const baseTables = {
  bot_configurations: { data: { nombre_bot: 'Asistente', tono_bot: 'amigable' } },
  catalog_items: { data: [] },
  owner_data: { data: null },
  tenant_service_directory: { data: [] },
};

describe('SupabaseTenantConfigService — catalogSynonyms por giro (§2.1, gap cerrado 2026-08-24)', () => {
  it("giro='papeleria' trae exactamente PAPELERIA_SYNONYMS", async () => {
    const supabase = makeSupabase({
      ...baseTables,
      tenants: { data: { nombre_negocio: 'Papelería Prueba', giro: 'papeleria' } },
    });
    const service = new SupabaseTenantConfigService(supabase, silentLogger);

    const config = await service.getConfig(TENANT_ID);

    expect(config?.catalogSynonyms).toEqual(PAPELERIA_SYNONYMS);
  });

  it("giro sin diccionario mapeado (ej. 'cerrajeria') trae {} — no undefined, no throw", async () => {
    const supabase = makeSupabase({
      ...baseTables,
      tenants: { data: { nombre_negocio: 'Cerrajería Prueba', giro: 'cerrajeria' } },
    });
    const service = new SupabaseTenantConfigService(supabase, silentLogger);

    const config = await service.getConfig(TENANT_ID);

    expect(config?.catalogSynonyms).toEqual({});
  });

  it('tenants sin giro (null/ausente) trae {} — no undefined, no throw', async () => {
    const supabase = makeSupabase({
      ...baseTables,
      tenants: { data: { nombre_negocio: 'Tenant Sin Giro' } },
    });
    const service = new SupabaseTenantConfigService(supabase, silentLogger);

    const config = await service.getConfig(TENANT_ID);

    expect(config?.catalogSynonyms).toEqual({});
  });
});
