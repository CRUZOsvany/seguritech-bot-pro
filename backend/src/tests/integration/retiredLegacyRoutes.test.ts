/**
 * /panel (panel HTML) y /simulator (simulador suelto) se retiraron el
 * 2026-09-11. Sus rutas redirigen al panel React para no romper marcadores,
 * ni el enlace al cambio de contraseña del primer login que pudiera quedar en
 * una pestaña abierta.
 */
import request from 'supertest';
import pino from 'pino';
import { ExpressServer } from '@/infrastructure/server/ExpressServer';

const TENANT = '11111111-2222-3333-4444-555555555555';

describe('Rutas retiradas: /panel y /simulator', () => {
  const server = new ExpressServer(pino({ level: 'silent' }));
  server.setupStaticAssets();
  const app = server.getExpressApp();

  it.each([
    '/panel',
    '/panel/',
    '/panel/index.html',
    '/panel/login.html',
    '/panel/tenant.html?id=abc',
    '/panel/_api.js',
    '/simulator',
    '/simulator/',
    '/simulator/index.html',
  ])('%s → 302 a /app/, sin servir el archivo viejo', async (url) => {
    const res = await request(app).get(url);

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/app/');
  });

  it('/simulator/<uuid> conserva el tenant en ?tenantId=, como antes', async () => {
    const res = await request(app).get(`/simulator/${TENANT}`);

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`/app/?tenantId=${TENANT}`);
  });

  it('/simulator/index.html?tenantId=<uuid> también', async () => {
    const res = await request(app).get(`/simulator/index.html?tenantId=${TENANT}`);

    expect(res.headers.location).toBe(`/app/?tenantId=${TENANT}`);
  });

  it('el tenant viaja codificado: no puede sacar el redirect de /app/', async () => {
    const res = await request(app).get('/simulator/a%2F%2Fevil.example');

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/app/?tenantId=a%2F%2Fevil.example');
  });

  it('el cambio de contraseña viejo lleva al de React, con el correo', async () => {
    const res = await request(app).get('/panel/change-password.html?email=ovy%40seguritech.mx');

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/app/change-password?email=ovy%40seguritech.mx');
  });

  it('sin correo, al cambio de contraseña a secas', async () => {
    const res = await request(app).get('/panel/change-password.html');

    expect(res.headers.location).toBe('/app/change-password');
  });
});
