import express, { Express } from 'express';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import pino from 'pino';
import request from 'supertest';

import { JwtService } from '@/infrastructure/auth/JwtService';
import { createAuthRouter } from '@/infrastructure/server/AuthRouter';
import { createPosRouter } from '@/infrastructure/server/PosRouter';
import { createPosAuthMiddleware } from '@/infrastructure/auth/PosAuthMiddleware';
import { createRequireModule } from '@/infrastructure/auth/ModuleGuard';
import { PosAuthService } from '@/application/pos/PosAuthService';

import type { AuditLogService } from '@/infrastructure/services/AuditLogService';
import type { AdminUsersRepository } from '@/domain/ports/AdminUsersRepository';
import type { AdminSessionsRepository } from '@/domain/ports/AdminSessionsRepository';
import type { LoginAttemptsRepository } from '@/domain/ports/LoginAttemptsRepository';
import type { TenantRepository } from '@/domain/ports/TenantRepository';
import type { PosUserRepository } from '@/domain/ports/pos/PosUserRepository';
import type { PosProductRepository } from '@/domain/ports/pos/PosProductRepository';
import type { PosCategoryRepository } from '@/domain/ports/pos/PosCategoryRepository';
import type { PosTenantConfigRepository } from '@/domain/ports/pos/PosTenantConfigRepository';
import type { PosUser } from '@/domain/entities/pos/PosUser';
import type { PosProduct } from '@/domain/entities/pos/Product';
import type { PosCategory } from '@/domain/entities/pos/Category';
import type { PosTenantConfig } from '@/domain/entities/pos/PosTenantConfig';

const SECRET = 'a'.repeat(64);
const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const TENANT_NO_POS = '00000000-0000-0000-0000-000000000099';
const USER_ID = '00000000-0000-0000-0000-000000000002';
const COOKIE = 'pos_session_test';

const logger = pino({ level: 'silent' });

function fakePosUser(): PosUser {
  return {
    id: USER_ID,
    tenantId: TENANT_ID,
    name: 'Demo Cajera',
    pinHash: bcrypt.hashSync('1234', 4),
    role: 'pos_cashier',
    isActive: true,
    failedAttempts: 0,
    lockedUntil: null,
    lastLoginAt: null,
    createdAt: new Date(),
  };
}

function fakeProduct(over: Partial<PosProduct> = {}): PosProduct {
  return {
    id: 'p1',
    tenantId: TENANT_ID,
    sku: 'LAP-001',
    barcode: '7501031234567',
    name: 'Lápiz Mirado',
    description: null,
    categoryId: 'c1',
    unitType: 'piece',
    unitPrice: 5,
    costPrice: 2.5,
    taxRate: 0,
    stockQty: 100,
    stockMin: 20,
    trackStock: true,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  };
}

interface BuildOpts {
  posModuleEnabledFor?: string[]; // tenants con módulo POS habilitado
}

function buildApp(opts: BuildOpts = {}) {
  const enabledFor = new Set(opts.posModuleEnabledFor ?? [TENANT_ID]);

  // Mocks
  const audit: AuditLogService = { log: jest.fn() } as unknown as AuditLogService;

  const adminUsers: AdminUsersRepository = {
    findByEmail: jest.fn().mockResolvedValue(null),
    updatePassword: jest.fn(),
  } as unknown as AdminUsersRepository;

  const sessions: AdminSessionsRepository = {
    isRevoked: jest.fn().mockResolvedValue(false),
    revoke: jest.fn().mockResolvedValue(undefined),
  } as unknown as AdminSessionsRepository;

  const attempts: LoginAttemptsRepository = {
    countFailed: jest.fn().mockResolvedValue(0),
    record: jest.fn().mockResolvedValue(undefined),
  } as unknown as LoginAttemptsRepository;

  const tenants: TenantRepository = {
    findAll: jest.fn(),
    findById: jest.fn(),
    findFullDetail: jest.fn(),
    setStatus: jest.fn(),
    createAtomic: jest.fn(),
    update: jest.fn(),
    softDelete: jest.fn(),
    isModuleEnabled: jest.fn(async (id: string, m: string) => m === 'pos' && enabledFor.has(id)),
  } as unknown as TenantRepository;

  const posUsersStore = new Map<string, PosUser>();
  const u = fakePosUser();
  posUsersStore.set(`${u.tenantId}::${u.name}`, u);

  const posUsers: PosUserRepository = {
    findById: jest.fn(),
    findByTenantAndName: jest.fn(async (tid: string, name: string) =>
      posUsersStore.get(`${tid}::${name}`) ?? null,
    ),
    recordFailedAttempt: jest.fn(async (id: string, lock: Date | null) => {
      for (const v of posUsersStore.values()) {
        if (v.id === id) {
          v.failedAttempts += 1;
          v.lockedUntil = lock;
        }
      }
    }),
    recordSuccessfulLogin: jest.fn(async (id: string) => {
      for (const v of posUsersStore.values()) {
        if (v.id === id) {
          v.failedAttempts = 0;
          v.lockedUntil = null;
        }
      }
    }),
  } as unknown as PosUserRepository;

  const posProducts: PosProductRepository = {
    findById: jest.fn(async (tid, id) => (tid === TENANT_ID && id === 'p1' ? fakeProduct() : null)),
    findByBarcode: jest.fn(async (tid, bc) =>
      tid === TENANT_ID && bc === '7501031234567' ? fakeProduct() : null,
    ),
    findBySku: jest.fn(),
    search: jest.fn(async (tid, q) =>
      tid === TENANT_ID && q.toLowerCase().includes('lap') ? [fakeProduct()] : [],
    ),
    list: jest.fn(async (tid) => (tid === TENANT_ID ? [fakeProduct()] : [])),
    countActive: jest.fn(),
  } as unknown as PosProductRepository;

  const posCategories: PosCategoryRepository = {
    findById: jest.fn(),
    list: jest.fn(async (tid) =>
      tid === TENANT_ID
        ? ([
          {
            id: 'c1',
            tenantId: TENANT_ID,
            name: 'Escritura',
            parentId: null,
            displayOrder: 1,
            isActive: true,
            createdAt: new Date(),
          },
        ] as PosCategory[])
        : [],
    ),
  } as unknown as PosCategoryRepository;

  const posConfig: PosTenantConfigRepository = {
    getByTenant: jest.fn(async (tid) =>
      tid === TENANT_ID
        ? ({
          tenantId: TENANT_ID,
          mould: 'papeleria',
          businessName: 'Papelería Piloto Test',
          businessAddress: null,
          businessPhone: null,
          ticketHeader: null,
          ticketFooter: null,
          printerModel: null,
          printerConnection: null,
          printerAddress: null,
          defaultTaxRate: 0,
          currency: 'MXN',
          loyaltyEnabled: true,
          loyaltyPointsPerPeso: 1.0,
          whatsappTicketEnabled: false,
          updatedAt: new Date(),
        } as PosTenantConfig)
        : null,
    ),
  } as unknown as PosTenantConfigRepository;

  const jwt = new JwtService(SECRET, 60);
  const posAuthService = new PosAuthService(posUsers, tenants, jwt, audit, 5, 15, logger);

  const requirePosSession = createPosAuthMiddleware({
    jwt, sessions, posCookieName: COOKIE, logger,
  });
  const requireModule = createRequireModule(tenants, 'pos', logger);

  const requireAdmin = (_req: any, _res: any, next: any) => next();

  const authRouter = createAuthRouter({
    jwt, adminUsers, sessions, attempts, audit, requireAdmin,
    posAuthService, requirePosSession, posCookieName: COOKIE, logger,
  });
  const posRouter = createPosRouter({
    requirePosSession, requireModule,
    posProducts, posCategories, posConfig,
    logger,
  });

  const app: Express = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/auth', authRouter);
  app.use('/api/pos', posRouter);

  return { app, jwt };
}

