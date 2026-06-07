import { Link } from '@tanstack/react-router';
import { useMutation } from '@tanstack/react-query';
import { LogOut, Bot } from 'lucide-react';
import { useSession } from '@/shared/auth/useSession';
import { logout } from '@/shared/api/auth';
import { Button } from '@/shared/ui/button';
import { envBadge } from '@/shared/lib/env';

export function AppHeader() {
  const { data: session } = useSession();
  const env = envBadge();

  const logoutMutation = useMutation({
    mutationFn: logout,
    onSettled: () => {
      // Cookie invalidada server-side (o quedó stale).
      // Hard navigation a /app/login resetea el query cache.
      window.location.href = '/app/login';
    },
  });

  return (
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex h-14 max-w-[1100px] items-center justify-between px-6">
        <div className="flex items-center gap-6">
          <h1 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Bot className="h-4 w-4" aria-hidden />
            </span>
            SegurITech Bot Pro · Panel
          </h1>
          <span
            className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold tracking-wide ${env.className}`}
            title={`Entorno: ${env.label}`}
          >
            {env.label}
          </span>
          <nav className="flex items-center gap-1.5">
            <Link
              to="/dashboard"
              className="rounded-md px-3 py-1.5 text-xs text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground"
              activeProps={{ className: 'bg-accent text-foreground' }}
            >
              Clientes
            </Link>
            <Link
              to="/tenants/new"
              className="rounded-md px-3 py-1.5 text-xs text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground"
              activeProps={{ className: 'bg-accent text-foreground' }}
            >
              + Nuevo
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-3">
          {session && (
            <span className="text-xs text-muted-foreground">
              {session.email} · {session.role}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => logoutMutation.mutate()}
            disabled={logoutMutation.isPending}
          >
            <LogOut className="mr-1.5 h-3.5 w-3.5" />
            Salir
          </Button>
        </div>
      </div>
    </header>
  );
}
