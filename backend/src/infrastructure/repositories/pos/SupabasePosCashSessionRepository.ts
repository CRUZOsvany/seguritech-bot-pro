import type { SupabaseClient } from '@supabase/supabase-js';
import type pino from 'pino';
import type { PosCashSessionRepository } from '@/domain/ports/pos/PosCashSessionRepository';
import type {
  CloseCashSessionPatch,
  NewPosCashSession,
  PosCashSession,
  PosCashSessionStatus,
  PosCashSessionSummary,
} from '@/domain/entities/pos/CashSession';
import { roundMoney } from '@/application/pos/PosOperationError';

/** PostgREST corta en 1000 filas por defecto; el resumen pagina para no truncar el arqueo. */
const PAGE_SIZE = 1000;

/**
 * Implementación Supabase del PosCashSessionRepository (POS Lite, T-03).
 *
 * Aislamiento multi-tenant: TODOS los métodos filtran por tenant_id en el
 * WHERE. La RLS es defense-in-depth (el backend usa service_role).
 *
 * open() es idempotente por UNIQUE(tenant_id, client_id) (migración 022):
 * un 23505 significa "esta apertura ya llegó antes" y se devuelve esa fila.
 */
export class SupabasePosCashSessionRepository implements PosCashSessionRepository {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly logger: pino.Logger,
  ) {}

  async open(
    tenantId: string,
    cashierId: string,
    session: NewPosCashSession,
  ): Promise<PosCashSession> {
    const { data, error } = await this.supabase
      .from('pos_cash_sessions')
      .insert({
        tenant_id: tenantId,
        cashier_id: cashierId,
        opening_amount: session.openingAmount,
        client_id: session.clientId,
        synced_at: new Date().toISOString(),
      })
      .select('*')
      .single();
    if (error) {
      if ((error as { code?: string }).code === '23505') {
        const existing = await this.findByClientId(tenantId, session.clientId);
        if (existing) return existing;
      }
      this.logger.error({ error, tenantId, cashierId }, 'pos.cashSession.open failed');
      throw new Error(`pos.cashSession.open failed: ${error.message}`);
    }
    return mapRow(data);
  }

  async findById(tenantId: string, id: string): Promise<PosCashSession | null> {
    return this.findOneBy(tenantId, 'id', id);
  }

  async findByClientId(tenantId: string, clientId: string): Promise<PosCashSession | null> {
    return this.findOneBy(tenantId, 'client_id', clientId);
  }

  async findOpenByCashier(tenantId: string, cashierId: string): Promise<PosCashSession | null> {
    const { data, error } = await this.supabase
      .from('pos_cash_sessions')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('cashier_id', cashierId)
      .eq('status', 'open')
      .order('opened_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      this.logger.error({ error, tenantId, cashierId }, 'pos.cashSession.findOpenByCashier failed');
      throw new Error(`pos.cashSession.findOpenByCashier failed: ${error.message}`);
    }
    return data ? mapRow(data) : null;
  }

  async close(
    tenantId: string,
    id: string,
    patch: CloseCashSessionPatch,
  ): Promise<PosCashSession> {
    const { data, error } = await this.supabase
      .from('pos_cash_sessions')
      .update({
        status: 'closed',
        closed_at: new Date().toISOString(),
        closing_amount: patch.closingAmount,
        expected_amount: patch.expectedAmount,
        difference: patch.difference,
      })
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .select('*')
      .single();
    if (error) {
      this.logger.error({ error, tenantId, id }, 'pos.cashSession.close failed');
      throw new Error(`pos.cashSession.close failed: ${error.message}`);
    }
    return mapRow(data);
  }

  async getSummary(tenantId: string, id: string): Promise<PosCashSessionSummary> {
    const summary: PosCashSessionSummary = { totalSales: 0, saleCount: 0, byPaymentMethod: {} };

    for (let offset = 0; ; offset += PAGE_SIZE) {
      const { data, error } = await this.supabase
        .from('pos_sales')
        .select('id, total, payment_method')
        .eq('tenant_id', tenantId)
        .eq('cash_session_id', id)
        .eq('status', 'completed')
        .order('id', { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);
      if (error) {
        this.logger.error({ error, tenantId, id }, 'pos.cashSession.getSummary failed');
        throw new Error(`pos.cashSession.getSummary failed: ${error.message}`);
      }
      const rows = data ?? [];
      for (const row of rows) {
        const total = Number(row.total);
        const method = row.payment_method as string;
        summary.totalSales += total;
        summary.saleCount += 1;
        summary.byPaymentMethod[method] = (summary.byPaymentMethod[method] ?? 0) + total;
      }
      if (rows.length < PAGE_SIZE) break;
    }

    // Sumar floats acumula error; se redondea a centavos al final.
    summary.totalSales = roundMoney(summary.totalSales);
    for (const method of Object.keys(summary.byPaymentMethod)) {
      summary.byPaymentMethod[method] = roundMoney(summary.byPaymentMethod[method]);
    }
    return summary;
  }

  private async findOneBy(
    tenantId: string,
    column: 'id' | 'client_id',
    value: string,
  ): Promise<PosCashSession | null> {
    const { data, error } = await this.supabase
      .from('pos_cash_sessions')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq(column, value)
      .maybeSingle();
    if (error) {
      this.logger.error({ error, tenantId, column }, 'pos.cashSession.findOneBy failed');
      throw new Error(`pos.cashSession.findOneBy failed: ${error.message}`);
    }
    return data ? mapRow(data) : null;
  }
}

function numOrNull(v: unknown): number | null {
  return v === null || v === undefined ? null : Number(v);
}

function mapRow(row: Record<string, unknown>): PosCashSession {
  return {
    id: row.id as string,
    tenantId: row.tenant_id as string,
    cashierId: row.cashier_id as string,
    openedAt: new Date(row.opened_at as string),
    closedAt: row.closed_at ? new Date(row.closed_at as string) : null,
    openingAmount: Number(row.opening_amount),
    closingAmount: numOrNull(row.closing_amount),
    expectedAmount: numOrNull(row.expected_amount),
    difference: numOrNull(row.difference),
    notes: (row.notes as string | null) ?? null,
    status: row.status as PosCashSessionStatus,
    clientId: row.client_id as string,
    syncedAt: row.synced_at ? new Date(row.synced_at as string) : null,
  };
}
