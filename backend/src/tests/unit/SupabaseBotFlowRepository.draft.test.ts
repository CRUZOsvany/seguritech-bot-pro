/**
 * Tests de la concurrencia optimista del draft (P7): getDraftMeta() y el
 * chequeo condicional de saveDraft(). Sin esto, "dos pestañas abiertas, la
 * segunda no pisa a la primera" no se puede verificar sin un Supabase real.
 *
 * Mismo patrón de mock fluent de PostgREST que TenantServiceRepository.test.ts:
 * cada chain de Supabase termina en una promesa resoluble con { data, error }.
 */
import pino from 'pino';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseBotFlowRepository } from '@/infrastructure/repositories/SupabaseBotFlowRepository';

const FLOW_ID = '00000000-0000-0000-0000-000000000010';
const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const silentLogger = pino({ level: 'silent' });

interface Step {
  data?: unknown;
  error?: { message: string } | null;
}

/** Registra las llamadas a .eq()/.is() del chain activo, para poder assertar sobre ellas. */
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
    const terminal = (): Promise<Step> => Promise.resolve(next());
    const builder: any = {
      eq: (...args: unknown[]) => { calls.push({ method: 'eq', args }); return builder; },
      is: (...args: unknown[]) => { calls.push({ method: 'is', args }); return builder; },
      select: (...args: unknown[]) => { calls.push({ method: 'select', args }); return terminal(); },
      maybeSingle: () => terminal(),
    };
    return builder;
  }

  const client = {
    from: () => ({
      select: chain,
      update: (patch: Record<string, unknown>) => {
        calls.push({ method: 'update', args: [patch] });
        return chain();
      },
    }),
  } as unknown as SupabaseClient;

  return { client, calls };
}

describe('SupabaseBotFlowRepository — getDraftMeta (P7)', () => {
  it('devuelve el timestamp cuando el flow existe con draft', async () => {
    const { client } = makeSupabase([{ data: { draft_updated_at: '2026-08-05T10:00:00.000Z' } }]);
    const repo = new SupabaseBotFlowRepository(client, silentLogger);

    const result = await repo.getDraftMeta(FLOW_ID, TENANT_ID);
    expect(result).toEqual({ draftUpdatedAt: '2026-08-05T10:00:00.000Z' });
  });

  it('devuelve draftUpdatedAt: null cuando el flow existe sin draft', async () => {
    const { client } = makeSupabase([{ data: { draft_updated_at: null } }]);
    const repo = new SupabaseBotFlowRepository(client, silentLogger);

    const result = await repo.getDraftMeta(FLOW_ID, TENANT_ID);
    expect(result).toEqual({ draftUpdatedAt: null });
  });

  it('devuelve null cuando el flow no existe', async () => {
    const { client } = makeSupabase([{ data: null }]);
    const repo = new SupabaseBotFlowRepository(client, silentLogger);

    const result = await repo.getDraftMeta(FLOW_ID, TENANT_ID);
    expect(result).toBeNull();
  });
});

describe('SupabaseBotFlowRepository — saveDraft (concurrencia optimista, P7)', () => {
  it('sin expectedDraftUpdatedAt: sobrescribe sin condición (comportamiento del Designer)', async () => {
    const { client, calls } = makeSupabase([{ data: [{ id: FLOW_ID }] }]);
    const repo = new SupabaseBotFlowRepository(client, silentLogger);

    const result = await repo.saveDraft({ flowId: FLOW_ID, tenantId: TENANT_ID, flow: { a: 1 } });

    expect(result.conflict).toBe(false);
    if (!result.conflict) expect(result.draftUpdatedAt).toBeTruthy();
    // Sin expectedDraftUpdatedAt, NO debe llamarse .is() ni un tercer .eq() de draft_updated_at.
    expect(calls.some((c) => c.method === 'is')).toBe(false);
  });

  it('con expectedDraftUpdatedAt que matchea: guarda y devuelve conflict:false', async () => {
    const { client, calls } = makeSupabase([{ data: [{ id: FLOW_ID }] }]);
    const repo = new SupabaseBotFlowRepository(client, silentLogger);

    const result = await repo.saveDraft({
      flowId: FLOW_ID,
      tenantId: TENANT_ID,
      flow: { a: 1 },
      expectedDraftUpdatedAt: '2026-08-05T10:00:00.000Z',
    });

    expect(result.conflict).toBe(false);
    expect(
      calls.some((c) => c.method === 'eq' && c.args[0] === 'draft_updated_at'),
    ).toBe(true);
  });

  it('con expectedDraftUpdatedAt que NO matchea (0 filas afectadas): devuelve conflict:true y no escribe', async () => {
    const { client } = makeSupabase([{ data: [] }]);
    const repo = new SupabaseBotFlowRepository(client, silentLogger);

    const result = await repo.saveDraft({
      flowId: FLOW_ID,
      tenantId: TENANT_ID,
      flow: { a: 1 },
      expectedDraftUpdatedAt: '2026-08-05T09:00:00.000Z', // desactualizado
    });

    expect(result).toEqual({ conflict: true });
  });

  it('con expectedDraftUpdatedAt: null usa .is() en vez de .eq() (caso "todavía sin draft")', async () => {
    const { client, calls } = makeSupabase([{ data: [{ id: FLOW_ID }] }]);
    const repo = new SupabaseBotFlowRepository(client, silentLogger);

    const result = await repo.saveDraft({
      flowId: FLOW_ID,
      tenantId: TENANT_ID,
      flow: { a: 1 },
      expectedDraftUpdatedAt: null,
    });

    expect(result.conflict).toBe(false);
    expect(calls.some((c) => c.method === 'is' && c.args[0] === 'draft_updated_at')).toBe(true);
  });

  it('propaga el error de Supabase como Error', async () => {
    const { client } = makeSupabase([{ error: { message: 'boom' } }]);
    const repo = new SupabaseBotFlowRepository(client, silentLogger);

    await expect(
      repo.saveDraft({ flowId: FLOW_ID, tenantId: TENANT_ID, flow: {} }),
    ).rejects.toThrow('boom');
  });
});
