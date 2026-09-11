/**
 * Rutas de la PWA del cajero (POS Lite, T-06): una URL por negocio
 * (/caja/<tenantId>/), manifest por negocio y SPA fallback.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import express from 'express';
import request from 'supertest';
import { mountCajaApp } from '@/infrastructure/server/cajaStatic';

const TENANT = '00000000-0000-0000-0000-0000000000aa';
let dir: string;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'caja-'));
  fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>caja</title>');
  fs.writeFileSync(path.join(dir, 'sw.js'), 'self.addEventListener("fetch", () => {});');
  fs.mkdirSync(path.join(dir, 'assets'));
  fs.writeFileSync(path.join(dir, 'assets', 'index-abc.js'), 'console.log(1)');
});

afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function buildApp() {
  const app = express();
  mountCajaApp(app, dir);
  return app;
}

describe('mountCajaApp', () => {
  it('sirve los estáticos del build (assets y service worker) sin caché', async () => {
    const app = buildApp();
    const asset = await request(app).get('/caja/assets/index-abc.js');
    const sw = await request(app).get('/caja/sw.js');

    expect(asset.status).toBe(200);
    expect(sw.status).toBe(200);
    expect(sw.headers['cache-control']).toContain('no-cache');
  });

  it('/caja/<uuid>/ y cualquier subruta devuelven la SPA', async () => {
    const app = buildApp();
    for (const url of [`/caja/${TENANT}/`, `/caja/${TENANT}/cerrar`]) {
      const res = await request(app).get(url);
      expect(res.status).toBe(200);
      expect(res.text).toContain('<title>caja</title>');
    }
  });

  it('/caja/<uuid> sin barra redirige a la versión con barra, conservando el query', async () => {
    const app = buildApp();
    const res = await request(app).get(`/caja/${TENANT}?x=1`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`/caja/${TENANT}/?x=1`);
  });

  it('/caja redirige a /caja/, que sirve la SPA', async () => {
    const app = buildApp();
    const bare = await request(app).get('/caja');
    const slash = await request(app).get('/caja/');

    expect(bare.status).toBe(302);
    expect(bare.headers.location).toBe('/caja/');
    expect(slash.status).toBe(200);
  });

  it('un segmento que no es UUID da 404, no la SPA', async () => {
    const app = buildApp();
    for (const url of ['/caja/no-es-uuid/', '/caja/no-es-uuid', '/caja/no-es-uuid/manifest.webmanifest']) {
      const res = await request(app).get(url);
      expect(res.status).toBe(404);
    }
  });

  it('el manifest del negocio usa start_url y scope relativos a /caja/<uuid>/', async () => {
    const app = buildApp();
    const res = await request(app).get(`/caja/${TENANT}/manifest.webmanifest`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/manifest+json');
    const manifest = JSON.parse(res.text);
    expect(manifest).toMatchObject({ id: './', start_url: './', scope: './', display: 'standalone' });
    expect(manifest.icons.map((i: { sizes: string }) => i.sizes)).toEqual(['192x192', '512x512']);
    // No revela nada del negocio: el nombre es genérico.
    expect(manifest.name).toBe('Caja SegurITech');
  });
});
