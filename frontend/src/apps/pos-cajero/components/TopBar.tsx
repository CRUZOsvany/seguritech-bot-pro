import { Cloud, CloudOff, LogOut, RefreshCw, Store, TriangleAlert } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { cn } from '@/lib/utils';
import type { CashierUser } from '../lib/api';
import type { LocalCashSession } from '../lib/db';
import { formatMoney } from '../lib/money';
import type { SyncStatus } from '../hooks/useSyncEngine';

interface TopBarProps {
  cashier: CashierUser;
  session: LocalCashSession | null | undefined;
  sync: SyncStatus;
  onCloseCash?: () => void;
  onLogout: () => void;
}

/** Identidad del cajero, estado de caja y estado de sincronización (diseño §3.2). */
export function TopBar({ cashier, session, sync, onCloseCash, onLogout }: TopBarProps) {
  return (
    <header className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b bg-background px-4 py-2">
      <div className="flex items-center gap-2">
        <Store className="size-5 text-muted-foreground" aria-hidden />
        <div className="leading-tight">
          <div className="font-medium">{cashier.displayName}</div>
          <div className="text-xs text-muted-foreground">
            {cashier.role === 'pos_manager' ? 'Encargado' : 'Cajero'}
          </div>
        </div>
      </div>

      <div className="text-sm">
        {session ? (
          <span className="inline-flex items-center gap-2">
            <span className="size-2 rounded-full bg-emerald-500" aria-hidden />
            Caja abierta · fondo {formatMoney(session.openingAmount)}
          </span>
        ) : (
          <span className="inline-flex items-center gap-2 text-muted-foreground">
            <span className="size-2 rounded-full bg-muted-foreground/50" aria-hidden />
            Caja cerrada
          </span>
        )}
      </div>

      <SyncIndicator sync={sync} />

      <div className="ml-auto flex items-center gap-2">
        {session && onCloseCash && (
          <Button variant="outline" size="lg" onClick={onCloseCash}>
            Cerrar caja
          </Button>
        )}
        <Button variant="ghost" size="lg" onClick={onLogout}>
          <LogOut aria-hidden />
          Salir
        </Button>
      </div>
    </header>
  );
}

function SyncIndicator({ sync }: { sync: SyncStatus }) {
  const pendingText =
    sync.pending === 1 ? '1 pendiente por sincronizar' : `${sync.pending} pendientes por sincronizar`;

  let icon = <Cloud className="size-4" aria-hidden />;
  let text = 'En línea · todo sincronizado';
  let tone = 'text-emerald-700';

  if (!sync.online || sync.state === 'offline') {
    icon = <CloudOff className="size-4" aria-hidden />;
    text = sync.pending > 0 ? `Sin conexión · ${pendingText}` : 'Sin conexión';
    tone = 'text-amber-700';
  } else if (sync.state === 'unauthorized') {
    icon = <TriangleAlert className="size-4" aria-hidden />;
    text = 'Sesión vencida · vuelve a entrar para sincronizar';
    tone = 'text-destructive';
  } else if (sync.state === 'retrying') {
    icon = <RefreshCw className="size-4" aria-hidden />;
    text = `Reintentando · ${pendingText}`;
    tone = 'text-amber-700';
  } else if (sync.pending > 0) {
    icon = <RefreshCw className="size-4" aria-hidden />;
    text = pendingText;
    tone = 'text-muted-foreground';
  }

  return (
    <div className={cn('inline-flex items-center gap-1.5 text-sm', tone)} role="status">
      {icon}
      {text}
    </div>
  );
}
