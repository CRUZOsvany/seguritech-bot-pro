import { createRouter, createMemoryHistory, createBrowserHistory } from '@tanstack/react-router';
import { rootRoute } from './routes/__root';
import { indexRoute } from './routes/index';
import { loginRoute } from './routes/login';
import { changePasswordRoute } from './routes/change-password';
import { dashboardRoute } from './routes/dashboard';

const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  changePasswordRoute,
  dashboardRoute,
]);

/**
 * basepath: '/app' porque Express sirve el bundle estático en /app/index.html.
 * Todos los links internos del router son relativos a /app/.
 *
 * History: browserHistory en runtime (SPA real); memoryHistory si algún día
 * pre-renderizamos (no es el caso hoy, pero deja la puerta abierta).
 */
export const router = createRouter({
  routeTree,
  basepath: '/app',
  history:
    typeof window !== 'undefined' ? createBrowserHistory() : createMemoryHistory(),
  defaultPreload: 'intent',
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
