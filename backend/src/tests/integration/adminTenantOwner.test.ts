/**
 * PATCH /api/admin/tenants/:id con `owner` (Studio, paso 1): el WhatsApp del
 * dueño es el destino de las alertas de paso a humano. Antes no había forma
 * de editarlo desde el panel.
 */
import express from 'express';
import cookieParser from 'cookie-parser';
import pino from 'pino';
import request from 'supertest';
import { JwtService } from '@/infrastructure/auth/JwtService';
import { createAuthMiddleware } from '@/infrastructure/auth/AuthMiddleware';
import { createAdminRouter } from '@/infrastructure/server/AdminRouter';
import type { AdminSessionsRepository } from '@/domain/ports/AdminSessionsRepository';
import { OwnerDataIncompleteError, type TenantRepository } from '@/domain/ports/TenantRepository';

const SECRET = 'd'.repeat(64);
const COOKIE = 'admin_session_test';
const TENANT = '00000000-0000-0000-0000-0000000000aa';
const logger = pino({ level: 'silent' });

function buildApp(update: jest.Mock) {
  const jwt = new JwtService(SECRET, 3600);
  const requireAdmin = createAuthMiddleware({
    jwt,
    sessions: { isRevoked: jest.fn().mockResolvedValue(false), revoke: jest.fn() } as unknown as AdminSessionsRepository,
    cookieName: COOKIE,
    apiKey: '',
    cloudflareAllowedDomain: '',
    logger,
  });
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
    tenantRepository: { update } as unknown as TenantRepository,
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
    tenantConfigPort: { getConfig: jest.fn(), invalidate: jest.fn() },
    audit: audit as never,
    supabase: noop,
    logger,
  }));
  const { token } = jwt.sign({ sub: 'admin-1', email: 'a@x.test', role: 'super_admin', tenantId: null });
  return { app, audit, cookie: `${COOKIE}=${token}` };
}

describe('PATCH /tenants/:id — dueño del negocio', () => {
  it('guarda el WhatsApp del dueño solo con dígitos, y queda en la auditoría', async () => {
    const update = jest.fn().mockResolvedValue(undefined);
    const { app, audit, cookie } = buildApp(update);

    const res = await request(app)
      .patch(`/api/admin/tenants/${TENANT}`)
      .set('Cookie', cookie)
      .send({ owner: { nombre_dueno: ' Ana López ', whatsapp_dueno: '+52 1 747 123-4567' } });

    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith(TENANT, {
      owner: { nombre_dueno: 'Ana López', whatsapp_dueno: '5217471234567' },
    });
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'tenant.update', metadata: { keys: ['owner'] } }));
  });

  it('rechaza un WhatsApp con menos de 10 dígitos', async () => {
    const update = jest.fn();
    const { app, cookie } = buildApp(update);

    const res = await request(app)
      .patch(`/api/admin/tenants/${TENANT}`)
      .set('Cookie', cookie)
      .send({ owner: { whatsapp_dueno: '747-12' } });

    expect(res.status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });

  it('si el dueño no existía y falta un dato para crearlo, responde 400 con el motivo', async () => {
    const update = jest.fn().mockRejectedValue(new OwnerDataIncompleteError());
    const { app, cookie } = buildApp(update);

    const res = await request(app)
      .patch(`/api/admin/tenants/${TENANT}`)
      .set('Cookie', cookie)
      .send({ owner: { whatsapp_dueno: '7471234567' } });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/nombre y su WhatsApp/);
  });
});
