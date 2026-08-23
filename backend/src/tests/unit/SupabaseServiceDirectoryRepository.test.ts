/**
 * Tests del repositorio del directorio de servicios (Capa 2, migración 020).
 *
 * Mismo patrón de mock fluent de PostgREST que SupabaseBotFlowRepository.draft.test.ts:
 * el builder es "thenable" (como el PostgrestFilterBuilder real de supabase-js),
 * así que `await query` resuelve directo sin necesitar un terminal explícito
 * cuando el repositorio no llama .single()/.maybeSingle().
 */
import pino from 'pino';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseServiceDirectoryRepository } from '@/infrastructure/repositories/SupabaseServiceDirectoryRepository';

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const silentLogger = pino({ level: 'silent' });

interface Step {
  data?: unknown;
  error?: { message: string } | null;
}

function makeSupabase(steps: Step[]): {
  client: SupabaseClient;
  calls: Array<{ method: string; args: unknown[] }>;
} {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  let i = 0;
  function next(): Step {
    const s = steps[i++];
    if (!s) throw new Error(`No more mock steps (consumed ${i})`);
    return s;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function chain(): any {
    const builder: any = {
      eq: (...args: unknown[]) => { calls.push({ method: 'eq', args }); return builder; },
      order: (...args: unknown[]) => { calls.push({ method: 'order', args }); return builder; },
      select: (...args: unknown[]) => { calls.push({ method: 'select', args }); return builder; },
      single: () => { calls.push({ method: 'single', args: [] }); return Promise.resolve(next()); },
      // El builder real de supabase-js es "thenable" — `await query` resuelve
      // sin llamar a un terminal explícito cuando no hace falta una sola fila.
      then: (resolve: (v: Step) => void) => resolve(next()),
    };
    return builder;
  }

  const client = {
    from: (table: string) => {
      calls.push({ method: 'from', args: [table] });
      return {
        select: chain,
        insert: (row: Record<string, unknown>) => {
          calls.push({ method: 'insert', args: [row] });
          return chain();
        },
        update: (row: Record<string, unknown>) => {
          calls.push({ method: 'update', args: [row] });
          return chain();
        },
        delete: () => {
          calls.push({ method: 'delete', args: [] });
          return chain();
        },
      };
    },
  } as unknown as SupabaseClient;

  return { client, calls };
}

describe('SupabaseServiceDirectoryRepository', () => {
  it('listByTenant mapea filas y filtra por tenant', async () => {
    const { client, calls } = makeSupabase([
      {
        data: [
          {
            id: 'e1',
            tenant_id: TENANT_ID,
            nombre: 'Copia de llave',
            keywords: ['copia', 'duplicado'],
            respuesta: 'Sí, hacemos copias.',
            precio: '25.00',
            activo: true,
            orden: 0,
          },
        ],
      },
    ]);
    const repo = new SupabaseServiceDirectoryRepository(client, silentLogger);

    const result = await repo.listByTenant(TENANT_ID);

    expect(result).toEqual([
      {
        id: 'e1',
        tenantId: TENANT_ID,
        nombre: 'Copia de llave',
        keywords: ['copia', 'duplicado'],
        respuesta: 'Sí, hacemos copias.',
        precio: 25,
        activo: true,
        orden: 0,
      },
    ]);
    expect(calls[0]).toEqual({ method: 'from', args: ['tenant_service_directory'] });
    expect(calls.some((c) => c.method === 'eq' && c.args[0] === 'tenant_id')).toBe(true);
  });

  it('listByTenant con onlyActive agrega el filtro activo=true', async () => {
    const { client, calls } = makeSupabase([{ data: [] }]);
    const repo = new SupabaseServiceDirectoryRepository(client, silentLogger);

    await repo.listByTenant(TENANT_ID, { onlyActive: true });

    expect(calls.some((c) => c.method === 'eq' && c.args[0] === 'activo' && c.args[1] === true))
      .toBe(true);
  });

  it('listByTenant propaga el error de Supabase como excepción', async () => {
    const { client } = makeSupabase([{ data: null, error: { message: 'boom' } }]);
    const repo = new SupabaseServiceDirectoryRepository(client, silentLogger);

    await expect(repo.listByTenant(TENANT_ID)).rejects.toThrow('listByTenant failed: boom');
  });

  it('create inserta con tenant_id y precio null si no viene', async () => {
    const { client, calls } = makeSupabase([
      {
        data: {
          id: 'e2',
          tenant_id: TENANT_ID,
          nombre: 'Servicio nuevo',
          keywords: ['nuevo'],
          respuesta: 'ok',
          precio: null,
          activo: true,
          orden: 1,
        },
      },
    ]);
    const repo = new SupabaseServiceDirectoryRepository(client, silentLogger);

    const entry = await repo.create(TENANT_ID, {
      nombre: 'Servicio nuevo',
      keywords: ['nuevo'],
      respuesta: 'ok',
      activo: true,
      orden: 1,
    });

    expect(entry.id).toBe('e2');
    expect(entry.precio).toBeUndefined();
    const insertCall = calls.find((c) => c.method === 'insert');
    expect((insertCall!.args[0] as Record<string, unknown>).tenant_id).toBe(TENANT_ID);
    expect((insertCall!.args[0] as Record<string, unknown>).precio).toBeNull();
  });

  it('update solo envía los campos presentes en el patch', async () => {
    const { client, calls } = makeSupabase([
      {
        data: {
          id: 'e1',
          tenant_id: TENANT_ID,
          nombre: 'Renombrado',
          keywords: ['x'],
          respuesta: 'r',
          precio: null,
          activo: true,
          orden: 0,
        },
      },
    ]);
    const repo = new SupabaseServiceDirectoryRepository(client, silentLogger);

    await repo.update(TENANT_ID, 'e1', { nombre: 'Renombrado' });

    const updateCall = calls.find((c) => c.method === 'update');
    expect(updateCall!.args[0]).toEqual({ nombre: 'Renombrado' });
  });

  it('delete filtra por tenant_id e id', async () => {
    const { client, calls } = makeSupabase([{ data: null, error: null }]);
    const repo = new SupabaseServiceDirectoryRepository(client, silentLogger);

    await repo.delete(TENANT_ID, 'e1');

    const eqCalls = calls.filter((c) => c.method === 'eq');
    expect(eqCalls).toEqual([
      { method: 'eq', args: ['tenant_id', TENANT_ID] },
      { method: 'eq', args: ['id', 'e1'] },
    ]);
  });
});
