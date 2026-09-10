/**
 * Contrato HTTP de caja y ventas del POS (POS Lite, T-05).
 *
 * Usa el middleware real de sesión POS + ModuleGuard real, y los casos de uso
 * reales sobre InMemoryPosStore — solo la persistencia es falsa.
 */
import { randomUUID } from 'crypto';
import express, { Express } from 'express';
import cookieParser from 'cookie-parser';
import pino from 'pino';
import request from 'supertest';

import { JwtService } from '@/infrastructure/auth/JwtService';
import { createPosRouter } from '@/infrastructure/server/PosRouter';
import { createPosAuthMiddleware } from '@/infrastructure/auth/PosAuthMiddleware';
import { createRequireModule } from '@/infrastructure/auth/ModuleGuard';
import type { AdminSessionsRepository } from '@/domain/ports/AdminSessionsRepository';
import type { TenantRepository } from '@/domain/ports/TenantRepository';
import type { PosCategoryRepository } from '@/domain/ports/pos/PosCategoryRepository';
import type { PosTenantConfigRepository } from '@/domain/ports/pos/PosTenantConfigRepository';
import type { PosCashSessionRepository } from '@/domain/ports/pos/PosCashSessionRepository';
import { InMemoryPosStore, fakePosProduct } from '@/tests/utils/InMemoryPosStore';

const SECRET = 'c'.repeat(64);
const COOKIE = 'pos_session_test';
const TENANT_A = '00000000-0000-0000-0000-0000000000aa';
const TENANT_B = '00000000-0000-0000-0000-0000000000bb';
const CASHIER_1 = '00000000-0000-0000-0000-0000000000c1';
const CASHIER_2 = '00000000-0000-0000-0000-0000000000c2';

const logger = pino({ level: 'silent' });

function buildApp(overrides: { posCashSessions?: PosCashSessionRepository } = {}) {
  const store = new InMemoryPosStore();
  const jwt = new JwtService(SECRET, 3600);
  const sessions: AdminSessionsRepository = {
    isRevoked: jest.fn().mockResolvedValue(false),
    revoke: jest.fn().mockResolvedValue(undefined),
  } as unknown as AdminSessionsRepository;
  const tenants: TenantRepository = {
    isModuleEnabled: jest.fn(async (_id: string, m: string) => m === 'pos'),
  } as unknown as TenantRepository;

  const router = createPosRouter({
    requirePosSession: createPosAuthMiddleware({ jwt, sessions, posCookieName: COOKIE, logger }),
    requireModule: createRequireModule(tenants, 'pos', logger),
    posProducts: store.productRepo(),
    posCategories: {} as PosCategoryRepository,
    posConfig: {} as PosTenantConfigRepository,
    posSales: store.saleRepo(),
    posCashSessions: overrides.posCashSessions ?? store.sessionRepo(),
    logger,
  });

  const app: Express = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/pos', router);

  const cookie = (cashierId: string, tenantId: string) => {
    const { token } = jwt.sign({
      sub: cashierId,
      displayName: 'Cajera',
      role: 'pos_cashier',
      tenantId,
      scope: 'pos',
    });
    return `${COOKIE}=${token}`;
  };

  const lapiz = store.addProduct(fakePosProduct({ tenantId: TENANT_A, unitPrice: 5, stockQty: 10 }));

  return { app, store, cookie, lapiz };
}

async function openSession(app: Express, cookie: string, openingAmount = 500) {
  const res = await request(app)
    .post('/api/pos/cash-sessions')
    .set('Cookie', cookie)
    .send({ clientId: randomUUID(), openingAmount });
  expect(res.status).toBe(201);
  return res.body.session as { id: string };
}

