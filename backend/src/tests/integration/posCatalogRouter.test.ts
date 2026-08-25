/**
 * Tests de integración de posCatalogRouter (Bloque 5): scope de tenant
 * (mismo patrón anti-IDOR del Bloque 1, vía requireTenantScope) y el
 * contrato HTTP del endpoint de import.
 */
import express, { Express } from 'express';
import cookieParser from 'cookie-parser';
import pino from 'pino';
import request from 'supertest';

import { JwtService } from '@/infrastructure/auth/JwtService';
import { createAuthMiddleware } from '@/infrastructure/auth/AuthMiddleware';
import { createAdminRouter } from '@/infrastructure/server/AdminRouter';
import type { AdminSessionsRepository } from '@/domain/ports/AdminSessionsRepository';
import type { ImportPosProductsUseCase } from '@/domain/use-cases/ImportPosProductsUseCase';
import type { PosProductRepository } from '@/domain/ports/pos/PosProductRepository';
import type { PosCategoryRepository } from '@/domain/ports/pos/PosCategoryRepository';

const SECRET = 'b'.repeat(64);
const COOKIE = 'admin_session_test';
const TENANT_A = '00000000-0000-0000-0000-0000000000aa';
const TENANT_B = '00000000-0000-0000-0000-0000000000bb';

const logger = pino({ level: 'silent' });

function buildApp() {
  const jwt = new JwtService(SECRET, 3600);
  const sessions: AdminSessionsRepository = {
    isRevoked: jest.fn().mockResolvedValue(false),
    revoke: jest.fn().mockResolvedValue(undefined),
  } as unknown as AdminSessionsRepository;

  const requireAdmin = createAuthMiddleware({
    jwt,
    sessions,
    cookieName: COOKIE,
    apiKey: '',
    cloudflareAllowedDomain: '',
    logger,
  });

  const importPosProductsUseCase: ImportPosProductsUseCase = {
    execute: jest.fn().mockResolvedValue({ created: 1, updated: 0, errors: [] }),
  } as unknown as ImportPosProductsUseCase;

  const posProductRepository: PosProductRepository = {
    findById: jest.fn(),
    create: jest.fn().mockResolvedValue({ id: 'p1', sku: 'X-1' }),
    update: jest.fn().mockResolvedValue({ id: 'p1', sku: 'X-1' }),
  } as unknown as PosProductRepository;

  const posCategoryRepository: PosCategoryRepository = {
    findByName: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({ id: 'cat-1', name: 'Cat' }),
  } as unknown as PosCategoryRepository;

  const noop = {} as any;

  const adminRouter = createAdminRouter({
    requireAdmin,
    assignMoldeUseCase: noop,
    setTenantStatusUseCase: noop,
    simulateMessageUseCase: noop,
    createTenantUseCase: noop,
    tenantRepository: noop,
    tenantServiceRepository: noop,
    botFlowRepository: noop,
    messagesRepository: noop,
    userRepository: noop,
    whatsappFlowRepository: noop,
    posProductRepository,
    posCategoryRepository,
    importPosProductsUseCase,
    serviceDirectoryRepository: noop,
    audit: { log: jest.fn() } as any,
    supabase: noop,
    logger,
  });

  const app: Express = express();
  // Espejo del body-parser global que ExpressServer monta en producción
  // (64kb) — la ruta de import trae su propio override más grande.
  app.use(express.json({ limit: '64kb' }));
  app.use(cookieParser());
  app.use('/api/admin', adminRouter);

  return { app, jwt, importPosProductsUseCase, posProductRepository, posCategoryRepository };
}

function cookieFor(jwt: JwtService, role: 'super_admin' | 'admin_operator', tenantId: string | null) {
  const { token } = jwt.sign({ sub: 'admin-1', email: 'admin@x.test', role, tenantId });
  return `${COOKIE}=${token}`;
}

const VALID_CSV = 'sku,name,category,unit_price,stock_qty\nX-1,Producto,Cat,10,5';
const csvBuffer = (text = VALID_CSV) => Buffer.from(text, 'utf-8');

