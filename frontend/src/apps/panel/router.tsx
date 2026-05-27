import {
  createRouter,
  createMemoryHistory,
  createBrowserHistory,
} from '@tanstack/react-router';
import { rootRoute } from './routes/__root';
import { indexRoute } from './routes/index';
import { loginRoute } from './routes/login';
import { changePasswordRoute } from './routes/change-password';
import { authedLayoutRoute } from './routes/_authed';
import { dashboardRoute } from './routes/dashboard';
import { tenantsNewRoute } from './routes/tenants.new';
import { tenantDetailRoute } from './routes/tenants.$id';

/**
 * Árbol de rutas:
 *
 *   __root
 *     ├── /                      (redirect → /dashboard)
 *     ├── /login                 (sin shell)
 *     ├── /change-password       (sin shell)
 *     └── _authed (layout)
 *           ├── /dashboard
 *           ├── /tenants/new
 *           └── /tenants/$id
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
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
