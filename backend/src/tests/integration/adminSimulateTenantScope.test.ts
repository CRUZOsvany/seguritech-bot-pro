/**
 * Regresión de seguridad — F1 (auditoría 2026-08-20):
 * POST /api/admin/simulate y POST /api/admin/simulate/reset no validaban que
 * un admin_operator (scope limitado a su propio tenant) estuviera restringido
 * al tenantId recibido en el body, a diferencia de todas las demás rutas admin
 * con tenant. Un admin_operator podía simular mensajes y mutar bot_users de
 * OTRO tenant. Ver AuthMiddleware.requireTenantScope (mismo patrón, aplicado
 * aquí a mano porque tenantId viene del body y no de :id).
 */
import express, { Express } from 'express';
import cookieParser from 'cookie-parser';
import pino from 'pino';
import request from 'supertest';

import { JwtService } from '@/infrastructure/auth/JwtService';
import { createAuthMiddleware } from '@/infrastructure/auth/AuthMiddleware';
import { createAdminRouter } from '@/infrastructure/server/AdminRouter';
import type { AdminSessionsRepository } from '@/domain/ports/AdminSessionsRepository';
import type { SimulateMessageUseCase } from '@/domain/use-cases/SimulateMessageUseCase';

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

  const simulateMessageUseCase: SimulateMessageUseCase = {
    execute: jest.fn().mockResolvedValue({
      outputs: [],
      nextNodeId: 'n1',
      context: {},
      flowEnded: false,
    }),
    reset: jest.fn().mockResolvedValue(undefined),
  } as unknown as SimulateMessageUseCase;

  const noop = {} as any;

  const adminRouter = createAdminRouter({
    requireAdmin,
    assignMoldeUseCase: noop,
    setTenantStatusUseCase: noop,
    simulateMessageUseCase,
    createTenantUseCase: noop,
    tenantRepository: noop,
    tenantServiceRepository: noop,
    botFlowRepository: noop,
    messagesRepository: noop,
    userRepository: noop,
    whatsappFlowRepository: noop,
    audit: { log: jest.fn() } as any,
    supabase: noop,
    logger,
  });

  const app: Express = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/admin', adminRouter);

  return { app, jwt, simulateMessageUseCase };
}

function cookieFor(jwt: JwtService, role: 'super_admin' | 'admin_operator', tenantId: string | null) {
  const { token } = jwt.sign({
    sub: 'admin-1',
    email: 'admin@x.test',
    role,
    tenantId,
  });
  return `${COOKIE}=${token}`;
}

describe('Aislamiento multi-tenant en POST /api/admin/simulate[/reset]', () => {
  it('admin_operator de tenant A no puede simular sobre tenant B (403)', async () => {
    const { app, jwt } = buildApp();
    const res = await request(app)
      .post('/api/admin/simulate')
      .set('Cookie', cookieFor(jwt, 'admin_operator', TENANT_A))
      .send({ tenantId: TENANT_B, phoneNumber: '521234567890', content: 'hola' });

    expect(res.status).toBe(403);
  });

  it('admin_operator de tenant A no puede resetear estado de tenant B (403)', async () => {
    const { app, jwt } = buildApp();
    const res = await request(app)
      .post('/api/admin/simulate/reset')
      .set('Cookie', cookieFor(jwt, 'admin_operator', TENANT_A))
      .send({ tenantId: TENANT_B, phoneNumber: '521234567890' });

    expect(res.status).toBe(403);
  });

  it('admin_operator SÍ puede simular sobre su propio tenant (200)', async () => {
    const { app, jwt, simulateMessageUseCase } = buildApp();
    const res = await request(app)
      .post('/api/admin/simulate')
      .set('Cookie', cookieFor(jwt, 'admin_operator', TENANT_A))
      .send({ tenantId: TENANT_A, phoneNumber: '521234567890', content: 'hola' });

    expect(res.status).toBe(200);
    expect(simulateMessageUseCase.execute).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_A }),
    );
  });

  it('super_admin puede simular sobre cualquier tenant (200)', async () => {
    const { app, jwt, simulateMessageUseCase } = buildApp();
    const res = await request(app)
      .post('/api/admin/simulate')
      .set('Cookie', cookieFor(jwt, 'super_admin', null))
      .send({ tenantId: TENANT_B, phoneNumber: '521234567890', content: 'hola' });

    expect(res.status).toBe(200);
    expect(simulateMessageUseCase.execute).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_B }),
    );
  });

  it('super_admin puede resetear cualquier tenant (200)', async () => {
    const { app, jwt, simulateMessageUseCase } = buildApp();
    const res = await request(app)
      .post('/api/admin/simulate/reset')
      .set('Cookie', cookieFor(jwt, 'super_admin', null))
      .send({ tenantId: TENANT_B, phoneNumber: '521234567890' });

    expect(res.status).toBe(200);
    expect(simulateMessageUseCase.reset).toHaveBeenCalledWith(TENANT_B, '521234567890');
  });
});
