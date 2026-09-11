import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CajaDb, type CatalogProduct } from './db';
import { closeCashLocal, openCashLocal, registerSaleLocal } from './actions';
import { classifyError, reconcileOpenSession, syncOutbox, LocalSyncError } from './sync';
import { PosApiError, type SyncApi, type ServerCashSession } from './api';
import { addToCart } from './cart';

const CASHIER = 'cashier-1';
const OTHER = 'cashier-2';

const lapiz: CatalogProduct = {
  id: 'p-lapiz',
  sku: 'LAP-001',
  barcode: '7501',
  name: 'Lápiz',
  unitType: 'piece',
  unitPrice: 5,
  taxRate: 0,
  stockQty: 10,
  stockMin: 2,
  trackStock: true,
};

function serverSession(over: Partial<ServerCashSession> = {}): ServerCashSession {
  return {
    id: 'srv-session-1',
    cashierId: CASHIER,
    openedAt: '2026-09-10T09:00:00Z',
    closedAt: null,
    openingAmount: 500,
    closingAmount: null,
    expectedAmount: null,
    difference: null,
    status: 'open',
    clientId: 'srv-client',
    ...over,
  };
}

function fakeApi(over: Partial<SyncApi> = {}) {
  const calls: string[] = [];
  const api: SyncApi = {
    openSession: vi.fn(async (body) => {
      calls.push(`open:${body.clientId}`);
      return { session: serverSession({ clientId: body.clientId, openingAmount: body.openingAmount }) };
    }),
    registerSale: vi.fn(async (body) => {
      calls.push(`sale:${body.clientId}:${body.cashSessionId}`);
      return {
        sale: { id: `srv-${body.clientId}`, ticketNumber: '001', total: 10, changeGiven: 0, needsReview: false, reviewReason: null },
      };
    }),
    closeSession: vi.fn(async (id, body) => {
      calls.push(`close:${id}`);
      return {
        session: serverSession({ id, status: 'closed', closingAmount: body.closingAmount, expectedAmount: 510, difference: body.closingAmount - 510 }),
        summary: { totalSales: 10, saleCount: 1, byPaymentMethod: { cash: 10 } },
      };
    }),
    currentSession: vi.fn(async () => ({ session: null })),
    ...over,
  };
  return { api, calls };
}

let db: CajaDb;

beforeEach(async () => {
  db = new CajaDb(`test-${crypto.randomUUID()}`);
  await db.catalog.put(lapiz);
});

afterEach(async () => {
  await db.delete();
});

async function openAndSell(cashierId = CASHIER) {
  const session = await openCashLocal(db, { cashierId, openingAmount: 500 });
  const sale = await registerSaleLocal(db, {
    cashierId,
    session,
    lines: addToCart([], lapiz, 2),
    paymentMethod: 'cash',
    amountPaid: 20,
  });
  return { session, sale };
}

describe('classifyError', () => {
  it('distingue red, reintento, sesión vencida y definitivo', () => {
    expect(classifyError(new PosApiError(0, 'sin red'))).toBe('offline');
    expect(classifyError(new PosApiError(401, 'x'))).toBe('unauthorized');
    expect(classifyError(new PosApiError(429, 'rate limit'))).toBe('retry');
    expect(classifyError(new PosApiError(503, 'x'))).toBe('retry');
    expect(classifyError(new PosApiError(409, 'caja cerrada', 'session_closed'))).toBe('definitive');
    expect(classifyError(new PosApiError(404, 'x'))).toBe('definitive');
    expect(classifyError(new LocalSyncError('x'))).toBe('definitive');
    expect(classifyError(new Error('IndexedDB'))).toBe('retry');
  });
});

