import type { SupabaseClient } from '@supabase/supabase-js';
import type pino from 'pino';
import {
  TestCasesUnavailableError,
  type FlowTestCaseRepository,
} from '@/domain/ports/FlowTestCaseRepository';
import type { FlowTestCase, TestExpectation, TestOptions } from '@/domain/studio/testCases';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** PostgREST o Postgres: la tabla no existe (migración 023 sin aplicar). */
const isMissingTable = (error: { code?: string; message?: string }): boolean =>
  error.code === 'PGRST205' || error.code === '42P01' || /Could not find the table|does not exist/i.test(error.message ?? '');

interface Row {
  id: string;
  tenant_id: string;
  flow_id: string;
  name: string;
  events: unknown[];
  expect: TestExpectation;
  options: TestOptions | null;
  created_at: string;
  updated_at: string;
}

const COLUMNS = 'id, tenant_id, flow_id, name, events, expect, options, created_at, updated_at';

const toCase = (r: Row): FlowTestCase => ({
  id: r.id,
  tenantId: r.tenant_id,
  flowId: r.flow_id,
  name: r.name,
  events: r.events,
  expect: r.expect,
  options: r.options ?? {},
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

/**
 * Casos de prueba del Studio en flow_test_cases (migración 023).
 * service_role bypasea RLS: el aislamiento por tenant lo hace cada query.
 */
export class SupabaseFlowTestCaseRepository implements FlowTestCaseRepository {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly logger: pino.Logger,
  ) {}

  async list(tenantId: string, flowId: string): Promise<FlowTestCase[]> {
    const { data, error } = await this.supabase
      .from('flow_test_cases')
      .select(COLUMNS)
      .eq('tenant_id', tenantId)
      .eq('flow_id', flowId)
      .order('created_at', { ascending: true });
    if (error) {
      if (isMissingTable(error)) {
        // Sin la tabla no hay pruebas que correr: publicar no se bloquea por
        // esto, pero queda registrado.
        this.logger.error({ tenantId, flowId }, '❌ flow_test_cases no existe: falta aplicar la migración 023');
        return [];
      }
      throw new Error(`list flow_test_cases: ${error.message}`);
    }
    return ((data ?? []) as Row[]).map(toCase);
  }

  async create(
    tenantId: string,
    input: { flowId: string; name: string; events: unknown[]; expect: TestExpectation; options: TestOptions; createdBy: string | null },
  ): Promise<FlowTestCase> {
    const { data, error } = await this.supabase
      .from('flow_test_cases')
      .insert({
        tenant_id: tenantId,
        flow_id: input.flowId,
        name: input.name,
        events: input.events,
        expect: input.expect,
        options: input.options,
        created_by: input.createdBy && UUID_RE.test(input.createdBy) ? input.createdBy : null,
      })
      .select(COLUMNS)
      .single();
    if (error) {
      if (isMissingTable(error)) throw new TestCasesUnavailableError();
      throw new Error(`create flow_test_case: ${error.message}`);
    }
    return toCase(data as Row);
  }

  async update(
    tenantId: string,
    id: string,
    patch: Partial<{ name: string; events: unknown[]; expect: TestExpectation; options: TestOptions }>,
  ): Promise<FlowTestCase | null> {
    const { data, error } = await this.supabase
      .from('flow_test_cases')
      .update(patch)
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .select(COLUMNS)
      .maybeSingle();
    if (error) {
      if (isMissingTable(error)) throw new TestCasesUnavailableError();
      throw new Error(`update flow_test_case: ${error.message}`);
    }
    return data ? toCase(data as Row) : null;
  }

  async delete(tenantId: string, id: string): Promise<boolean> {
    const { data, error } = await this.supabase
      .from('flow_test_cases')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .select('id');
    if (error) {
      if (isMissingTable(error)) throw new TestCasesUnavailableError();
      throw new Error(`delete flow_test_case: ${error.message}`);
    }
    return (data ?? []).length > 0;
  }
}
