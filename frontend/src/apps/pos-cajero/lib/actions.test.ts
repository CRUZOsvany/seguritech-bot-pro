import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CajaDb, type CatalogProduct } from './db';
import { closeCashLocal, localSummary, openCashLocal, registerSaleLocal } from './actions';
import { addToCart } from './cart';

const CASHIER = 'cashier-1';
const lapiz: CatalogProduct = {
  id: 'p-lapiz',
  sku: 'LAP-001',
  barcode: null,
  name: 'Lápiz',
  unitType: 'piece',
  unitPrice: 5,
  taxRate: 0,
  stockQty: 10,
  stockMin: 2,
  trackStock: true,
};
const impresion: CatalogProduct = {
  ...lapiz,
  id: 'p-imp',
  sku: 'SRV-IMP',
  name: 'Impresión',
  unitType: 'service',
  unitPrice: 2,
  stockQty: 0,
  trackStock: false,
};

let db: CajaDb;

beforeEach(async () => {
  db = new CajaDb(`test-${crypto.randomUUID()}`);
  await db.catalog.bulkPut([lapiz, impresion]);
});

afterEach(async () => {
  await db.delete();
});

describe('acciones locales de la caja', () => {
  it('abrir caja la guarda y la encola, sin tocar la red', async () => {
    const session = await openCashLocal(db, { cashierId: CASHIER, openingAmount: 500 });

    expect(session).toMatchObject({ status: 'open', serverId: null, openingAmount: 500 });
    const ops = await db.outbox.toArray();
    expect(ops).toEqual([expect.objectContaining({ kind: 'open_session', entityClientId: session.clientId, status: 'pending' })]);
  });

  it('no deja abrir dos cajas del mismo cajero', async () => {
    await openCashLocal(db, { cashierId: CASHIER, openingAmount: 500 });
    await expect(openCashLocal(db, { cashierId: CASHIER, openingAmount: 100 })).rejects.toThrow('Ya tienes una caja abierta');
  });

  it('vender numera tickets, calcula cambio y descuenta el stock local (no el de servicios)', async () => {
    const session = await openCashLocal(db, { cashierId: CASHIER, openingAmount: 500 });
    const lines = addToCart(addToCart([], lapiz, 3), impresion, 5);

    const first = await registerSaleLocal(db, { cashierId: CASHIER, session, lines, paymentMethod: 'cash', amountPaid: 50 });
    const second = await registerSaleLocal(db, {
      cashierId: CASHIER,
      session,
      lines: addToCart([], lapiz, 1),
      paymentMethod: 'card',
      amountPaid: null,
    });

    expect(first).toMatchObject({ localTicket: '001', total: 25, changeGiven: 25, status: 'pending' });
    expect(second).toMatchObject({ localTicket: '002', total: 5, amountPaid: 5, changeGiven: 0 });
    expect((await db.catalog.get('p-lapiz'))!.stockQty).toBe(6);
    expect((await db.catalog.get('p-imp'))!.stockQty).toBe(0);
  });

  it('en efectivo exige cubrir el total antes de guardar nada', async () => {
    const session = await openCashLocal(db, { cashierId: CASHIER, openingAmount: 500 });
    await expect(
      registerSaleLocal(db, { cashierId: CASHIER, session, lines: addToCart([], lapiz, 2), paymentMethod: 'cash', amountPaid: 5 }),
    ).rejects.toThrow('Lo recibido no cubre el total');
    expect(await db.sales.count()).toBe(0);
  });

  it('cerrar calcula el esperado con fondo + efectivo, sin contar tarjeta ni ventas rechazadas', async () => {
    const session = await openCashLocal(db, { cashierId: CASHIER, openingAmount: 500 });
    const sell = (qty: number, paymentMethod: 'cash' | 'card', amountPaid: number | null) =>
      registerSaleLocal(db, { cashierId: CASHIER, session, lines: addToCart([], lapiz, qty), paymentMethod, amountPaid });
    await sell(2, 'cash', 20); // 10
    await sell(4, 'card', null); // 20
    const rejected = await sell(1, 'cash', 5); // 5, rechazada abajo
    await db.sales.update(rejected.clientId, { status: 'rejected', error: 'x' });

    const summary = await localSummary(db, session.clientId);
    expect(summary).toMatchObject({
      totalSales: 30,
      saleCount: 2,
      byPaymentMethod: { cash: 10, card: 20 },
      pendingCount: 2,
      rejectedCount: 1,
    });

    const closed = await closeCashLocal(db, { session, closingAmount: 505 });
    expect(closed).toMatchObject({ status: 'closed', expectedAmount: 510, difference: -5, closeSynced: false });
    const kinds = (await db.outbox.orderBy('seq').toArray()).map((o) => o.kind);
    expect(kinds[kinds.length - 1]).toBe('close_session');
  });

  it('no deja cerrar dos veces', async () => {
    const session = await openCashLocal(db, { cashierId: CASHIER, openingAmount: 100 });
    await closeCashLocal(db, { session, closingAmount: 100 });
    await expect(closeCashLocal(db, { session, closingAmount: 100 })).rejects.toThrow('ya está cerrada');
  });
});
