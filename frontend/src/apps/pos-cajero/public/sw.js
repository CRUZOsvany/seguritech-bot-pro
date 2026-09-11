/*
 * Service worker de la caja (POS Lite). Solo guarda el "cascarón" de la app
 * — HTML, JS, CSS e íconos — para que abra sin internet. Los datos (ventas,
 * cola, catálogo) viven en IndexedDB y la API (/api/*) NUNCA pasa por aquí.
 *
 * El HTML es el mismo para todos los negocios (/caja/<tenantId>/ lo resuelve
 * la app leyendo la URL), así que se guarda una sola copia.
 *
 * Los assets de Vite llevan hash en el nombre: cada vez que llega un HTML
 * nuevo se guardan los assets que referencia y se borran los viejos.
 */
const CACHE = 'caja-shell-v1';
const SHELL = '/caja/__shell__';
const ICONS = ['/caja/icon-192.png', '/caja/icon-512.png'];

async function cacheShell(response) {
  const cache = await caches.open(CACHE);
  const html = await response.clone().text();
  const assets = Array.from(html.matchAll(/(?:src|href)="(\/caja\/assets\/[^"]+)"/g), (m) => m[1]);
  if (assets.length === 0) return; // no parece el index de la caja: no pisar el bueno
  await cache.put(SHELL, response);
  await Promise.all(
    assets.map(async (url) => {
      if (!(await cache.match(url))) await cache.add(url);
    }),
  );
  const keep = new Set(assets.map((a) => new URL(a, self.location.origin).href));
  for (const request of await cache.keys()) {
    if (new URL(request.url).pathname.startsWith('/caja/assets/') && !keep.has(request.url)) {
      await cache.delete(request);
    }
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(ICONS).catch(() => undefined);
      try {
        const res = await fetch('/caja/', { cache: 'no-store' });
        if (res.ok) await cacheShell(res);
      } catch {
        /* sin red al instalar: se guarda en la próxima navegación */
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key !== CACHE) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith('/caja/')) return;
  if (url.pathname.endsWith('/manifest.webmanifest') || url.pathname === '/caja/sw.js') return;

  // Navegación: red primero (para recibir versiones nuevas); sin red, la copia.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(request);
          if (res.ok) event.waitUntil(cacheShell(res.clone()));
          return res;
        } catch {
          return (await caches.match(SHELL)) ?? Response.error();
        }
      })(),
    );
    return;
  }

  // Assets e íconos: caché primero (llevan hash, no cambian).
  event.respondWith(
    (async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      const res = await fetch(request);
      if (res.ok && url.pathname.startsWith('/caja/assets/')) {
        const cache = await caches.open(CACHE);
        await cache.put(request, res.clone());
      }
      return res;
    })(),
  );
});
