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

  it('/simulator/<uuid> va al Studio de ese cliente, donde vive el simulador', async () => {
    const res = await request(app).get(`/simulator/${TENANT}`);

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`/app/tenants/${TENANT}/studio`);
  });

  it('/simulator/index.html?tenantId=<uuid> también', async () => {
    const res = await request(app).get(`/simulator/index.html?tenantId=${TENANT}`);

    expect(res.headers.location).toBe(`/app/tenants/${TENANT}/studio`);
  });

  it.each([
    ['barras codificadas', '/simulator/a%2F%2Fevil.example', '/app/tenants/a%2F%2Fevil.example/studio'],
    ['un tenant ".."', '/simulator/..%2F..%2F..', '/app/tenants/..%2F..%2F../studio'],
  ])('%s: el tenant viaja codificado y el redirect no sale de /app/', async (_caso, url, location) => {
    const res = await request(app).get(url);

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(location);
    expect(new URL(res.headers.location, 'https://panel.example').pathname.startsWith('/app/')).toBe(true);
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
