import express, { type Express, type Request, type Response } from 'express';
import path from 'path';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Monta la PWA del cajero (POS Lite, T-06) — build de Vite en public/caja/.
 *
 * Una URL por negocio: /caja/<tenantId>/. Cada negocio queda como su propia
 * app instalable porque el manifest se sirve bajo esa ruta con start_url y
 * scope relativos ("./"): el navegador los resuelve contra la URL del
 * manifest, así que la app instalada siempre abre en /caja/<tenantId>/.
 *
 *   /caja/assets/*, /caja/sw.js, /caja/icon-*.png  → estáticos del build
 *   /caja/<uuid>/manifest.webmanifest             → manifest del negocio
 *   /caja/<uuid>                                  → redirige a /caja/<uuid>/
 *   /caja/<uuid>/ y /caja/                        → index.html (la SPA decide)
 *
 * El manifest no consulta la BD a propósito: es una ruta pública y un UUID no
 * debe revelar el nombre del negocio a quien no tiene sesión.
 */
export function mountCajaApp(app: Express, cajaDir: string): void {
  const noCache = (res: Response): void => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  };
  const sendIndex = (_req: Request, res: Response): void => {
    noCache(res);
    res.sendFile(path.join(cajaDir, 'index.html'));
  };

  app.use('/caja', express.static(cajaDir, { index: false, redirect: false, setHeaders: noCache }));

  app.get('/caja/:tenantId/manifest.webmanifest', (req: Request, res: Response) => {
    if (!UUID_RE.test(String(req.params.tenantId))) {
      res.status(404).end();
      return;
    }
    noCache(res);
    res.type('application/manifest+json').send(JSON.stringify(cajaManifest()));
  });

  // Express 5 no es estricto con la barra final: '/caja' y '/caja/' caen en la
  // misma ruta, así que la redirección se decide mirando req.path. La barra
  // importa: sin ella, el manifest relativo se resolvería contra /caja/.
  app.get('/caja', (req: Request, res: Response) => {
    if (req.path.endsWith('/')) sendIndex(req, res);
    else res.redirect('/caja/');
  });

  app.get('/caja/:tenantId{/*splat}', (req: Request, res: Response) => {
    const tenantId = String(req.params.tenantId);
    if (!UUID_RE.test(tenantId)) {
      res.status(404).end();
      return;
    }
    if (!req.params.splat && !req.path.endsWith('/')) {
      const query = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
      res.redirect(`/caja/${tenantId}/${query}`);
      return;
    }
    sendIndex(req, res);
  });
}

export function cajaManifest(): Record<string, unknown> {
  return {
    id: './',
    name: 'Caja SegurITech',
    short_name: 'Caja',
    start_url: './',
    scope: './',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#171717',
    icons: [
      { src: '/caja/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/caja/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
