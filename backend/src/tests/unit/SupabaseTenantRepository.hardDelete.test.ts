/**
 * SupabaseTenantRepository — las piezas del borrado permanente.
 *
 * Mock fluent de PostgREST que registra la cadena de llamadas: lo que importa
 * aquí es QUÉ se le pide a Supabase (un DELETE por id, una lectura que NO
 * filtra deleted_at, un conteo de operadores), no el SQL resultante.
 */
import pino from 'pino';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseTenantRepository } from '@/infrastructure/repositories/SupabaseTenantRepository';

const TENANT = '00000000-0000-0000-0000-0000000000aa';
const logger = pino({ level: 'silent' });

interface Builder extends PromiseLike<unknown> {
  select(cols: string, opts?: unknown): Builder;
  delete(): Builder;
  eq(col: string, val: unknown): Builder;
  is(col: string, val: unknown): Builder;
  maybeSingle(): Promise<unknown>;
}

function makeSupabase(result: { data?: unknown; count?: number | null; error?: { message: string } | null }) {
  const tables: string[] = [];
  const calls: string[] = [];
  const settled: Promise<unknown> = Promise.resolve({ data: null, error: null, ...result });
  const builder: Builder = {
    select: (cols, opts) => {
      calls.push(opts ? `select(${cols},${JSON.stringify(opts)})` : `select(${cols})`);
      return builder;
    },
    delete: () => { calls.push('delete'); return builder; },
    eq: (col, val) => { calls.push(`eq(${col},${String(val)})`); return builder; },
    is: (col, val) => { calls.push(`is(${col},${String(val)})`); return builder; },
    maybeSingle: () => settled,
    then: (onfulfilled, onrejected) => settled.then(onfulfilled, onrejected),
  };
  const client = {
    from: (table: string) => { tables.push(table); return builder; },
  } as unknown as SupabaseClient;
  return { repo: new SupabaseTenantRepository(client, logger), tables, calls };
}

describe('SupabaseTenantRepository.hardDelete', () => {
  it('hace DELETE de la fila del tenant por id y deja el resto al cascade', async () => {
    const { repo, tables, calls } = makeSupabase({ error: null });

    await repo.hardDelete(TENANT);

    expect(tables).toEqual(['tenants']);
    expect(calls).toEqual(['delete', `eq(id,${TENANT})`]);
  });

  it('propaga el error de Supabase en vez de dar el borrado por hecho', async () => {
    const { repo } = makeSupabase({ error: { message: 'boom' } });

    await expect(repo.hardDelete(TENANT)).rejects.toThrow('hardDelete tenant: boom');
  });
});

describe('SupabaseTenantRepository.findIncludingDeleted', () => {
  it('lee nombre y status sin filtrar deleted_at', async () => {
    const { repo, calls } = makeSupabase({
      data: { id: TENANT, nombre_negocio: 'Papelería DEMO', status: 'archived' },
    });

    const found = await repo.findIncludingDeleted(TENANT);

    expect(found).toEqual({ id: TENANT, nombre_negocio: 'Papelería DEMO', status: 'archived' });
    expect(calls).toEqual(['select(id, nombre_negocio, status)', `eq(id,${TENANT})`]);
    expect(calls.some((c) => c.startsWith('is('))).toBe(false);
  });

  it('devuelve null si la fila no existe', async () => {
    const { repo } = makeSupabase({ data: null });

    await expect(repo.findIncludingDeleted(TENANT)).resolves.toBeNull();
  });

  it('propaga el error de lectura', async () => {
    const { repo } = makeSupabase({ error: { message: 'down' } });

    await expect(repo.findIncludingDeleted(TENANT)).rejects.toThrow('findIncludingDeleted failed: down');
  });
});

describe('SupabaseTenantRepository.countAdminOperators', () => {
  it('cuenta en admin_users los admin_operator de ese tenant, sin traer filas', async () => {
    const { repo, tables, calls } = makeSupabase({ count: 2 });

    await expect(repo.countAdminOperators(TENANT)).resolves.toBe(2);

    expect(tables).toEqual(['admin_users']);
    expect(calls).toEqual([
      'select(id,{"count":"exact","head":true})',
      `eq(tenant_id,${TENANT})`,
      'eq(role,admin_operator)',
    ]);
  });

  it('sin count (ninguna fila) es 0', async () => {
    const { repo } = makeSupabase({ count: null });

    await expect(repo.countAdminOperators(TENANT)).resolves.toBe(0);
  });

  it('si la lectura falla lanza, no devuelve 0', async () => {
    const { repo } = makeSupabase({ error: { message: 'down' } });

    await expect(repo.countAdminOperators(TENANT)).rejects.toThrow('countAdminOperators failed: down');
  });
});
