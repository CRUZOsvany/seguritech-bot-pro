/**
 * Acciones del cajero, local primero: cada una escribe en IndexedDB y encola
 * su operación en una sola transacción, sin tocar la red. La sincronización
 * (sync.ts) las manda después, en orden.
 *
 * Así la caja funciona igual con o sin internet: abrir, vender y cerrar nunca
 * esperan al servidor.
 */
import type {
  CajaDb,
  LocalCashSession,
  LocalSale,
  OutboxKind,
  PaymentMethod,
} from './db';
import { findOpenSession, newClientId } from './db';
import { cartTotals, paymentProblem, lineSubtotal, type CartLine } from './cart';
import { roundMoney } from './money';
import type { ServerCashSession } from './api';

function op(cashierId: string, kind: OutboxKind, entityClientId: string) {
  return {
    cashierId,
    kind,
    entityClientId,
    status: 'pending' as const,
    attempts: 0,
    lastError: null,
    createdAt: new Date().toISOString(),
  };
}

export async function openCashLocal(
  db: CajaDb,
  params: { cashierId: string; openingAmount: number },
): Promise<LocalCashSession> {
  const { cashierId, openingAmount } = params;
  if (!Number.isFinite(openingAmount) || openingAmount < 0) {
    throw new Error('El fondo inicial no puede ser negativo');
  }

  return db.transaction('rw', db.sessions, db.outbox, async () => {
    if (await findOpenSession(db, cashierId)) {
      throw new Error('Ya tienes una caja abierta');
    }
    const session: LocalCashSession = {
      clientId: newClientId(),
      cashierId,
      serverId: null,
      openingAmount: roundMoney(openingAmount),
      openedAt: new Date().toISOString(),
      status: 'open',
      closedAt: null,
      closingAmount: null,
      expectedAmount: null,
      difference: null,
      closeSynced: false,
      notice: null,
    };
    await db.sessions.add(session);
    await db.outbox.add(op(cashierId, 'open_session', session.clientId));
    return session;
  });
}

/**
 * El servidor ya tiene una caja abierta de este cajero (abierta en otra
 * laptop, o antes de reinstalar la app). Se adopta tal cual, sin encolar nada.
 */
export async function adoptServerSession(
  db: CajaDb,
  cashierId: string,
  server: ServerCashSession,
): Promise<LocalCashSession> {
  const session: LocalCashSession = {
    clientId: server.clientId,
    cashierId,
    serverId: server.id,
    openingAmount: server.openingAmount,
    openedAt: server.openedAt,
    status: 'open',
    closedAt: null,
    closingAmount: null,
    expectedAmount: null,
    difference: null,
    closeSynced: false,
    notice: 'Esta caja se abrió en otro equipo; sus ventas de allá no aparecen en esta lista.',
  };
  await db.sessions.put(session);
  return session;
}

export async function registerSaleLocal(
  db: CajaDb,
  params: {
    cashierId: string;
    session: LocalCashSession;
    lines: CartLine[];
    paymentMethod: PaymentMethod;
    amountPaid: number | null;
  },
): Promise<LocalSale> {
  const { cashierId, session, lines, paymentMethod } = params;
  if (session.status !== 'open') throw new Error('La caja está cerrada; ábrela para vender');

  const problem = paymentProblem(lines, paymentMethod, params.amountPaid);
  if (problem) throw new Error(problem);

  const totals = cartTotals(lines);
  const amountPaid = paymentMethod === 'cash' ? roundMoney(params.amountPaid ?? 0) : totals.total;

  return db.transaction('rw', db.sales, db.outbox, db.catalog, async () => {
    const count = await db.sales.where('sessionClientId').equals(session.clientId).count();
    const sale: LocalSale = {
      clientId: newClientId(),
      cashierId,
      sessionClientId: session.clientId,
      localTicket: String(count + 1).padStart(3, '0'),
      serverTicket: null,
      items: lines.map((l) => ({
        productId: l.productId,
        name: l.name,
        sku: l.sku,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        subtotal: lineSubtotal(l),
      })),
      subtotal: totals.subtotal,
      taxTotal: totals.taxTotal,
      total: totals.total,
      paymentMethod,
      amountPaid,
      changeGiven: roundMoney(amountPaid - totals.total),
      createdAt: new Date().toISOString(),
      status: 'pending',
      serverTotal: null,
      needsReview: false,
      reviewReason: null,
      error: null,
    };
    await db.sales.add(sale);
    await db.outbox.add(op(cashierId, 'sale', sale.clientId));

    // Stock aproximado para el cajero mientras no hay internet. El próximo
    // refresco del catálogo lo reemplaza por el valor real del servidor.
    for (const line of lines) {
      if (!line.trackStock) continue;
      const product = await db.catalog.get(line.productId);
      if (product) await db.catalog.update(line.productId, { stockQty: product.stockQty - line.quantity });
    }
    return sale;
  });
}

