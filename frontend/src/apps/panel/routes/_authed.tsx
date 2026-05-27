import { createRoute } from '@tanstack/react-router';
import { rootRoute } from './__root';
import { AppShell } from '../components/app-shell';

/**
 * Layout route pathless.
 *
 * `id` sin `path` significa: este route NO agrega un segmento a la URL,
 * solo agrupa children bajo el mismo layout (AppShell). El children
 * sigue siendo /dashboard, /tenants/new, /tenants/$id, etc.
 *
 * Auth gating: por ahora dependemos del redirect 401 del apiFetch. Si
 * algún componente hace fetch a /api/* y la sesión está vencida, navega
 * a /app/login automáticamente. En el futuro podemos agregar beforeLoad
 * con un router context para evitar el flash.
 */
export const authedLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: '_authed',
  component: AppShell,
});
