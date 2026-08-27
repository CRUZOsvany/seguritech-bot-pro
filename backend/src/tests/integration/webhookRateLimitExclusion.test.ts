/**
 * D-04 (auditoría 2026-08-26): había DOS rate limiters montados en orden —
 * uno global (100 req/min, sin `skip`) y uno específico de /webhook
 * (1000 req/min, `skip` de todo lo que NO fuera /webhook). Como el global
 * corría primero y no excluía /webhook, el techo real del webhook de Meta
 * era 100/min, no los 1000/min que el segundo limitador sugería.
 *
 * Este test fija el comportamiento correcto: /webhook tolera más de 100
 * requests/min (gobernado solo por el limitador de 1000), mientras que una
 * ruta fuera de /webhook sigue topada en 100/min por el limitador global.
 */
import request from 'supertest';
import pino from 'pino';
import {
  ExpressServer,
  TenantStatusChecker,
} from '@/infrastructure/server/ExpressServer';

describe('Rate limit: /webhook excluido del limitador global (D-04)', () => {
  const logger = pino({ level: 'silent' });

  function buildApp(): ReturnType<ExpressServer['getExpressApp']> {
    const checker: TenantStatusChecker = async () => 'inactive'; // 200 rápido, sin wiring de Meta
    const server = new ExpressServer(logger, undefined, undefined, checker);
    server.setupRoutes(async () => 'ok');
    return server.getExpressApp();
  }

  it('/webhook no recibe 429 tras más de 100 requests en la misma ventana', async () => {
    const app = buildApp();

    const responses = await Promise.all(
      Array.from({ length: 105 }, () =>
        request(app)
          .post('/webhook')
          .send({ tenantId: 'tenant-rl-webhook', phoneNumber: '521234567890', message: 'hola' })
          .set('Content-Type', 'application/json'),
      ),
    );

    const rateLimited = responses.filter((r) => r.status === 429);
    expect(rateLimited).toHaveLength(0);
  });

  it('una ruta fuera de /webhook (ej. /health) sí sigue topada a 100/min por el limitador global', async () => {
    const app = buildApp();

    const responses = await Promise.all(
      Array.from({ length: 105 }, () => request(app).get('/health')),
    );

    const rateLimited = responses.filter((r) => r.status === 429);
    expect(rateLimited.length).toBeGreaterThan(0);
  });
});
