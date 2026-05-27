import { createRoute, redirect } from '@tanstack/react-router';
import { rootRoute } from './__root';

/**
 * `/` redirige a `/dashboard`. Si no hay sesión, el dashboard mismo
 * activa el redirect a login vía el fetch wrapper (401 → /app/login).
 */
export const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: '/dashboard' });
  },
});
