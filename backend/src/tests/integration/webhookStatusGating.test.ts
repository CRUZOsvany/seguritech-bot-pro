/**
 * Sprint 5.5 — Webhook debe rechazar mensajes para tenants paused/archived/draft.
 *
 * Cubre los dos casos del gate `rejectIfTenantInactive` aplicado al handler
 * `POST /webhook/:tenantId`. No requiere wiring de Meta adapter ni HMAC porque
 * usa la rama de "payload simple" del handler (`{tenantId, phoneNumber, message}`),
 * que pasa por el mismo gate antes de invocar processMessage.
 */
import request from 'supertest';
import pino from 'pino';
import {
  ExpressServer,
  TenantStatusChecker,
} from '@/infrastructure/server/ExpressServer';

describe('Webhook status gating (Sprint 5.5)', () => {
  const logger = pino({ level: 'silent' });

  function buildApp(status: 'active' | 'inactive' | 'not_found'): {
    app: ReturnType<ExpressServer['getExpressApp']>;
    processMessage: jest.Mock;
    statusChecker: jest.Mock;
  } {
    const statusChecker: jest.Mock = jest.fn().mockResolvedValue(status);
    const checker: TenantStatusChecker = (tenantId) => statusChecker(tenantId);
    const server = new ExpressServer(logger, undefined, undefined, checker);
    const processMessage = jest.fn().mockResolvedValue('ok');
    server.setupRoutes(processMessage);
    return { app: server.getExpressApp(), processMessage, statusChecker };
  }

  it('returns 200 + skipped:tenant_inactive when tenant is paused/archived/draft', async () => {
    const { app, processMessage, statusChecker } = buildApp('inactive');

    const res = await request(app)
      .post('/webhook/tenant-paused-123')
      .send({ phoneNumber: '521234567890', message: 'hola' })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(200);
    expect(res.body.skipped).toBe('tenant_inactive');
    expect(statusChecker).toHaveBeenCalledWith('tenant-paused-123');
    expect(processMessage).not.toHaveBeenCalled();
  });

  it('returns 200 + skipped:tenant_not_found when tenant does not exist', async () => {
    const { app, processMessage, statusChecker } = buildApp('not_found');

    const res = await request(app)
      .post('/webhook/tenant-ghost-456')
      .send({ phoneNumber: '521234567890', message: 'hola' })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(200);
    expect(res.body.skipped).toBe('tenant_not_found');
    expect(statusChecker).toHaveBeenCalledWith('tenant-ghost-456');
    expect(processMessage).not.toHaveBeenCalled();
  });

  it('gatea también la rama de payload simple de POST /webhook (sin tenant en path)', async () => {
    const { app, processMessage, statusChecker } = buildApp('inactive');

    const res = await request(app)
      .post('/webhook')
      .send({ tenantId: 'tenant-paused-789', phoneNumber: '521234567890', message: 'hola' })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(200);
    expect(res.body.skipped).toBe('tenant_inactive');
    expect(statusChecker).toHaveBeenCalledWith('tenant-paused-789');
    expect(processMessage).not.toHaveBeenCalled();
  });

  // El happy-path "active" requiere wiring completo de Meta adapter / messageLogService;
  // queda cubierto por los demás tests de integración existentes.
});
