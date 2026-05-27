import { createRoute } from '@tanstack/react-router';
import { rootRoute } from './__root';

function ChangePasswordPage() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-[380px] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-base)] p-8 text-center">
        <h1 className="text-lg font-semibold mb-2">Cambio de contraseña</h1>
        <p className="text-xs text-[var(--color-text-muted)] mb-4">
          Esta pantalla se migra en el próximo prompt. Por ahora, usa el panel HTML:
        </p>
        <a
          href="/panel/change-password.html"
          className="inline-block text-xs text-[var(--color-primary)] hover:underline"
        >
          Ir al panel HTML →
        </a>
      </div>
    </div>
  );
}

export const changePasswordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/change-password',
  component: ChangePasswordPage,
});
