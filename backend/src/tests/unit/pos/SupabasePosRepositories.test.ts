/**
 * Repositorios Supabase de caja y ventas (POS Lite, T-03): idempotencia por
 * client_id, recuperación de una cabecera de venta sin líneas, paginación del
 * resumen de cierre y filtro por tenant_id en cada query.
 */
import pino from 'pino';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabasePosSaleRepository } from '@/infrastructure/repositories/pos/SupabasePosSaleRepository';
import { SupabasePosCashSessionRepository } from '@/infrastructure/repositories/pos/SupabasePosCashSessionRepository';
import type { ResolvedPosSale } from '@/domain/entities/pos/Sale';

const TENANT = '00000000-0000-0000-0000-000000000001';
const CASHIER = '00000000-0000-0000-0000-0000000000c1';
const SESSION = '00000000-0000-0000-0000-0000000000f1';
const logger = pino({ level: 'silent' });

interface Call {
  table: string;
  action: 'select' | 'insert' | 'update' | 'delete';
  payload?: unknown;
  eq: Record<string, unknown>;
  range?: [number, number];
}
type Reply = { data?: unknown; error?: { message: string; code?: string } | null; count?: number };

/** Mock fluent que registra cada query y la responde con `respond(call)`. */
function mockSupabase(respond: (call: Call, index: number) => Reply) {
  const calls: Call[] = [];
  const client = {
    from(table: string) {
      const call: Call = { table, action: 'select', eq: {} };
      const finish = () => {
        calls.push(call);
        return Promise.resolve({ data: null, error: null, count: null, ...respond(call, calls.length - 1) });
      };
      const b: any = {
        select: () => b,
        insert: (p: unknown) => ((call.action = 'insert'), (call.payload = p), b),
        update: (p: unknown) => ((call.action = 'update'), (call.payload = p), b),
        delete: () => ((call.action = 'delete'), b),
        eq: (col: string, v: unknown) => ((call.eq[col] = v), b),
        order: () => b,
        limit: () => b,
        range: (from: number, to: number) => ((call.range = [from, to]), b),
        single: finish,
        maybeSingle: finish,
        then: (ok: any, ko: any) => finish().then(ok, ko),
      };
      return b;
    },
  };
  return { client: client as unknown as SupabaseClient, calls };
}

const resolvedSale: ResolvedPosSale = {
  clientId: 'client-1',
  cashSessionId: SESSION,
  ticketNumber: '001',
  subtotal: 10,
  taxTotal: 0,
  discountTotal: 0,
  total: 10,
  paymentMethod: 'cash',
  amountPaid: 20,
  changeGiven: 10,
  lines: [
    {
      productId: 'p1',
      quantity: 2,
      unitPrice: 5,
      discount: 0,
      taxAmount: 0,
      subtotal: 10,
      productName: 'Lápiz',
      productSku: 'LAP-001',
    },
  ],
};

const headerRow = (over: Record<string, unknown> = {}) => ({
  id: 'sale-1',
  tenant_id: TENANT,
  cash_session_id: SESSION,
  cashier_id: CASHIER,
  ticket_number: '001',
  subtotal: '10.00',
  tax_total: '0.00',
  discount_total: '0.00',
  total: '10.00',
  payment_method: 'cash',
  amount_paid: '20.00',
  change_given: '10.00',
  customer_phone: null,
  customer_id: null,
  status: 'completed',
  notes: null,
  created_at: '2026-09-10T12:00:00Z',
  client_id: 'client-1',
  synced_at: '2026-09-10T12:00:01Z',
  ...over,
});

const itemRow = {
  id: 'item-1',
  sale_id: 'sale-1',
  product_id: 'p1',
  quantity: '2.000',
  unit_price: '5.00',
  discount: '0.00',
  tax_amount: '0.00',
  subtotal: '10.00',
  product_name: 'Lápiz',
  product_sku: 'LAP-001',
};

