/**
 * Tests del SupabaseTenantServiceRepository (FASE 1 — capa modular de servicios).
 *
 * Mock fluent de PostgREST: cada chain de Supabase termina en una promesa
 * resoluble con `{ data, error }` o en un método terminal (single/maybeSingle).
 * Los tests acoplan al orden de invocación de los métodos del repo, no a SQL.
 */
import pino from 'pino';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseTenantServiceRepository } from '@/infrastructure/repositories/SupabaseTenantServiceRepository';

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const SERVICE_ID = '00000000-0000-0000-0000-000000000002';
const silentLogger = pino({ level: 'silent' });

interface Step {
  data?: unknown;
  error?: { message: string } | null;
}

function makeSupabase(steps: Step[]): {
  client: SupabaseClient;
  insertedRows: unknown[];
  updatePatches: Array<Record<string, unknown>>;
} {
  const insertedRows: unknown[] = [];
  const updatePatches: Array<Record<string, unknown>> = [];
  let i = 0;

  function next(): Step {
    const s = steps[i++];
    if (!s) throw new Error(`No more mock steps (consumed ${i})`);
    return s;
  }

  function chain(label: 'select' | 'insert' | 'update'): any {
    const terminal = (): Promise<Step> => Promise.resolve(next());
    const builder: any = {
      select: () => builder,
      eq: () => builder,
      order: () => terminal(),
      maybeSingle: () => terminal(),
      single: () => terminal(),
      then: (resolve: (v: Step) => unknown) => terminal().then(resolve),
    };
    return builder;
  }

  const client = {
    from: (_table: string) => ({
      select: () => chain('select'),
      insert: (row: Record<string, unknown>) => {
        insertedRows.push(row);
        return chain('insert');
      },
      update: (patch: Record<string, unknown>) => {
        updatePatches.push(patch);
        return chain('update');
      },
    }),
  } as unknown as SupabaseClient;

  return { client, insertedRows, updatePatches };
}

function buildRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: SERVICE_ID,
    tenant_id: TENANT_ID,
    service_type: 'whatsapp_bot',
    status: 'configuring',
    enabled_at: null,
    config: {},
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('SupabaseTenantServiceRepository', () => {
  it('enable es idempotente: si el servicio ya existe, lo devuelve sin insertar', async () => {
    // findOne devuelve la fila existente → no debe haber insert.
    const { client, insertedRows } = makeSupabase([
      { data: buildRow({ status: 'active' }), error: null }, // findOne
    ]);
    const repo = new SupabaseTenantServiceRepository(client, silentLogger);

    const result = await repo.enable(TENANT_ID, 'whatsapp_bot');

    expect(result.status).toBe('active');
    expect(result.tenantId).toBe(TENANT_ID);
    expect(insertedRows).toHaveLength(0);
  });

  it('enable inserta cuando el servicio no existe (status="configuring")', async () => {
    const { client, insertedRows } = makeSupabase([
      { data: null, error: null }, // findOne → no existe
      { data: buildRow({ status: 'configuring' }), error: null }, // insert
    ]);
    const repo = new SupabaseTenantServiceRepository(client, silentLogger);

    const result = await repo.enable(TENANT_ID, 'pos');

    expect(insertedRows).toEqual([
      {
        tenant_id: TENANT_ID,
        service_type: 'pos',
        status: 'configuring',
      },
    ]);
    expect(result.status).toBe('configuring');
  });

  it('findServiceStatus devuelve null cuando no hay servicio', async () => {
    const { client } = makeSupabase([{ data: null, error: null }]);
    const repo = new SupabaseTenantServiceRepository(client, silentLogger);

    const status = await repo.findServiceStatus(TENANT_ID, 'whatsapp_bot');

    expect(status).toBeNull();
  });

  it('findServiceStatus devuelve el status del servicio existente', async () => {
    const { client } = makeSupabase([
      { data: { status: 'active' }, error: null },
    ]);
    const repo = new SupabaseTenantServiceRepository(client, silentLogger);

    const status = await repo.findServiceStatus(TENANT_ID, 'whatsapp_bot');

    expect(status).toBe('active');
  });

  it('setStatus con status="active" sella enabled_at', async () => {
    const { client, updatePatches } = makeSupabase([
      { data: null, error: null }, // update
    ]);
    const repo = new SupabaseTenantServiceRepository(client, silentLogger);

    const before = Date.now();
    await repo.setStatus(TENANT_ID, 'whatsapp_bot', 'active');
    const after = Date.now();

    expect(updatePatches).toHaveLength(1);
    const patch = updatePatches[0];
    expect(patch.status).toBe('active');
    expect(typeof patch.enabled_at).toBe('string');
    const ts = Date.parse(patch.enabled_at as string);
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it('setStatus con status="paused" NO sella enabled_at', async () => {
    const { client, updatePatches } = makeSupabase([
      { data: null, error: null },
    ]);
    const repo = new SupabaseTenantServiceRepository(client, silentLogger);

    await repo.setStatus(TENANT_ID, 'whatsapp_bot', 'paused');

    expect(updatePatches[0]).toEqual({ status: 'paused' });
  });

  it('findOne devuelve null cuando no existe', async () => {
    const { client } = makeSupabase([{ data: null, error: null }]);
    const repo = new SupabaseTenantServiceRepository(client, silentLogger);

    const result = await repo.findOne(TENANT_ID, 'messenger_bot');

    expect(result).toBeNull();
  });

  it('listByTenant mapea filas de snake_case a camelCase', async () => {
    const { client } = makeSupabase([
      {
        data: [
          buildRow({ service_type: 'whatsapp_bot', status: 'active' }),
          buildRow({
            id: 'svc-pos',
            service_type: 'pos',
            status: 'configuring',
          }),
        ],
        error: null,
      },
    ]);
    const repo = new SupabaseTenantServiceRepository(client, silentLogger);

    const services = await repo.listByTenant(TENANT_ID);

    expect(services).toHaveLength(2);
    expect(services[0]).toMatchObject({
      tenantId: TENANT_ID,
      serviceType: 'whatsapp_bot',
      status: 'active',
    });
    expect(services[1]).toMatchObject({
      serviceType: 'pos',
      status: 'configuring',
    });
  });

  it('propaga error de Supabase como Error', async () => {
    const { client } = makeSupabase([
      { data: null, error: { message: 'db down' } },
    ]);
    const repo = new SupabaseTenantServiceRepository(client, silentLogger);

    await expect(
      repo.findServiceStatus(TENANT_ID, 'whatsapp_bot'),
    ).rejects.toThrow(/db down/);
  });
});
