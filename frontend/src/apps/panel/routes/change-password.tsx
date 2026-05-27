import { createLazyRoute } from '@tanstack/react-router';

function ChangePasswordPage() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-[380px] bg-card border border-border rounded-md p-8 text-center">
        <h1 className="text-lg font-semibold mb-2">Cambio de contraseña</h1>
        <p className="text-xs text-muted-foreground mb-4">
          Esta pantalla se migra en un prompt futuro. Por ahora, usa el panel HTML:
        </p>
        <a
          href="/panel/change-password.html"
          className="inline-block text-xs text-primary hover:underline"
        >
          Ir al panel HTML →
        </a>
      </div>
    </div>
  );
}

export const Route = createLazyRoute('/change-password')({
  component: ChangePasswordPage,
});
