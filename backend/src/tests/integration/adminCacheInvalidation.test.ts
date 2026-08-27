/**
 * D-01 (auditoría 2026-08-26): SupabaseTenantConfigService cachea
 * TenantConfig (incluye bot_configuration y serviceDirectory) con TTL de
 * 5 min in-process. Antes de este fix, ningún router de /api/admin/*
 * llamaba `.invalidate(tenantId)` tras mutar esos datos — el panel
 * "guardaba" el cambio pero el bot seguía respondiendo la versión vieja
 * hasta que expirara el TTL solo. Regresión: cada mutación relevante debe
 * invalidar la caché del tenant afectado.
 */
import express, { Express } from 'express';
import cookieParser from 'cookie-parser';
import pino from 'pino';
import request from 'supertest';

import { JwtService } from '@/infrastructure/auth/JwtService';
import { createAuthMiddleware } from '@/infrastructure/auth/AuthMiddleware';
import { createAdminRouter } from '@/infrastructure/server/AdminRouter';
import type { AdminSessionsRepository } from '@/domain/ports/AdminSessionsRepository';
import type { TenantRepository } from '@/domain/ports/TenantRepository';
import type { ServiceDirectoryRepository, TenantConfigPort } from '@/domain/ports';

const SECRET = 'b'.repeat(64);
const COOKIE = 'admin_session_test';
const TENANT_A = '00000000-0000-0000-0000-0000000000aa';

const logger = pino({ level: 'silent' });

function buildApp(deps: {
  tenantRepository?: Partial<TenantRepository>;
  serviceDirectoryRepository?: Partial<ServiceDirectoryRepository>;
}) {
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

  const tenantConfigPort: TenantConfigPort = {
    getConfig: jest.fn(),
    invalidate: jest.fn(),
  };

  const noop = {} as any;

  const adminRouter = createAdminRouter({
    requireAdmin,
    assignMoldeUseCase: noop,
    setTenantStatusUseCase: noop,
    simulateMessageUseCase: noop,
    createTenantUseCase: noop,
    tenantRepository: (deps.tenantRepository ?? {}) as TenantRepository,
    tenantServiceRepository: noop,
    botFlowRepository: noop,
    messagesRepository: noop,
    userRepository: noop,
    whatsappFlowRepository: noop,
    posProductRepository: noop,
    posCategoryRepository: noop,
    importPosProductsUseCase: noop,
    serviceDirectoryRepository: (deps.serviceDirectoryRepository ?? {}) as ServiceDirectoryRepository,
    tenantConfigPort,
    audit: { log: jest.fn() } as any,
    supabase: noop,
    logger,
  });

  const app: Express = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/admin', adminRouter);

  const { token } = jwt.sign({
    sub: 'admin-1',
    email: 'admin@x.test',
    role: 'super_admin',
    tenantId: null,
  });

  return { app, tenantConfigPort, cookie: `${COOKIE}=${token}` };
}

describe('Invalidación de caché de TenantConfig tras mutaciones admin (D-01)', () => {
  it('PATCH /tenants/:id con bot_configuration invalida la caché del tenant', async () => {
    const { app, tenantConfigPort, cookie } = buildApp({
      tenantRepository: { update: jest.fn().mockResolvedValue(undefined) },
    });

    const res = await request(app)
      .patch(`/api/admin/tenants/${TENANT_A}`)
      .set('Cookie', cookie)
      .send({ bot_configuration: { mensaje_bienvenida: 'Hola nuevo texto' } });

    expect(res.status).toBe(200);
    expect(tenantConfigPort.invalidate).toHaveBeenCalledWith(TENANT_A);
  });

  it('PATCH /tenants/:id SIN bot_configuration no invalida (no hay nada cacheado que cambie)', async () => {
    const { app, tenantConfigPort, cookie } = buildApp({
      tenantRepository: { update: jest.fn().mockResolvedValue(undefined) },
    });

    const res = await request(app)
      .patch(`/api/admin/tenants/${TENANT_A}`)
      .set('Cookie', cookie)
      .send({ direccion: 'Nueva dirección 123' });

    expect(res.status).toBe(200);
    expect(tenantConfigPort.invalidate).not.toHaveBeenCalled();
  });

  it('POST .../service-directory invalida la caché del tenant', async () => {
    const { app, tenantConfigPort, cookie } = buildApp({
      serviceDirectoryRepository: {
        create: jest.fn().mockResolvedValue({ id: 'e1', nombre: 'WiFi' }),
      },
    });

    const res = await request(app)
      .post(`/api/admin/tenants/${TENANT_A}/service-directory`)
      .set('Cookie', cookie)
      .send({ nombre: 'WiFi', keywords: ['wifi'], respuesta: 'Sí hay wifi' });

    expect(res.status).toBe(201);
    expect(tenantConfigPort.invalidate).toHaveBeenCalledWith(TENANT_A);
  });

  it('PUT .../service-directory/:entryId invalida la caché del tenant', async () => {
    const { app, tenantConfigPort, cookie } = buildApp({
      serviceDirectoryRepository: {
        update: jest.fn().mockResolvedValue({ id: 'e1', nombre: 'WiFi' }),
      },
    });

    const res = await request(app)
      .put(`/api/admin/tenants/${TENANT_A}/service-directory/e1`)
      .set('Cookie', cookie)
      .send({ activo: false });

    expect(res.status).toBe(200);
    expect(tenantConfigPort.invalidate).toHaveBeenCalledWith(TENANT_A);
  });

  it('DELETE .../service-directory/:entryId invalida la caché del tenant', async () => {
    const { app, tenantConfigPort, cookie } = buildApp({
      serviceDirectoryRepository: {
        delete: jest.fn().mockResolvedValue(undefined),
      },
    });

    const res = await request(app)
      .delete(`/api/admin/tenants/${TENANT_A}/service-directory/e1`)
      .set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(tenantConfigPort.invalidate).toHaveBeenCalledWith(TENANT_A);
  });
});
