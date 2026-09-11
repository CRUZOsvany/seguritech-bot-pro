/**
 * Publicación atómica (Studio Fase 4, migración 023): publishVersion llama a
 * la función publish_flow_version en una sola transacción, y solo si esa
 * función no existe todavía cae al camino viejo, avisando en el log.
 */
import pino from 'pino';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { BotFlow } from '@/domain/entities/flow';
import { DraftChangedError } from '@/domain/ports/BotFlowRepository';
import { SupabaseBotFlowRepository } from '@/infrastructure/repositories/SupabaseBotFlowRepository';

const TENANT = '00000000-0000-0000-0000-000000000001';
const FLOW = '00000000-0000-0000-0000-000000000010';
const ADMIN = '00000000-0000-0000-0000-0000000000ad';

const FLOW_JSON: BotFlow = {
  version: '1.0',
  start_node_id: 'hola',
  nodes: [
    { id: 'hola', type: 'send_text', content: { text: 'Hola' }, transitions: [{ condition: { type: 'default' }, next_node_id: 'fin' }] },
    { id: 'fin', type: 'end', content: {}, transitions: [] },
  ],
};

/** Supabase mínimo: rpc programable y, para el camino viejo, un registro de escrituras. */
function makeSupabase(rpcResult: { data?: unknown; error?: { code?: string; message: string } | null }) {
  const writes: Array<{ table: string; op: string; payload?: unknown }> = [];
  const rpc = jest.fn().mockResolvedValue({ data: rpcResult.data ?? null, error: rpcResult.error ?? null });
  const chain = (table: string, result: unknown) => {
    const b: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'order', 'limit', 'is']) b[m] = () => b;
    b.maybeSingle = () => Promise.resolve(result);
    b.then = (ok: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(ok);
    b.insert = (payload: unknown) => { writes.push({ table, op: 'insert', payload }); return Promise.resolve({ error: null }); };
    b.update = (payload: unknown) => { writes.push({ table, op: 'update', payload }); return b; };
    return b;
  };
  const client = {
    rpc,
    from: (table: string) =>
      chain(table, table === 'bot_flow_versions' ? { data: { version_number: 4, flow_json: FLOW_JSON }, error: null } : { data: { channel: 'whatsapp' }, error: null }),
  } as unknown as SupabaseClient;
  return { client, rpc, writes };
}

describe('SupabaseBotFlowRepository.publishVersion', () => {
  it('publica por publish_flow_version con el flow, los reportes y el control de borrador', async () => {
    const { client, rpc } = makeSupabase({ data: 7 });
    const repo = new SupabaseBotFlowRepository(client, pino({ level: 'silent' }));

    const result = await repo.publishVersion({
      flowId: FLOW,
      tenantId: TENANT,
      flow: FLOW_JSON,
      createdBy: ADMIN,
      note: 'nota',
      validationReport: { ok: true },
      testReport: { passed: 2, failed: 0 },
      clearDraft: true,
      expectedDraftUpdatedAt: '2026-09-11T10:00:00.000Z',
    });

    expect(result).toEqual({ versionNumber: 7 });
    expect(rpc).toHaveBeenCalledWith('publish_flow_version', {
      p_tenant_id: TENANT,
      p_flow_id: FLOW,
      p_flow_json: FLOW_JSON,
      p_created_by: ADMIN,
      p_note: 'nota',
      p_validation_report: { ok: true },
      p_test_report: { passed: 2, failed: 0 },
      p_clear_draft: true,
      p_check_draft: true,
      p_expected_draft_updated_at: '2026-09-11T10:00:00.000Z',
    });
  });

  it('sin expectedDraftUpdatedAt no pide revisar el borrador (rollback)', async () => {
    const { client, rpc } = makeSupabase({ data: 8 });
    const repo = new SupabaseBotFlowRepository(client, pino({ level: 'silent' }));

    await repo.publishVersion({ flowId: FLOW, tenantId: TENANT, flow: FLOW_JSON, createdBy: 'cli', clearDraft: false });

    expect(rpc.mock.calls[0][1]).toMatchObject({ p_check_draft: false, p_expected_draft_updated_at: null, p_created_by: null });
  });

  it('si el borrador cambió mientras se revisaba, lanza DraftChangedError', async () => {
    const { client } = makeSupabase({ error: { code: '40001', message: 'draft_changed' } });
    const repo = new SupabaseBotFlowRepository(client, pino({ level: 'silent' }));

    await expect(
      repo.publishVersion({ flowId: FLOW, tenantId: TENANT, flow: FLOW_JSON, createdBy: null, clearDraft: true, expectedDraftUpdatedAt: null }),
    ).rejects.toBeInstanceOf(DraftChangedError);
  });

  it('si la función no existe (migración 023 sin aplicar), publica por el camino viejo y lo registra como error', async () => {
    const { client, writes } = makeSupabase({ error: { code: 'PGRST202', message: 'Could not find the function public.publish_flow_version' } });
    const logger = pino({ level: 'silent' });
    const errorSpy = jest.spyOn(logger, 'error');
    const repo = new SupabaseBotFlowRepository(client, logger);

    const result = await repo.publishVersion({ flowId: FLOW, tenantId: TENANT, flow: FLOW_JSON, createdBy: null, clearDraft: true });

    expect(result).toEqual({ versionNumber: 5 });
    expect(writes.map((w) => `${w.op}:${w.table}`)).toEqual(['insert:bot_flow_versions', 'update:bot_flows', 'update:bot_flows']);
    expect(errorSpy).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('migración 023'));
  });

  it('cualquier otro error de la función se propaga', async () => {
    const { client } = makeSupabase({ error: { code: 'P0002', message: 'El flow no existe' } });
    const repo = new SupabaseBotFlowRepository(client, pino({ level: 'silent' }));

    await expect(
      repo.publishVersion({ flowId: FLOW, tenantId: TENANT, flow: FLOW_JSON, createdBy: null, clearDraft: true }),
    ).rejects.toThrow('El flow no existe');
  });

  it('rollback publica el contenido de la versión vieja como versión nueva, sin tocar el borrador', async () => {
    const { client, rpc } = makeSupabase({ data: 9 });
    const repo = new SupabaseBotFlowRepository(client, pino({ level: 'silent' }));

    const result = await repo.rollback({ flowId: FLOW, tenantId: TENANT, versionNumber: 4, createdBy: ADMIN });

    expect(result).toEqual({ versionNumber: 9 });
    expect(rpc.mock.calls[0][1]).toMatchObject({
      p_flow_json: FLOW_JSON,
      p_note: 'rollback a v4',
      p_clear_draft: false,
      p_check_draft: false,
    });
  });
});
