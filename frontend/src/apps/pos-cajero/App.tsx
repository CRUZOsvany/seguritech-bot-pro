import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Button } from '@/shared/ui/button';
import { TopBar } from './components/TopBar';
import { Notice } from './components/Notice';
import { useSyncEngine } from './hooks/useSyncEngine';
import { posApi, type CashierUser } from './lib/api';
import { clearCashier, loadCashier, saveCashier } from './lib/cashier';
import { findOpenSession, openCajaDb, type CajaDb, type LocalCashSession } from './lib/db';
import { lastTenant, rememberTenant, tenantIdFromPath } from './lib/tenant';
import { LoginScreen } from './screens/LoginScreen';
import { OpenCashScreen } from './screens/OpenCashScreen';
import { SaleScreen } from './screens/SaleScreen';
import { CloseCashScreen } from './screens/CloseCashScreen';
import { CloseResultScreen } from './screens/CloseResultScreen';

/**
 * PWA del cajero (POS Lite, T-06). Pantallas: login → abrir caja → venta ↔
 * cerrar caja. Sin router: el estado de la caja decide qué se ve.
 */
export function App() {
  const tenantId = useMemo(() => tenantIdFromPath(window.location.pathname), []);
  if (!tenantId) return <NoTenantScreen />;
  return <CajaApp tenantId={tenantId} />;
}

function NoTenantScreen() {
  const last = lastTenant();
  useEffect(() => {
    if (last) window.location.replace(`/caja/${last}/`);
  }, [last]);
  if (last) return null;
  return (
    <main className="flex min-h-screen items-center justify-center p-6 text-center">
      <div className="max-w-sm">
        <h1 className="text-lg font-medium">Esta caja no sabe de qué negocio es</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Abre el enlace de la caja de tu negocio. El operador lo encuentra en el panel, en la sección
          Punto de venta del negocio.
        </p>
      </div>
    </main>
  );
}

function CajaApp({ tenantId }: { tenantId: string }) {
  const db = useMemo(() => openCajaDb(tenantId), [tenantId]);
  const [cashier, setCashier] = useState<CashierUser | null>(() => loadCashier(tenantId));
  const sync = useSyncEngine(db, cashier);

  useEffect(() => rememberTenant(tenantId), [tenantId]);

  function login(user: CashierUser) {
    saveCashier(user);
    setCashier(user);
  }

  async function logout() {
    if (
      sync.pending > 0 &&
      !window.confirm(
        `Tienes ${sync.pending} operaciones sin sincronizar. Se quedan guardadas en esta laptop y se envían cuando vuelvas a entrar. ¿Salir?`,
      )
    ) {
      return;
    }
    await posApi.logout().catch(() => undefined);
    clearCashier(tenantId);
    setCashier(null);
  }

  /** Cookie vencida: se pide volver a entrar sin tocar la cola local. */
  function relogin() {
    clearCashier(tenantId);
    setCashier(null);
  }

  if (!cashier) return <LoginScreen tenantId={tenantId} db={db} onLogin={login} />;

  return (
    <Workspace
      key={cashier.id}
      db={db}
      cashier={cashier}
      sync={sync}
      onLogout={() => void logout()}
      onRelogin={relogin}
    />
  );
}

interface WorkspaceProps {
  db: CajaDb;
  cashier: CashierUser;
  sync: ReturnType<typeof useSyncEngine>;
  onLogout: () => void;
  onRelogin: () => void;
}

function Workspace({ db, cashier, sync, onLogout, onRelogin }: WorkspaceProps) {
  // undefined = cargando; null = no hay caja abierta.
  const session = useLiveQuery(
    async () => (await findOpenSession(db, cashier.id)) ?? null,
    [db, cashier.id],
  );
  const [view, setView] = useState<'sale' | 'close'>('sale');
  const [closed, setClosed] = useState<LocalCashSession | null>(null);

  let content;
  if (closed) {
    content = (
      <CloseResultScreen
        db={db}
        closed={closed}
        onDone={() => {
          setClosed(null);
          setView('sale');
        }}
      />
    );
  } else if (session === undefined) {
    content = null;
  } else if (session === null) {
    content = <OpenCashScreen db={db} cashierId={cashier.id} onOpened={sync.kick} />;
  } else if (view === 'close') {
    content = (
      <CloseCashScreen
        db={db}
        session={session}
        sync={sync}
        onCancel={() => setView('sale')}
        onClosed={(s) => {
          setClosed(s);
          sync.kick();
        }}
      />
    );
  } else {
    content = <SaleScreen db={db} cashierId={cashier.id} session={session} onSaved={sync.kick} />;
  }

  return (
    <div className="flex h-screen flex-col bg-muted/40">
      <TopBar
        cashier={cashier}
        session={session}
        sync={sync}
        onCloseCash={view === 'sale' && !closed ? () => setView('close') : undefined}
        onLogout={onLogout}
      />
      {sync.state === 'unauthorized' && (
        <div className="px-4 pt-3">
          <Notice tone="error">
            Tu sesión venció y las ventas nuevas no se están enviando (siguen guardadas en esta laptop).{' '}
            <Button variant="link" className="h-auto p-0 text-inherit underline" onClick={onRelogin}>
              Vuelve a entrar
            </Button>
          </Notice>
        </div>
      )}
      <main className="flex min-h-0 flex-1 flex-col">{content}</main>
    </div>
  );
}