export interface LocalSummary {
  totalSales: number;
  saleCount: number;
  byPaymentMethod: Record<string, number>;
  pendingCount: number;
  rejectedCount: number;
  reviewCount: number;
}

/**
 * Resumen calculado con las ventas de esta laptop — lo que el cajero cobró.
 * Las rechazadas por el servidor no cuentan (no se registraron).
 */
export async function localSummary(db: CajaDb, sessionClientId: string): Promise<LocalSummary> {
  const sales = await db.sales.where('sessionClientId').equals(sessionClientId).toArray();
  const summary: LocalSummary = {
    totalSales: 0,
    saleCount: 0,
    byPaymentMethod: {},
    pendingCount: 0,
    rejectedCount: 0,
    reviewCount: 0,
  };
  for (const sale of sales) {
    if (sale.status === 'rejected') {
      summary.rejectedCount += 1;
      continue;
    }
    if (sale.status === 'pending') summary.pendingCount += 1;
    if (sale.needsReview) summary.reviewCount += 1;
    summary.totalSales += sale.total;
    summary.saleCount += 1;
    summary.byPaymentMethod[sale.paymentMethod] =
      (summary.byPaymentMethod[sale.paymentMethod] ?? 0) + sale.total;
  }
  summary.totalSales = roundMoney(summary.totalSales);
  for (const method of Object.keys(summary.byPaymentMethod)) {
    summary.byPaymentMethod[method] = roundMoney(summary.byPaymentMethod[method]);
  }
  return summary;
}

/** Efectivo esperado en el cajón: fondo inicial + ventas en efectivo. */
export function expectedCash(openingAmount: number, byPaymentMethod: Record<string, number>): number {
  return roundMoney(openingAmount + (byPaymentMethod.cash ?? 0));
}

export async function closeCashLocal(
  db: CajaDb,
  params: { session: LocalCashSession; closingAmount: number },
): Promise<LocalCashSession> {
  const { session, closingAmount } = params;
  if (!Number.isFinite(closingAmount) || closingAmount < 0) {
    throw new Error('El efectivo contado no puede ser negativo');
  }

  return db.transaction('rw', db.sessions, db.sales, db.outbox, async () => {
    const current = await db.sessions.get(session.clientId);
    if (!current || current.status !== 'open') throw new Error('Esta caja ya está cerrada');

    const summary = await localSummary(db, session.clientId);
    const expectedAmount = expectedCash(current.openingAmount, summary.byPaymentMethod);
    const closed: LocalCashSession = {
      ...current,
      status: 'closed',
      closedAt: new Date().toISOString(),
      closingAmount: roundMoney(closingAmount),
      expectedAmount,
      difference: roundMoney(closingAmount - expectedAmount),
    };
    await db.sessions.put(closed);
    await db.outbox.add(op(current.cashierId, 'close_session', current.clientId));
    return closed;
  });
}