describe('syncOutbox', () => {
  it('manda apertura → venta → cierre en orden y usa el id de servidor de la caja', async () => {
    const { session } = await openAndSell();
    const opened = (await db.sessions.get(session.clientId))!;
    await closeCashLocal(db, { session: opened, closingAmount: 505 });
    const { api, calls } = fakeApi();

    const result = await syncOutbox(db, api, CASHIER);

    expect(result).toEqual({ state: 'synced', sent: 3, rejected: 0 });
    expect(calls[0]).toBe(`open:${session.clientId}`);
    expect(calls[1]).toMatch(/^sale:.+:srv-session-1$/);
    expect(calls[2]).toBe('close:srv-session-1');

    const stored = (await db.sessions.get(session.clientId))!;
    expect(stored).toMatchObject({ serverId: 'srv-session-1', closeSynced: true, expectedAmount: 510, difference: -5 });
    const [sale] = await db.sales.toArray();
    expect(sale).toMatchObject({ status: 'synced', serverTicket: '001', serverTotal: 10 });
    expect(await db.outbox.where('status').equals('pending').count()).toBe(0);
  });

  it('manda solo productId y cantidad; nunca precios', async () => {
    await openAndSell();
    const { api } = fakeApi();
    await syncOutbox(db, api, CASHIER);

    expect(api.registerSale).toHaveBeenCalledWith(
      expect.objectContaining({ items: [{ productId: 'p-lapiz', quantity: 2 }], paymentMethod: 'cash', amountPaid: 20 }),
    );
  });

  it('sin red se detiene en la primera operación y la deja pendiente', async () => {
    await openAndSell();
    const { api } = fakeApi({
      openSession: vi.fn(async () => {
        throw new PosApiError(0, 'Sin conexión');
      }),
    });

    const result = await syncOutbox(db, api, CASHIER);

    expect(result).toEqual({ state: 'offline', sent: 0, rejected: 0 });
    expect(api.registerSale).not.toHaveBeenCalled();
    const ops = await db.outbox.orderBy('seq').toArray();
    expect(ops.map((o) => o.status)).toEqual(['pending', 'pending']);
    expect(ops[0]).toMatchObject({ attempts: 1, lastError: 'Sin conexión' });
  });

  it('un 429 o 5xx detiene la cola sin perder el orden; el siguiente intento continúa', async () => {
    await openAndSell();
    let fail = true;
    const { api, calls } = fakeApi();
    const registerSale = api.registerSale;
    api.registerSale = vi.fn(async (body) => {
      if (fail) throw new PosApiError(429, 'Demasiadas solicitudes');
      return registerSale(body);
    });

    expect((await syncOutbox(db, api, CASHIER)).state).toBe('retrying');
    expect((await db.sales.toArray())[0].status).toBe('pending');

    fail = false;
    const second = await syncOutbox(db, api, CASHIER);
    expect(second).toEqual({ state: 'synced', sent: 1, rejected: 0 });
    // La apertura no se reenvía: ya había quedado hecha.
    expect(calls.filter((c) => c.startsWith('open:'))).toHaveLength(1);
  });

  it('un 401 detiene la cola y conserva todo para cuando el cajero vuelva a entrar', async () => {
    await openAndSell();
    const { api } = fakeApi({
      openSession: vi.fn(async () => {
        throw new PosApiError(401, 'No autenticado');
      }),
    });

    expect((await syncOutbox(db, api, CASHIER)).state).toBe('unauthorized');
    expect(await db.outbox.where('status').equals('pending').count()).toBe(2);
  });

  it('un 4xx definitivo marca la venta como rechazada y la cola sigue', async () => {
    const { session } = await openAndSell();
    const second = await registerSaleLocal(db, {
      cashierId: CASHIER,
      session,
      lines: addToCart([], lapiz, 1),
      paymentMethod: 'card',
      amountPaid: null,
    });
    const { api } = fakeApi();
    const registerSale = api.registerSale;
    let first = true;
    api.registerSale = vi.fn(async (body) => {
      if (first) {
        first = false;
        throw new PosApiError(404, 'Producto no encontrado', 'product_not_found');
      }
      return registerSale(body);
    });

    const result = await syncOutbox(db, api, CASHIER);

    expect(result).toEqual({ state: 'synced', sent: 2, rejected: 1 });
    const sales = await db.sales.toArray();
    const rejected = sales.find((s) => s.clientId !== second.clientId)!;
    expect(rejected).toMatchObject({ status: 'rejected', error: 'Producto no encontrado' });
    expect(sales.find((s) => s.clientId === second.clientId)!.status).toBe('synced');
  });

  it('guarda la marca de revisión que devuelve el servidor', async () => {
    await openAndSell();
    const { api } = fakeApi({
      registerSale: vi.fn(async () => ({
        sale: { id: 's', ticketNumber: '001', total: 12, changeGiven: 0, needsReview: true, reviewReason: 'Stock insuficiente: Lápiz' },
      })),
    });

    await syncOutbox(db, api, CASHIER);

    expect((await db.sales.toArray())[0]).toMatchObject({
      status: 'synced',
      needsReview: true,
      reviewReason: 'Stock insuficiente: Lápiz',
      serverTotal: 12,
    });
  });

  it('si el servidor ya tenía una caja abierta, la adopta y registra las ventas ahí', async () => {
    const { session } = await openAndSell();
    const { api, calls } = fakeApi({
      openSession: vi.fn(async () => {
        throw new PosApiError(409, 'Ya tienes una caja abierta', 'session_already_open', { sessionId: 'srv-old' });
      }),
    });

    const result = await syncOutbox(db, api, CASHIER);

    expect(result.state).toBe('synced');
    const stored = (await db.sessions.get(session.clientId))!;
    expect(stored.serverId).toBe('srv-old');
    expect(stored.notice).toContain('Ya había una caja abierta');
    expect(calls[0]).toMatch(/^sale:.+:srv-old$/);
  });

  it('si la apertura falla de forma definitiva, sus ventas se rechazan sin llamar al servidor', async () => {
    await openAndSell();
    const { api } = fakeApi({
      openSession: vi.fn(async () => {
        throw new PosApiError(403, 'Módulo POS deshabilitado', 'module_disabled');
      }),
    });

    const result = await syncOutbox(db, api, CASHIER);

    expect(result).toEqual({ state: 'synced', sent: 0, rejected: 2 });
    expect(api.registerSale).not.toHaveBeenCalled();
    expect((await db.sales.toArray())[0].error).toBe('La caja de esta venta no se pudo abrir en el servidor');
  });

  it('cada cajero sincroniza solo sus operaciones', async () => {
    await openAndSell(CASHIER);
    await openAndSell(OTHER);
    const { api } = fakeApi();

    const result = await syncOutbox(db, api, OTHER);

    expect(result.sent).toBe(2);
    const pending = await db.outbox.where('status').equals('pending').toArray();
    expect(pending.every((op) => op.cashierId === CASHIER)).toBe(true);
    expect(pending).toHaveLength(2);
  });
});