describe('POS integration', () => {
  // ===== /health (público) =====
  it('GET /api/pos/health responde sin auth', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/api/pos/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, module: 'pos', version: '0.1.0' });
  });

  // ===== /products sin cookie → 401 =====
  it('GET /api/pos/products sin cookie devuelve 401', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/api/pos/products');
    expect(res.status).toBe(401);
  });

  // ===== Login OK + uso de cookie en rutas protegidas =====
  it('POST /api/auth/pos-login OK → cookie permite acceder a /products y /categories', async () => {
    const { app } = buildApp();
    const agent = request.agent(app);

    const login = await agent
      .post('/api/auth/pos-login')
      .send({ tenantId: TENANT_ID, name: 'Demo Cajera', pin: '1234' });
    expect(login.status).toBe(200);
    expect(login.body.user.displayName).toBe('Demo Cajera');
    expect(login.body.user.tenantId).toBe(TENANT_ID);

    const products = await agent.get('/api/pos/products');
    expect(products.status).toBe(200);
    expect(products.body.products).toHaveLength(1);
    expect(products.body.products[0].sku).toBe('LAP-001');

    const cats = await agent.get('/api/pos/categories');
    expect(cats.status).toBe(200);
    expect(cats.body.categories).toHaveLength(1);

    const lookup = await agent.get('/api/pos/products/lookup?q=lap');
    expect(lookup.status).toBe(200);
    expect(lookup.body.products.length).toBeGreaterThan(0);

    const cfg = await agent.get('/api/pos/config');
    expect(cfg.status).toBe(200);
    expect(cfg.body.config.mould).toBe('papeleria');
  });

  // ===== Login con PIN incorrecto → 401 =====
  it('POST /api/auth/pos-login con PIN incorrecto → 401 invalid_pin', async () => {
    const { app } = buildApp();
    const res = await request(app)
      .post('/api/auth/pos-login')
      .send({ tenantId: TENANT_ID, name: 'Demo Cajera', pin: '9999' });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('invalid_pin');
  });

  // ===== Login a tenant SIN módulo pos → 403 module_disabled =====
  it('POST /api/auth/pos-login para tenant sin módulo POS → 403 module_disabled', async () => {
    const { app } = buildApp({ posModuleEnabledFor: [] });
    const res = await request(app)
      .post('/api/auth/pos-login')
      .send({ tenantId: TENANT_NO_POS, name: 'Demo Cajera', pin: '1234' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('module_disabled');
  });

  // ===== Token admin NO sirve para /api/pos =====
  it('Cookie con scope=admin no abre /api/pos/products (401)', async () => {
    const { app, jwt } = buildApp();
    const { token } = jwt.sign({
      sub: 'admin-1',
      email: 'admin@x',
      role: 'super_admin',
      tenantId: null,
    });
    const res = await request(app)
      .get('/api/pos/products')
      .set('Cookie', `${COOKIE}=${token}`);
    expect(res.status).toBe(401);
  });

  // ===== pos-logout limpia cookie =====
  it('POST /api/auth/pos-logout revoca y limpia cookie', async () => {
    const { app } = buildApp();
    const agent = request.agent(app);
    await agent
      .post('/api/auth/pos-login')
      .send({ tenantId: TENANT_ID, name: 'Demo Cajera', pin: '1234' });
    const logout = await agent.post('/api/auth/pos-logout');
    expect(logout.status).toBe(200);
    expect(logout.body.ok).toBe(true);
  });
});
