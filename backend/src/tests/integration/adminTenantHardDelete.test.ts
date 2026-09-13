/**
 * DELETE /api/admin/tenants/:id/permanent — borrado permanente desde el panel.
 * Irreversible: solo super_admin, nombre exacto, status draft/sandbox/archived,
 * y una fila `tenant.delete.permanent` en el audit log, distinta del
 * `tenant.delete` del soft-delete.
 */
import express from 'express';
import cookieParser from 'cookie-parser';
import pino from 'pino';
import request from 'supertest';
import { JwtService } from '@/infrastructure/auth/JwtService';
import { createAuthMiddleware } from '@/infrastructure/auth/AuthMiddleware';
import { createAdminRouter } from '@/infrastructure/server/AdminRouter';
import type { AdminSessionsRepository } from '@/domain/ports/AdminSessionsRepository';
import type { TenantRepository, TenantStatus } from '@/domain/ports/TenantRepository';

const SECRET = 'd'.repeat(64);
const COOKIE = 'admin_session_test';
const TENANT = '00000000-0000-0000-0000-0000000000aa';
const NOMBRE = 'Papelería DEMO';
const logger = pino({ level: 'silent' });

function buildApp(found: { status: TenantStatus } | null) {
  const jwt = new JwtService(SECRET, 3600);
  const requireAdmin = createAuthMiddleware({
    jwt,
    sessions: { isRevoked: jest.fn().mockResolvedValue(false), revoke: jest.fn() } as unknown as AdminSessionsRepository,
    cookieName: COOKIE,
    apiKey: '',
    cloudflareAllowedDomain: '',
    logger,
  });
  const findIncludingDeleted = jest
    .fn()
    .mockResolvedValue(found ? { id: TENANT, nombre_negocio: NOMBRE, status: found.status } : null);
  const hardDelete = jest.fn().mockResolvedValue(undefined);
  const invalidate = jest.fn();
  const noop = {} as never;
  const audit = { log: jest.fn() };
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/admin', createAdminRouter({
    requireAdmin,
    assignMoldeUseCase: noop,
    setTenantStatusUseCase: noop,
    simulateConversationUseCase: noop,
    createTenantUseCase: noop,
    tenantRepository: { findIncludingDeleted, hardDelete } as unknown as TenantRepository,
    tenantServiceRepository: noop,
    botFlowRepository: noop,
    messagesRepository: noop,
    userRepository: noop,
    whatsappFlowRepository: noop,
    posProductRepository: noop,
    posCategoryRepository: noop,
    importPosProductsUseCase: noop,
    serviceDirectoryRepository: noop,
    flowTestCaseRepository: {} as never,
    tenantConfigPort: { getConfig: jest.fn(), invalidate },
    audit: audit as never,
    supabase: noop,
    logger,
  }));
  const superAdmin = jwt.sign({ sub: 'admin-1', email: 'a@x.test', role: 'super_admin', tenantId: null });
  const operator = jwt.sign({ sub: 'op-1', email: 'op@x.test', role: 'admin_operator', tenantId: TENANT });
  return {
    app,
    audit,
    findIncludingDeleted,
    hardDelete,
    invalidate,
    cookie: `${COOKIE}=${superAdmin.token}`,
    operatorCookie: `${COOKIE}=${operator.token}`,
  };
}

const url = `/api/admin/tenants/${TENANT}/permanent`;

describe('DELETE /tenants/:id/permanent', () => {
  it('borra un tenant en draft con el nombre exacto, audita tenant.delete.permanent e invalida la caché', async () => {
    const { app, audit, hardDelete, invalidate, cookie } = buildApp({ status: 'draft' });

    const res = await request(app).delete(url).set('Cookie', cookie).send({ confirmNombreNegocio: NOMBRE });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(hardDelete).toHaveBeenCalledWith(TENANT);
    expect(invalidate).toHaveBeenCalledWith(TENANT);
    expect(audit.log).toHaveBeenCalledTimes(1);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'tenant.delete.permanent',
        targetType: 'tenant',
        targetId: TENANT,
        metadata: { nombre_negocio: NOMBRE, status: 'draft' },
      }),
    );
  });

  it('purga un tenant ya archivado (soft-deleted)', async () => {
    const { app, hardDelete, cookie } = buildApp({ status: 'archived' });

    const res = await request(app).delete(url).set('Cookie', cookie).send({ confirmNombreNegocio: NOMBRE });

    expect(res.status).toBe(200);
    expect(hardDelete).toHaveBeenCalledWith(TENANT);
  });

  it('400 si el nombre no coincide exacto, sin borrar ni auditar', async () => {
    const { app, audit, hardDelete, cookie } = buildApp({ status: 'draft' });

    const res = await request(app).delete(url).set('Cookie', cookie).send({ confirmNombreNegocio: 'papelería demo' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'El nombre no coincide' });
    expect(hardDelete).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });

  it.each<TenantStatus>(['live', 'paused'])('400 para un tenant en %s, sin borrar', async (status) => {
    const { app, audit, hardDelete, cookie } = buildApp({ status });

    const res = await request(app).delete(url).set('Cookie', cookie).send({ confirmNombreNegocio: NOMBRE });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: 'Solo se pueden eliminar clientes en draft, sandbox o archivados. Archiva este cliente primero.',
    });
    expect(hardDelete).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('400 sin confirmNombreNegocio en el body, sin siquiera buscar el tenant', async () => {
    const { app, findIncludingDeleted, hardDelete, cookie } = buildApp({ status: 'draft' });

    const res = await request(app).delete(url).set('Cookie', cookie).send({});

    expect(res.status).toBe(400);
    expect(findIncludingDeleted).not.toHaveBeenCalled();
    expect(hardDelete).not.toHaveBeenCalled();
  });

  it('404 si el tenant no existe', async () => {
    const { app, hardDelete, cookie } = buildApp(null);

    const res = await request(app).delete(url).set('Cookie', cookie).send({ confirmNombreNegocio: NOMBRE });

    expect(res.status).toBe(404);
    expect(hardDelete).not.toHaveBeenCalled();
  });

  it('403 para admin_operator, aunque sea su propio tenant', async () => {
    const { app, hardDelete, operatorCookie } = buildApp({ status: 'draft' });

    const res = await request(app).delete(url).set('Cookie', operatorCookie).send({ confirmNombreNegocio: NOMBRE });

    expect(res.status).toBe(403);
    expect(hardDelete).not.toHaveBeenCalled();
  });
});