describe('POST /api/admin/tenants/:id/pos/products/import — scope de tenant', () => {
  it('admin_operator de tenant A no puede importar catálogo de tenant B (403)', async () => {
    const { app, jwt } = buildApp();
    const res = await request(app)
      .post(`/api/admin/tenants/${TENANT_B}/pos/products/import`)
      .set('Cookie', cookieFor(jwt, 'admin_operator', TENANT_A))
      .attach('file', csvBuffer(), 'catalogo.csv');

    expect(res.status).toBe(403);
  });

  it('admin_operator SÍ puede importar sobre su propio tenant (200)', async () => {
    const { app, jwt, importPosProductsUseCase } = buildApp();
    const res = await request(app)
      .post(`/api/admin/tenants/${TENANT_A}/pos/products/import`)
      .set('Cookie', cookieFor(jwt, 'admin_operator', TENANT_A))
      .attach('file', csvBuffer(), 'catalogo.csv');

    expect(res.status).toBe(200);
    expect(importPosProductsUseCase.execute).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_A, csvText: VALID_CSV, dryRun: false }),
    );
  });

  it('super_admin puede importar sobre cualquier tenant (200)', async () => {
    const { app, jwt, importPosProductsUseCase } = buildApp();
    const res = await request(app)
      .post(`/api/admin/tenants/${TENANT_B}/pos/products/import`)
      .set('Cookie', cookieFor(jwt, 'super_admin', null))
      .attach('file', csvBuffer(), 'catalogo.csv');

    expect(res.status).toBe(200);
    expect(importPosProductsUseCase.execute).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_B }),
    );
  });

  it('sin cookie -> 401', async () => {
    const { app } = buildApp();
    const res = await request(app)
      .post(`/api/admin/tenants/${TENANT_A}/pos/products/import`)
      .attach('file', csvBuffer(), 'catalogo.csv');

    expect(res.status).toBe(401);
  });

  it('sin archivo -> 400, no llega al use-case', async () => {
    const { app, jwt, importPosProductsUseCase } = buildApp();
    const res = await request(app)
      .post(`/api/admin/tenants/${TENANT_A}/pos/products/import`)
      .set('Cookie', cookieFor(jwt, 'super_admin', null))
      .field('dryRun', 'false');

    expect(res.status).toBe(400);
    expect(importPosProductsUseCase.execute).not.toHaveBeenCalled();
  });

  it('dryRun=true (campo de form-data) pasa dryRun al use-case', async () => {
    const { app, jwt, importPosProductsUseCase } = buildApp();
    const res = await request(app)
      .post(`/api/admin/tenants/${TENANT_A}/pos/products/import`)
      .set('Cookie', cookieFor(jwt, 'super_admin', null))
      .field('dryRun', 'true')
      .attach('file', csvBuffer(), 'catalogo.csv');

    expect(res.status).toBe(200);
    expect(importPosProductsUseCase.execute).toHaveBeenCalledWith(
      expect.objectContaining({ dryRun: true }),
    );
  });

  it('responde el shape { created, updated, errors } del use-case', async () => {
    const { app, jwt, importPosProductsUseCase } = buildApp();
    (importPosProductsUseCase.execute as jest.Mock).mockResolvedValueOnce({
      created: 3,
      updated: 2,
      errors: [{ row: 4, sku: 'BAD', message: 'name requerido' }],
    });

    const res = await request(app)
      .post(`/api/admin/tenants/${TENANT_A}/pos/products/import`)
      .set('Cookie', cookieFor(jwt, 'super_admin', null))
      .attach('file', csvBuffer(), 'catalogo.csv');

    expect(res.body).toEqual({
      created: 3,
      updated: 2,
      errors: [{ row: 4, sku: 'BAD', message: 'name requerido' }],
    });
  });
});

describe('POST /api/admin/tenants/:id/pos/products — creación individual', () => {
  it('admin_operator de tenant A no puede crear producto en tenant B (403)', async () => {
    const { app, jwt } = buildApp();
    const res = await request(app)
      .post(`/api/admin/tenants/${TENANT_B}/pos/products`)
      .set('Cookie', cookieFor(jwt, 'admin_operator', TENANT_A))
      .send({ sku: 'X-1', name: 'Producto', unitPrice: 10 });

    expect(res.status).toBe(403);
  });

  it('crea el producto y responde 201 con el producto creado', async () => {
    const { app, jwt, posProductRepository } = buildApp();
    const res = await request(app)
      .post(`/api/admin/tenants/${TENANT_A}/pos/products`)
      .set('Cookie', cookieFor(jwt, 'super_admin', null))
      .send({ sku: 'X-1', name: 'Producto', unitPrice: 10 });

    expect(res.status).toBe(201);
    expect(posProductRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_A, sku: 'X-1', name: 'Producto', unitPrice: 10 }),
    );
  });

  it('body sin sku -> 400', async () => {
    const { app, jwt } = buildApp();
    const res = await request(app)
      .post(`/api/admin/tenants/${TENANT_A}/pos/products`)
      .set('Cookie', cookieFor(jwt, 'super_admin', null))
      .send({ name: 'Producto', unitPrice: 10 });

    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/admin/tenants/:id/pos/products/:productId', () => {
  it('producto inexistente -> 404', async () => {
    const { app, jwt, posProductRepository } = buildApp();
    (posProductRepository.findById as jest.Mock).mockResolvedValueOnce(null);

    const res = await request(app)
      .patch(`/api/admin/tenants/${TENANT_A}/pos/products/no-existe`)
      .set('Cookie', cookieFor(jwt, 'super_admin', null))
      .send({ name: 'Nuevo nombre' });

    expect(res.status).toBe(404);
  });

  it('actualiza el producto existente', async () => {
    const { app, jwt, posProductRepository } = buildApp();
    (posProductRepository.findById as jest.Mock).mockResolvedValueOnce({ id: 'p1', categoryId: null });

    const res = await request(app)
      .patch(`/api/admin/tenants/${TENANT_A}/pos/products/p1`)
      .set('Cookie', cookieFor(jwt, 'super_admin', null))
      .send({ name: 'Nuevo nombre' });

    expect(res.status).toBe(200);
    expect(posProductRepository.update).toHaveBeenCalledWith(
      TENANT_A,
      'p1',
      expect.objectContaining({ name: 'Nuevo nombre' }),
    );
  });
});
