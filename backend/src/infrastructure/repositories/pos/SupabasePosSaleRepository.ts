import type { SupabaseClient } from '@supabase/supabase-js';
import type pino from 'pino';
import type { PosSaleRepository } from '@/domain/ports/pos/PosSaleRepository';
import type {
  PosPaymentMethod,
  PosSale,
  PosSaleItem,
  PosSaleStatus,
  ResolvedPosSale,
} from '@/domain/entities/pos/Sale';

const SALE_WITH_ITEMS = '*, pos_sale_items(*)';

/**
 * Implementación Supabase del PosSaleRepository (POS Lite, T-03).
 *
 * Aislamiento multi-tenant: TODOS los métodos filtran por tenant_id en el
 * WHERE. pos_sale_items no tiene tenant_id — se alcanza solo a través de una
 * cabecera ya filtrada.
 *
 * Atomicidad sin transacciones (supabase-js no las expone): cabecera e items
 * son dos INSERT. Los items van en UN statement, así que entran todos o
 * ninguno y los triggers de stock se disparan una sola vez por línea. Si el
 * segundo INSERT falla queda una cabecera sin líneas; el siguiente reintento
 * del cliente la detecta (misma client_id, cero líneas), la borra y vuelve a
 * insertar. Toda venta real tiene al menos una línea, así que "cabecera sin
 * líneas" solo puede ser un intento cortado.
 */
export class SupabasePosSaleRepository implements PosSaleRepository {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly logger: pino.Logger,
  ) {}

  async create(tenantId: string, cashierId: string, sale: ResolvedPosSale): Promise<PosSale> {
    const existing = await this.findByClientId(tenantId, sale.clientId);
    if (existing) {
      if (existing.items.length > 0) return existing;
      await this.deleteOrphanHeader(tenantId, existing.id);
    }

    const { data: header, error: headerError } = await this.supabase
      .from('pos_sales')
      .insert({
        tenant_id: tenantId,
        cash_session_id: sale.cashSessionId,
        cashier_id: cashierId,
        ticket_number: sale.ticketNumber,
        subtotal: sale.subtotal,
        tax_total: sale.taxTotal,
        discount_total: sale.discountTotal,
        total: sale.total,
        payment_method: sale.paymentMethod,
        amount_paid: sale.amountPaid,
        change_given: sale.changeGiven,
        client_id: sale.clientId,
        synced_at: new Date().toISOString(),
        needs_review: sale.needsReview,
        review_reason: sale.reviewReason,
      })
      .select('*')
      .single();
    if (headerError) {
      // Carrera: otro reintento de la misma venta insertó primero.
      if ((headerError as { code?: string }).code === '23505') {
        const winner = await this.findByClientId(tenantId, sale.clientId);
        if (winner && winner.items.length > 0) return winner;
      }
      this.logger.error({ error: headerError, tenantId, clientId: sale.clientId }, 'pos.sale.create header failed');
      throw new Error(`pos.sale.create failed: ${headerError.message}`);
    }

    const saleId = header.id as string;
    const { data: items, error: itemsError } = await this.supabase
      .from('pos_sale_items')
      .insert(
        sale.lines.map((l) => ({
          sale_id: saleId,
          product_id: l.productId,
          quantity: l.quantity,
          unit_price: l.unitPrice,
          discount: l.discount,
          tax_amount: l.taxAmount,
          subtotal: l.subtotal,
          product_name: l.productName,
          product_sku: l.productSku,
        })),
      )
      .select('*');
    if (itemsError) {
      this.logger.error({ error: itemsError, tenantId, saleId }, 'pos.sale.create items failed');
      // Best-effort: si también falla, el próximo reintento limpia la cabecera.
      await this.deleteOrphanHeader(tenantId, saleId).catch(() => undefined);
      throw new Error(`pos.sale.create failed: ${itemsError.message}`);
    }

    return mapSale({ ...header, pos_sale_items: items ?? [] });
  }

  async findByClientId(tenantId: string, clientId: string): Promise<PosSale | null> {
    const { data, error } = await this.supabase
      .from('pos_sales')
      .select(SALE_WITH_ITEMS)
      .eq('tenant_id', tenantId)
      .eq('client_id', clientId)
      .maybeSingle();
    if (error) {
      this.logger.error({ error, tenantId, clientId }, 'pos.sale.findByClientId failed');
      throw new Error(`pos.sale.findByClientId failed: ${error.message}`);
    }
    return data ? mapSale(data) : null;
  }

  async listByCashSession(tenantId: string, cashSessionId: string): Promise<PosSale[]> {
    const { data, error } = await this.supabase
      .from('pos_sales')
      .select(SALE_WITH_ITEMS)
      .eq('tenant_id', tenantId)
      .eq('cash_session_id', cashSessionId)
      .order('created_at', { ascending: false });
    if (error) {
      this.logger.error({ error, tenantId, cashSessionId }, 'pos.sale.listByCashSession failed');
      throw new Error(`pos.sale.listByCashSession failed: ${error.message}`);
    }
    return (data ?? []).map(mapSale);
  }

  async countByCashSession(tenantId: string, cashSessionId: string): Promise<number> {
    const { count, error } = await this.supabase
      .from('pos_sales')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('cash_session_id', cashSessionId);
    if (error) {
      this.logger.error({ error, tenantId, cashSessionId }, 'pos.sale.countByCashSession failed');
      throw new Error(`pos.sale.countByCashSession failed: ${error.message}`);
    }
    return count ?? 0;
  }

  /** Borra una cabecera sin líneas. No hay items → no hay triggers que revertir. */
  private async deleteOrphanHeader(tenantId: string, saleId: string): Promise<void> {
    const { error } = await this.supabase
      .from('pos_sales')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('id', saleId);
    if (error) {
      this.logger.error({ error, tenantId, saleId }, 'pos.sale.deleteOrphanHeader failed');
      throw new Error(`pos.sale.deleteOrphanHeader failed: ${error.message}`);
    }
  }
}

function mapItem(row: Record<string, unknown>): PosSaleItem {
  return {
    id: row.id as string,
    saleId: row.sale_id as string,
    productId: row.product_id as string,
    quantity: Number(row.quantity),
    unitPrice: Number(row.unit_price),
    discount: Number(row.discount),
    taxAmount: Number(row.tax_amount),
    subtotal: Number(row.subtotal),
    productName: row.product_name as string,
    productSku: row.product_sku as string,
  };
}

function mapSale(row: Record<string, unknown>): PosSale {
  const items = (row.pos_sale_items as Record<string, unknown>[] | null) ?? [];
  return {
    id: row.id as string,
    tenantId: row.tenant_id as string,
    cashSessionId: row.cash_session_id as string,
    cashierId: row.cashier_id as string,
    ticketNumber: row.ticket_number as string,
    subtotal: Number(row.subtotal),
    taxTotal: Number(row.tax_total),
    discountTotal: Number(row.discount_total),
    total: Number(row.total),
    paymentMethod: row.payment_method as PosPaymentMethod,
    amountPaid: Number(row.amount_paid),
    changeGiven: Number(row.change_given),
    customerPhone: (row.customer_phone as string | null) ?? null,
    customerId: (row.customer_id as string | null) ?? null,
    status: row.status as PosSaleStatus,
    notes: (row.notes as string | null) ?? null,
    createdAt: new Date(row.created_at as string),
    clientId: row.client_id as string,
    syncedAt: row.synced_at ? new Date(row.synced_at as string) : null,
    needsReview: row.needs_review === true,
    reviewReason: (row.review_reason as string | null) ?? null,
    items: items.map(mapItem),
  };
}