describe('reconcileOpenSession', () => {
  it('adopta la caja abierta del servidor si esta laptop no tiene ninguna', async () => {
    const { api } = fakeApi({ currentSession: vi.fn(async () => ({ session: serverSession() })) });

    await reconcileOpenSession(db, api, CASHIER);

    const stored = await db.sessions.get('srv-client');
    expect(stored).toMatchObject({ serverId: 'srv-session-1', status: 'open', openingAmount: 500 });
    expect(await db.outbox.count()).toBe(0);
  });

  it('no consulta al servidor si ya hay caja abierta local', async () => {
    await openAndSell();
    const { api } = fakeApi();
    await reconcileOpenSession(db, api, CASHIER);
    expect(api.currentSession).not.toHaveBeenCalled();
  });

  it('no reabre una caja que se cerró aquí y cuyo cierre aún no sube', async () => {
    const { session } = await openAndSell();
    await closeCashLocal(db, { session: (await db.sessions.get(session.clientId))!, closingAmount: 510 });
    const { api } = fakeApi({
      currentSession: vi.fn(async () => ({ session: serverSession({ clientId: session.clientId }) })),
    });

    await reconcileOpenSession(db, api, CASHIER);

    expect((await db.sessions.get(session.clientId))!.status).toBe('closed');
  });
});
