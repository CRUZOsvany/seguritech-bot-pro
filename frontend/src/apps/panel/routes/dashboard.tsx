import { createRoute } from '@tanstack/react-router';
import { rootRoute } from './__root';
import { useSession } from '@/shared/auth/useSession';
import { logout } from '@/shared/api/auth';

function DashboardPage() {
  const { data, isLoading } = useSession();

  async function handleLogout() {
    try {
      await logout();
    } catch {
      /* la cookie ya quedó limpia; igual seguimos */
    }
    window.location.href = '/app/login';
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen text-xs text-[var(--color-text-muted)]">
        Cargando sesión…
      </div>
    );
  }

  return (
    <div className="max-w-[1100px] mx-auto px-6 py-6">
      <header className="flex items-center justify-between mb-6 pb-4 border-b border-[var(--color-border)]">
        <div>
          <h1 className="text-base font-semibold">SegurITech Bot Pro · Panel</h1>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">
            {data?.email} ({data?.role})
          </p>
        </div>
        <button
          onClick={handleLogout}
          className="px-3 py-1.5 text-xs border border-[var(--color-border)] rounded-[var(--radius-base)] hover:bg-[var(--color-code-bg)]"
        >
          Salir
        </button>
      </header>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-base)] p-6">
        <h2 className="text-lg font-semibold mb-2">Dashboard (placeholder)</h2>
        <p className="text-xs text-[var(--color-text-muted)] mb-4">
          La lista de tenants se migra en el siguiente prompt. Mientras tanto:
        </p>
        <a
          href="/panel/index.html"
          className="inline-block text-xs text-[var(--color-primary)] hover:underline"
        >
          Ir al panel HTML legacy →
        </a>
      </div>
    </div>
  );
}

export const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/dashboard',
  component: DashboardPage,
});
