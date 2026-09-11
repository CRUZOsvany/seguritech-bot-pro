/**
 * Motor de sincronización de la caja: corre la cola al montar, al volver la
 * red, cada 20 s y cada vez que el cajero hace algo (kick). Nunca corre dos
 * veces a la vez: si llega un kick mientras sincroniza, repite al terminar.
 *
 * Con la cola vacía aprovecha para adoptar una caja abierta en otro equipo y
 * refrescar el catálogo (cada 5 min, o de inmediato si subieron ventas y el
 * stock cambió).
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { pendingOps, type CajaDb } from '../lib/db';
import { posApi, PosApiError, type CashierUser } from '../lib/api';
import { reconcileOpenSession, syncOutbox, type SyncState } from '../lib/sync';
import { refreshCatalog } from '../lib/catalog';

const INTERVAL_MS = 20_000;
const CATALOG_MAX_AGE_MS = 5 * 60_000;

export interface SyncStatus {
  online: boolean;
  state: SyncState | 'idle';
  /** Operaciones de este cajero que aún no llegan al servidor. */
  pending: number;
  lastSyncAt: Date | null;
  kick: () => void;
}

function subscribeOnline(callback: () => void): () => void {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}

/** navigator.onLine: "false" es fiable; "true" solo dice que hay red local. */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
}

/** Si hay varias pestañas de la caja abiertas, solo una sincroniza a la vez. */
async function withLock<T>(fn: () => Promise<T>): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.locks) {
    return navigator.locks.request('caja-sync', fn);
  }
  return fn();
}

async function maybeRefreshCatalog(db: CajaDb, force: boolean): Promise<void> {
  const meta = await db.meta.get('catalogRefreshedAt');
  const age = meta ? Date.now() - Date.parse(meta.value) : Number.POSITIVE_INFINITY;
  if (!force && age < CATALOG_MAX_AGE_MS) return;
  await refreshCatalog(db, posApi.products);
}

export function useSyncEngine(db: CajaDb, cashier: CashierUser | null): SyncStatus {
  const online = useOnline();
  const [state, setState] = useState<SyncState | 'idle'>('idle');
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
  const running = useRef(false);
  const again = useRef(false);
  const cashierId = cashier?.id ?? null;

  const pending = useLiveQuery(
    async () => (cashierId ? (await pendingOps(db, cashierId)).length : 0),
    [db, cashierId],
    0,
  );

  const run = useCallback(async () => {
    if (!cashierId) return;
    if (running.current) {
      again.current = true;
      return;
    }
    running.current = true;
    try {
      do {
        again.current = false;
        const result = await withLock(() => syncOutbox(db, posApi, cashierId));
        setState(result.state);
        if (result.state !== 'synced') break;
        setLastSyncAt(new Date());
        try {
          await reconcileOpenSession(db, posApi, cashierId);
          await maybeRefreshCatalog(db, result.sent > 0);
        } catch (err) {
          // Sin red o 5xx aquí no importa: se intenta en la próxima vuelta.
          if (err instanceof PosApiError && err.status === 401) setState('unauthorized');
        }
      } while (again.current);
    } finally {
      running.current = false;
    }
  }, [db, cashierId]);

  useEffect(() => {
    if (!cashierId) return;
    const tick = () => void run();
    const first = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, INTERVAL_MS);
    window.addEventListener('online', tick);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
      window.removeEventListener('online', tick);
    };
  }, [cashierId, run]);

  const kick = useCallback(() => void run(), [run]);

  return { online, state, pending, lastSyncAt, kick };
}
