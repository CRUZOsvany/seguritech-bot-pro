import { Outlet } from '@tanstack/react-router';
import { AppHeader } from './app-header';

/**
 * Layout principal del panel autenticado.
 * Se usa como `component` del layout route pathless `_authed`.
 *
 * Todas las pantallas autenticadas (dashboard, tenants/new, tenants/$id,
 * messages, etc.) renderizan dentro del <Outlet />.
 */
export function AppShell() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <AppHeader />
      <main className="mx-auto w-full max-w-[1100px] flex-1 px-6 py-6">
        <Outlet />
      </main>
    </div>
  );
}
