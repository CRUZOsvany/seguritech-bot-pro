/**
 * Regresión de seguridad — F2 (auditoría 2026-08-20):
 * El "Caso B" del webhook ({tenantId, phoneNumber, message} plano, sin `entry`
 * de Meta) NUNCA pasaba por verifyMetaSignature — cualquiera con un tenantId
 * válido podía inyectar mensajes en producción sin ninguna verificación.
 * Ahora esa rama solo se acepta cuando config.isProduction === false.
 *
 * NODE_ENV se fija a 'production' ANTES de requerir el módulo (con
 * jest.resetModules + require dinámico) porque `config.isProduction` se
 * calcula una sola vez al importar `@/config/env`.
 */
import request from 'supertest';
import pino from 'pino';

describe('Webhook Caso B (payload simple) — bloqueado en producción', () => {
  const logger = pino({ level: 'silent' });
  const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = ORIGINAL_NODE_ENV;
    jest.resetModules();
  });

  function buildProdApp() {
    process.env.NODE_ENV = 'production';
    jest.resetModules();

    const { ExpressServer } = require('@/infrastructure/server/ExpressServer');
    const server = new ExpressServer(logger);
    const processMessage = jest.fn().mockResolvedValue('ok');
    server.setupRoutes(processMessage);
    return { app: server.getExpressApp(), processMessage };
  }

  it('POST /webhook/:tenantId sin firma responde 404 en producción (no procesa el mensaje)', async () => {
    const { app, processMessage } = buildProdApp();

    const res = await request(app)
      .post('/webhook/00000000-0000-0000-0000-000000000001')
      .send({ phoneNumber: '521234567890', message: 'hola' })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(404);
    expect(processMessage).not.toHaveBeenCalled();
  });

  it('POST /webhook sin firma responde 404 en producción (no procesa el mensaje)', async () => {
    const { app, processMessage } = buildProdApp();

    const res = await request(app)
      .post('/webhook')
      .send({
        tenantId: '00000000-0000-0000-0000-000000000001',
        phoneNumber: '521234567890',
        message: 'hola',
      })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(404);
    expect(processMessage).not.toHaveBeenCalled();
  });

  it('sigue aceptando el Caso B fuera de producción (comportamiento previo intacto)', async () => {
    // No tocamos NODE_ENV aquí: usamos el módulo tal cual lo carga Jest (test).
    jest.resetModules();

    const { ExpressServer } = require('@/infrastructure/server/ExpressServer');
    const server = new ExpressServer(logger);
    const processMessage = jest.fn().mockResolvedValue('ok');
    server.setupRoutes(processMessage);

    const res = await request(server.getExpressApp())
      .post('/webhook/00000000-0000-0000-0000-000000000001')
      .send({ phoneNumber: '521234567890', message: 'hola' })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(200);
    expect(processMessage).toHaveBeenCalledWith(
      '00000000-0000-0000-0000-000000000001',
      '521234567890',
      'hola',
    );
  });
});
