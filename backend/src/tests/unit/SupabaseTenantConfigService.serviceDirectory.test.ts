/**
 * Cubre solo el agregado de esta fase: la 5ta query del Promise.all
 * (tenant_service_directory) y su mapeo a TenantConfig.serviceDirectory.
 * No re-testea el resto de getConfig() (catalog/config/owner), ya cubierto
 * implícitamente por el resto de la suite de integración del bot.
 */
import pino from 'pino';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseTenantConfigService } from '@/infrastructure/services/SupabaseTenantConfigService';

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
  tenants: { data: { nombre_negocio: 'Papelería Prueba' } },
  bot_configurations: { data: { nombre_bot: 'Asistente', tono_bot: 'amigable' } },
  catalog_items: { data: [] },
  owner_data: { data: null },
};

describe('SupabaseTenantConfigService — serviceDirectory (Fase 4)', () => {
  it('mapea tenant_service_directory a TenantConfig.serviceDirectory', async () => {
    const supabase = makeSupabase({
      ...baseTables,
      tenant_service_directory: {
        data: [
          {
            id: 's1',
            tenant_id: TENANT_ID,
            nombre: 'Copia de llave',
            keywords: ['copia'],
            respuesta: 'Sí hacemos.',
            precio: '25.00',
            activo: true,
            orden: 0,
          },
        ],
      },
    });
    const service = new SupabaseTenantConfigService(supabase, silentLogger);

    const config = await service.getConfig(TENANT_ID);

    expect(config?.serviceDirectory).toEqual([
      {
        id: 's1',
        tenantId: TENANT_ID,
        nombre: 'Copia de llave',
        keywords: ['copia'],
        respuesta: 'Sí hacemos.',
        precio: 25,
        activo: true,
        orden: 0,
      },
    ]);
  });

  it('usa directorio vacío (sin fallar getConfig) si la query falla', async () => {
    const supabase = makeSupabase({
      ...baseTables,
      tenant_service_directory: { data: null, error: { message: 'boom' } },
    });
    const service = new SupabaseTenantConfigService(supabase, silentLogger);

    const config = await service.getConfig(TENANT_ID);

    expect(config).not.toBeNull();
    expect(config?.serviceDirectory).toEqual([]);
  });

  it('directorio vacío cuando no hay filas', async () => {
    const supabase = makeSupabase({ ...baseTables, tenant_service_directory: { data: [] } });
    const service = new SupabaseTenantConfigService(supabase, silentLogger);

    const config = await service.getConfig(TENANT_ID);

    expect(config?.serviceDirectory).toEqual([]);
  });
});