describe('SupabasePosSaleRepository.create', () => {
  it('inserta cabecera y todas las líneas en un solo insert, y mapea numeric → number', async () => {
    const { client, calls } = mockSupabase((call) => {
      if (call.table === 'pos_sales' && call.action === 'select') return { data: null };
      if (call.table === 'pos_sales' && call.action === 'insert') return { data: headerRow() };
      if (call.table === 'pos_sale_items') return { data: [itemRow] };
      return {};
    });

    const sale = await new SupabasePosSaleRepository(client, logger).create(TENANT, CASHIER, resolvedSale);

    const inserts = calls.filter((c) => c.action === 'insert');
    expect(inserts.map((c) => c.table)).toEqual(['pos_sales', 'pos_sale_items']);
    expect(inserts[0].payload).toMatchObject({ tenant_id: TENANT, cashier_id: CASHIER, client_id: 'client-1' });
    expect(inserts[1].payload).toEqual([
      expect.objectContaining({ sale_id: 'sale-1', product_id: 'p1', product_name: 'Lápiz', product_sku: 'LAP-001' }),
    ]);
    // Nunca escribe stock ni movimientos: eso es de los triggers.
    expect(calls.some((c) => c.table === 'pos_products' || c.table === 'pos_inventory_movements')).toBe(false);
    expect(sale.total).toBe(10);
    expect(sale.items).toEqual([expect.objectContaining({ quantity: 2, unitPrice: 5 })]);
  });

  it('venta ya completa con el mismo client_id → la devuelve sin insertar nada', async () => {
    const { client, calls } = mockSupabase(() => ({ data: headerRow({ pos_sale_items: [itemRow] }) }));

    const sale = await new SupabasePosSaleRepository(client, logger).create(TENANT, CASHIER, resolvedSale);

    expect(sale.id).toBe('sale-1');
    expect(calls.filter((c) => c.action !== 'select')).toHaveLength(0);
  });

  it('cabecera huérfana (sin líneas) de un intento cortado → la borra y reinserta', async () => {
    const { client, calls } = mockSupabase((call) => {
      if (call.table === 'pos_sales' && call.action === 'select') {
        return { data: headerRow({ id: 'orphan', pos_sale_items: [] }) };
      }
      if (call.table === 'pos_sales' && call.action === 'insert') return { data: headerRow() };
      if (call.table === 'pos_sale_items') return { data: [itemRow] };
      return {};
    });

    const sale = await new SupabasePosSaleRepository(client, logger).create(TENANT, CASHIER, resolvedSale);

    expect(calls.map((c) => `${c.action}:${c.table}`)).toEqual([
      'select:pos_sales',
      'delete:pos_sales',
      'insert:pos_sales',
      'insert:pos_sale_items',
    ]);
    expect(calls[1].eq).toEqual({ tenant_id: TENANT, id: 'orphan' });
    expect(sale.items).toHaveLength(1);
  });

  it('si fallan las líneas, borra la cabecera y propaga el error', async () => {
    const { client, calls } = mockSupabase((call) => {
      if (call.table === 'pos_sales' && call.action === 'select') return { data: null };
      if (call.table === 'pos_sales' && call.action === 'insert') return { data: headerRow() };
      if (call.table === 'pos_sale_items') return { error: { message: 'fk violation' } };
      return {};
    });

    await expect(
      new SupabasePosSaleRepository(client, logger).create(TENANT, CASHIER, resolvedSale),
    ).rejects.toThrow('fk violation');
    expect(calls[calls.length - 1]).toMatchObject({
      table: 'pos_sales',
      action: 'delete',
      eq: { tenant_id: TENANT, id: 'sale-1' },
    });
  });

  it('carrera en la cabecera (23505) → devuelve la venta que ganó', async () => {
    let selects = 0;
    const { client } = mockSupabase((call) => {
      if (call.table === 'pos_sales' && call.action === 'select') {
        selects += 1;
        return { data: selects === 1 ? null : headerRow({ pos_sale_items: [itemRow] }) };
      }
      if (call.action === 'insert') return { error: { message: 'duplicate key', code: '23505' } };
      return {};
    });

    const sale = await new SupabasePosSaleRepository(client, logger).create(TENANT, CASHIER, resolvedSale);
    expect(sale.id).toBe('sale-1');
  });
});

describe('SupabasePosCashSessionRepository', () => {
  const sessionRow = {
    id: SESSION,
    tenant_id: TENANT,
    cashier_id: CASHIER,
    opened_at: '2026-09-10T09:00:00Z',
    closed_at: null,
    opening_amount: '500.00',
    closing_amount: null,
    expected_amount: null,
    difference: null,
    notes: null,
    status: 'open',
    client_id: 'client-open',
    synced_at: '2026-09-10T09:00:01Z',
  };

  it('open con client_id repetido (23505) devuelve la sesión existente', async () => {
    const { client } = mockSupabase((call) =>
      call.action === 'insert'
        ? { error: { message: 'duplicate key', code: '23505' } }
        : { data: sessionRow },
    );

    const session = await new SupabasePosCashSessionRepository(client, logger).open(TENANT, CASHIER, {
      clientId: 'client-open',
      openingAmount: 500,
    });

    expect(session).toMatchObject({ id: SESSION, openingAmount: 500, closingAmount: null, status: 'open' });
  });

  it('getSummary pagina más allá de 1000 filas, suma por método y redondea a centavos', async () => {
    const page = (n: number, method: string, total: string) =>
      Array.from({ length: n }, () => ({ total, payment_method: method }));
    const { client, calls } = mockSupabase((call) => {
      if (call.range?.[0] === 0) return { data: page(1000, 'cash', '0.10') };
      if (call.range?.[0] === 1000) return { data: page(3, 'card', '100.00') };
      return { data: [] };
    });

    const summary = await new SupabasePosCashSessionRepository(client, logger).getSummary(TENANT, SESSION);

    expect(calls.map((c) => c.range)).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
    expect(calls.every((c) => c.eq.tenant_id === TENANT && c.eq.status === 'completed')).toBe(true);
    expect(summary).toEqual({ totalSales: 400, saleCount: 1003, byPaymentMethod: { cash: 100, card: 300 } });
  });

  it('close filtra por tenant_id además del id', async () => {
    const { client, calls } = mockSupabase(() => ({ data: { ...sessionRow, status: 'closed' } }));

    await new SupabasePosCashSessionRepository(client, logger).close(TENANT, SESSION, {
      closingAmount: 500,
      expectedAmount: 500,
      difference: 0,
    });

    expect(calls[0]).toMatchObject({ action: 'update', eq: { tenant_id: TENANT, id: SESSION } });
    expect(calls[0].payload).toMatchObject({ status: 'closed', closing_amount: 500, expected_amount: 500, difference: 0 });
  });
});