describe('POS caja y ventas — HTTP', () => {
  it('todas las rutas nuevas exigen cookie POS (401 sin ella)', async () => {
    const { app } = buildApp();
    const id = randomUUID();
    const calls = [
      request(app).post('/api/pos/cash-sessions').send({}),
      request(app).get('/api/pos/cash-sessions/current'),
      request(app).patch(`/api/pos/cash-sessions/${id}/close`).send({}),
      request(app).get(`/api/pos/cash-sessions/${id}/summary`),
      request(app).post('/api/pos/sales').send({}),
    ];
    for (const res of await Promise.all(calls)) {
      expect(res.status).toBe(401);
    }
  });

  it('abre caja con tenant y cajero de la cookie, ignorando los del body', async () => {
    const { app, store, cookie } = buildApp();

    const res = await request(app)
      .post('/api/pos/cash-sessions')
      .set('Cookie', cookie(CASHIER_1, TENANT_A))
      .send({ clientId: randomUUID(), openingAmount: 500, tenantId: TENANT_B, cashierId: CASHIER_2 });

    expect(res.status).toBe(201);
    const [stored] = [...store.sessions.values()];
    expect(stored).toMatchObject({ tenantId: TENANT_A, cashierId: CASHIER_1, openingAmount: 500 });
  });

  it('reintento de apertura con el mismo clientId → 200 con la misma sesión', async () => {
    const { app, cookie } = buildApp();
    const body = { clientId: randomUUID(), openingAmount: 500 };
    const c = cookie(CASHIER_1, TENANT_A);

    const first = await request(app).post('/api/pos/cash-sessions').set('Cookie', c).send(body);
    const retry = await request(app).post('/api/pos/cash-sessions').set('Cookie', c).send(body);

    expect(first.status).toBe(201);
    expect(retry.status).toBe(200);
    expect(retry.body.session.id).toBe(first.body.session.id);
  });

  it('segunda apertura con otro clientId → 409 session_already_open', async () => {
    const { app, cookie } = buildApp();
    const c = cookie(CASHIER_1, TENANT_A);
    await openSession(app, c);

    const res = await request(app)
      .post('/api/pos/cash-sessions')
      .set('Cookie', c)
      .send({ clientId: randomUUID(), openingAmount: 100 });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('session_already_open');
  });

  it('valida el body de apertura (400)', async () => {
    const { app, cookie } = buildApp();
    const c = cookie(CASHIER_1, TENANT_A);
    for (const body of [
      {},
      { clientId: 'no-es-uuid', openingAmount: 1 },
      { clientId: randomUUID(), openingAmount: -1 },
      { clientId: randomUUID(), openingAmount: '500' },
    ]) {
      const res = await request(app).post('/api/pos/cash-sessions').set('Cookie', c).send(body);
      expect(res.status).toBe(400);
    }
  });

  it('GET /cash-sessions/current devuelve la caja del cajero, o null', async () => {
    const { app, cookie } = buildApp();
    const c1 = cookie(CASHIER_1, TENANT_A);

    const none = await request(app).get('/api/pos/cash-sessions/current').set('Cookie', c1);
    expect(none.status).toBe(200);
    expect(none.body.session).toBeNull();

    const opened = await openSession(app, c1);
    const current = await request(app).get('/api/pos/cash-sessions/current').set('Cookie', c1);
    expect(current.body.session.id).toBe(opened.id);

    const other = await request(app)
      .get('/api/pos/cash-sessions/current')
      .set('Cookie', cookie(CASHIER_2, TENANT_A));
    expect(other.body.session).toBeNull();
  });

  it('flujo completo: abrir → vender → resumen → cerrar con arqueo', async () => {
    const { app, store, cookie, lapiz } = buildApp();
    const c = cookie(CASHIER_1, TENANT_A);
    const session = await openSession(app, c, 500);

    const saleBody = {
      clientId: randomUUID(),
      cashSessionId: session.id,
      items: [{ productId: lapiz.id, quantity: 3 }],
      paymentMethod: 'cash',
      amountPaid: 20,
    };
    const sale = await request(app).post('/api/pos/sales').set('Cookie', c).send(saleBody);
    expect(sale.status).toBe(201);
    expect(sale.body.sale).toMatchObject({ ticketNumber: '001', total: 15, changeGiven: 5 });
    expect(store.products.get(lapiz.id)!.stockQty).toBe(7);

    const retry = await request(app).post('/api/pos/sales').set('Cookie', c).send(saleBody);
    expect(retry.status).toBe(200);
    expect(retry.body.sale.id).toBe(sale.body.sale.id);
    expect(store.products.get(lapiz.id)!.stockQty).toBe(7);

    const summary = await request(app)
      .get(`/api/pos/cash-sessions/${session.id}/summary`)
      .set('Cookie', c);
    expect(summary.status).toBe(200);
    expect(summary.body.summary).toEqual({ totalSales: 15, saleCount: 1, byPaymentMethod: { cash: 15 } });

    const closed = await request(app)
      .patch(`/api/pos/cash-sessions/${session.id}/close`)
      .set('Cookie', c)
      .send({ closingAmount: 515 });
    expect(closed.status).toBe(200);
    expect(closed.body.session).toMatchObject({
      status: 'closed',
      closingAmount: 515,
      expectedAmount: 515,
      difference: 0,
    });

    const afterClose = await request(app)
      .post('/api/pos/sales')
      .set('Cookie', c)
      .send({ ...saleBody, clientId: randomUUID() });
    expect(afterClose.status).toBe(409);
    expect(afterClose.body.code).toBe('session_closed');
  });

  it('ignora precio/nombre que mande el cliente: el total sale del catálogo', async () => {
    const { app, cookie, lapiz } = buildApp();
    const c = cookie(CASHIER_1, TENANT_A);
    const session = await openSession(app, c);

    const res = await request(app)
      .post('/api/pos/sales')
      .set('Cookie', c)
      .send({
        clientId: randomUUID(),
        cashSessionId: session.id,
        items: [{ productId: lapiz.id, quantity: 2, unitPrice: 0.01, productName: 'Gratis' }],
        paymentMethod: 'cash',
        amountPaid: 10,
        total: 0.02,
      });

    expect(res.status).toBe(201);
    expect(res.body.sale.total).toBe(10);
    expect(res.body.sale.items[0]).toMatchObject({ unitPrice: 5, productName: 'Lápiz Mirado' });
  });

  it('mapea errores de dominio a 4xx con code', async () => {
    const { app, cookie, lapiz } = buildApp();
    const c = cookie(CASHIER_1, TENANT_A);
    const session = await openSession(app, c);
    const base = {
      cashSessionId: session.id,
      items: [{ productId: lapiz.id, quantity: 1 }],
      paymentMethod: 'cash',
      amountPaid: 5,
    };

    const cases: Array<[Record<string, unknown>, number, string]> = [
      [{ items: [{ productId: lapiz.id, quantity: 11 }], amountPaid: 100 }, 409, 'insufficient_stock'],
      [{ items: [{ productId: randomUUID(), quantity: 1 }] }, 404, 'product_not_found'],
      [{ cashSessionId: randomUUID() }, 404, 'session_not_found'],
      [{ amountPaid: 4 }, 400, 'insufficient_payment'],
      [{ paymentMethod: 'card', amountPaid: 6 }, 400, 'invalid_payment'],
    ];
    for (const [over, status, code] of cases) {
      const res = await request(app)
        .post('/api/pos/sales')
        .set('Cookie', c)
        .send({ ...base, clientId: randomUUID(), ...over });
      expect({ status: res.status, code: res.body.code }).toEqual({ status, code });
    }
  });

  it('valida el body de venta con Zod (400), incluido "mixed" que v1 no acepta', async () => {
    const { app, cookie, lapiz } = buildApp();
    const c = cookie(CASHIER_1, TENANT_A);
    const session = await openSession(app, c);
    const valid = {
      clientId: randomUUID(),
      cashSessionId: session.id,
      items: [{ productId: lapiz.id, quantity: 1 }],
      paymentMethod: 'cash',
      amountPaid: 5,
    };

    for (const over of [
      { items: [] },
      { items: [{ productId: lapiz.id, quantity: 0 }] },
      { items: [{ productId: 'x', quantity: 1 }] },
      { paymentMethod: 'mixed' },
      { paymentMethod: 'bitcoin' },
      { clientId: undefined },
      { amountPaid: -1 },
    ]) {
      const res = await request(app).post('/api/pos/sales').set('Cookie', c).send({ ...valid, ...over });
      expect(res.status).toBe(400);
    }
  });

  it('otro cajero del mismo tenant no puede vender, ver ni cerrar mi caja (403)', async () => {
    const { app, cookie, lapiz } = buildApp();
    const mine = cookie(CASHIER_1, TENANT_A);
    const theirs = cookie(CASHIER_2, TENANT_A);
    const session = await openSession(app, mine);

    const sale = await request(app)
      .post('/api/pos/sales')
      .set('Cookie', theirs)
      .send({
        clientId: randomUUID(),
        cashSessionId: session.id,
        items: [{ productId: lapiz.id, quantity: 1 }],
        paymentMethod: 'cash',
        amountPaid: 5,
      });
    const summary = await request(app)
      .get(`/api/pos/cash-sessions/${session.id}/summary`)
      .set('Cookie', theirs);
    const close = await request(app)
      .patch(`/api/pos/cash-sessions/${session.id}/close`)
      .set('Cookie', theirs)
      .send({ closingAmount: 0 });

    for (const res of [sale, summary, close]) {
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('session_not_owned');
    }
  });

  it('una caja de otro tenant es invisible (404), aunque el cajero coincida', async () => {
    const { app, cookie } = buildApp();
    const session = await openSession(app, cookie(CASHIER_1, TENANT_A));

    const res = await request(app)
      .get(`/api/pos/cash-sessions/${session.id}/summary`)
      .set('Cookie', cookie(CASHIER_1, TENANT_B));

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('session_not_found');
  });

  it('id no-uuid en la ruta → 400 (no llega a Postgres)', async () => {
    const { app, cookie } = buildApp();
    const c = cookie(CASHIER_1, TENANT_A);
    const summary = await request(app).get('/api/pos/cash-sessions/abc/summary').set('Cookie', c);
    const close = await request(app)
      .patch('/api/pos/cash-sessions/abc/close')
      .set('Cookie', c)
      .send({ closingAmount: 1 });
    expect(summary.status).toBe(400);
    expect(close.status).toBe(400);
  });

  it('un fallo de infraestructura responde 500 sin filtrar el mensaje interno', async () => {
    const broken = {
      findByClientId: jest.fn().mockRejectedValue(new Error('connection reset by peer')),
    } as unknown as PosCashSessionRepository;
    const { app, cookie } = buildApp({ posCashSessions: broken });

    const res = await request(app)
      .post('/api/pos/cash-sessions')
      .set('Cookie', cookie(CASHIER_1, TENANT_A))
      .send({ clientId: randomUUID(), openingAmount: 1 });

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Error interno del POS' });
  });
});
