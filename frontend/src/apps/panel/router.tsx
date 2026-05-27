import {
  createRoute,
  createRouter,
  createMemoryHistory,
  createBrowserHistory,
} from '@tanstack/react-router';
import { rootRoute } from './routes/__root';
import { indexRoute } from './routes/index';
import { authedLayoutRoute } from './routes/_authed';
import { dashboardRoute } from './routes/dashboard';
import { RoutePending } from './components/route-pending';

/**
 * Rutas LAZY — se cargan en chunks separados al primer hit.
 *
 * Patrón:
 *   - Definición eager aquí: path, getParentRoute, validateSearch
 *   - Componente real en routes/X.tsx exportado como `Route`
 *   - `.lazy()` resuelve el componente del chunk dinámico
 *
 * Lo que NO se splitea:
 *   - __root, _authed (AppShell), index (redirect), dashboard (landing post-auth)
 *
 * El `import()` de Vite genera automáticamente un chunk por archivo.
 */

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  validateSearch: (
    search: Record<string, unknown>,
  ): { next?: string } => ({
    next: typeof search.next === 'string' ? search.next : undefined,
  }),
}).lazy(() => import('./routes/login').then((d) => d.Route));

const changePasswordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/change-password',
}).lazy(() =>
  import('./routes/change-password').then((d) => d.Route),
);

const tenantsNewRoute = createRoute({
  getParentRoute: () => authedLayoutRoute,
  path: '/tenants/new',
}).lazy(() =>
  import('./routes/tenants.new').then((d) => d.Route),
);

const tenantDetailRoute = createRoute({
  getParentRoute: () => authedLayoutRoute,
  path: '/tenants/$id',
}).lazy(() =>
  import('./routes/tenants.$id').then((d) => d.Route),
);

/**
 * Árbol de rutas final.
 */
const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  changePasswordRoute,
  authedLayoutRoute.addChildren([
    dashboardRoute,
    tenantsNewRoute,
    tenantDetailRoute,
  ]),
]);

export const router = createRouter({
  routeTree,
  basepath: '/app',
  history:
    typeof window !== 'undefined' ? createBrowserHistory() : createMemoryHistory(),
  defaultPreload: 'intent',
  defaultPendingComponent: RoutePending,
  defaultPendingMs: 100,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
