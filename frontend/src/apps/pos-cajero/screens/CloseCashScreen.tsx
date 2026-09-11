import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Lock } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Label } from '@/shared/ui/label';
import { cn } from '@/lib/utils';
import { MoneyInput } from '../components/MoneyInput';
import { Notice } from '../components/Notice';
import { closeCashLocal, expectedCash, localSummary } from '../lib/actions';
import { posApi, type CashSummary } from '../lib/api';
import type { CajaDb, LocalCashSession, LocalSale } from '../lib/db';
import { formatMoney, parseMoney, roundMoney } from '../lib/money';
import type { SyncStatus } from '../hooks/useSyncEngine';

const METHOD_LABEL: Record<string, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  transfer: 'Transferencia',
  mixed: 'Mixto',
};

interface CloseCashScreenProps {
  db: CajaDb;
  session: LocalCashSession;
  sync: SyncStatus;
  onCancel: () => void;
  onClosed: (session: LocalCashSession) => void;
}

/**
 * Cerrar caja (diseño §3.3): resumen antes de confirmar + arqueo.
 *
 * Con internet y todo sincronizado, el resumen es el del servidor (incluye
 * ventas de esta caja hechas en otro equipo). Sin internet se calcula con las
 * ventas de esta laptop y se dice así. El cierre se guarda local y se
 * sincroniza después, como todo lo demás.
 */
export function CloseCashScreen({ db, session, sync, onCancel, onClosed }: CloseCashScreenProps) {
  const local = useLiveQuery(() => localSummary(db, session.clientId), [db, session.clientId]);
  const sales = useLiveQuery(
    async () => (await db.sales.where('sessionClientId').equals(session.clientId).sortBy('createdAt')).reverse(),
    [db, session.clientId],
    [] as LocalSale[],
  );
  const [serverSummary, setServerSummary] = useState<CashSummary | null>(null);
  const [counted, setCounted] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canAskServer = sync.online && !!session.serverId && sync.pending === 0;
  useEffect(() => {
    if (!canAskServer || !session.serverId) return;
    let cancelled = false;
    posApi
      .summary(session.serverId)
      .then(({ summary }) => {
        if (!cancelled) setServerSummary(summary);
      })
      .catch(() => {
        /* sin respuesta: se queda el resumen local */
      });
    return () => {
      cancelled = true;
    };
  }, [canAskServer, session.serverId]);

  const summary = (canAskServer && serverSummary) || local;
  if (!summary) return null;

  const fromServer = summary === serverSummary;
  const expected = expectedCash(session.openingAmount, summary.byPaymentMethod);
  const countedAmount = parseMoney(counted);
  const difference = countedAmount === null ? null : roundMoney(countedAmount - expected);

  async function confirm() {
    if (countedAmount === null) {
      setError('Escribe el efectivo que contaste en el cajón.');
      return;
    }
    if (!window.confirm(`¿Cerrar la caja con ${formatMoney(countedAmount)} contados?`)) return;
    setBusy(true);
    setError(null);
    try {
      const closed = await closeCashLocal(db, { session, closingAmount: countedAmount });
      onClosed(closed);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 lg:grid-cols-2">
      <section className="flex flex-col gap-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
        <h2 className="flex items-center gap-2 text-lg font-medium">
          <Lock className="size-5" aria-hidden />
          Cerrar caja
        </h2>

        <div>
          <div className="text-xs text-muted-foreground">
            {fromServer
              ? 'Resumen del servidor'
              : 'Resumen de esta laptop · se confirma con el servidor al sincronizar'}
          </div>
          <dl className="mt-2 grid grid-cols-2 gap-3">
            <Stat label="Total vendido" value={formatMoney(summary.totalSales)} strong />
            <Stat label="Ventas" value={String(summary.saleCount)} strong />
            {Object.entries(summary.byPaymentMethod).map(([method, total]) => (
              <Stat key={method} label={METHOD_LABEL[method] ?? method} value={formatMoney(total)} />
            ))}
          </dl>
        </div>

        {local && local.pendingCount > 0 && (
          <Notice tone="warn">
            {local.pendingCount} ventas aún no llegan al servidor. Puedes cerrar igual: se envían antes que el cierre.
          </Notice>
        )}
        {local && local.rejectedCount > 0 && (
          <Notice tone="error">
            {local.rejectedCount} ventas fueron rechazadas por el servidor y no cuentan en el resumen. Revisa la lista.
          </Notice>
        )}

        <dl className="flex flex-col gap-1 border-t pt-3 text-sm">
          <Line label="Fondo inicial" value={formatMoney(session.openingAmount)} />
          <Line label="Ventas en efectivo" value={formatMoney(summary.byPaymentMethod.cash ?? 0)} />
          <Line label="Efectivo esperado en el cajón" value={formatMoney(expected)} strong />
        </dl>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="counted">Efectivo contado</Label>
          <MoneyInput
            id="counted"
            autoFocus
            placeholder="0.00"
            value={counted}
            onChange={(e) => setCounted(e.target.value)}
          />
          {difference !== null && <DifferenceText difference={difference} />}
        </div>

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <Button variant="outline" size="lg" className="h-11 flex-1" onClick={onCancel}>
            Volver a vender
          </Button>
          <Button size="lg" className="h-11 flex-1" disabled={busy} onClick={() => void confirm()}>
            Cerrar caja
          </Button>
        </div>
      </section>

      <section className="flex min-h-0 flex-col gap-2 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
        <h2 className="font-medium">Ventas de esta caja en esta laptop</h2>
        {sales.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Sin ventas.</p>
        ) : (
          <ul className="divide-y overflow-y-auto">
            {sales.map((sale) => (
              <SaleRow key={sale.clientId} sale={sale} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function SaleRow({ sale }: { sale: LocalSale }) {
  const time = new Date(sale.createdAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  return (
    <li className="flex flex-col gap-0.5 py-2 text-sm">
      <div className="flex items-center gap-2">
        <span className="font-medium tabular-nums">#{sale.serverTicket ?? sale.localTicket}</span>
        <span className="text-muted-foreground">{time}</span>
        <span className="text-muted-foreground">{METHOD_LABEL[sale.paymentMethod]}</span>
        <SaleStatus sale={sale} />
        <span className="ml-auto font-medium tabular-nums">{formatMoney(sale.total)}</span>
      </div>
      <div className="truncate text-xs text-muted-foreground">
        {sale.items.map((i) => `${i.quantity} × ${i.name}`).join(', ')}
      </div>
      {sale.status === 'rejected' && sale.error && <div className="text-xs text-destructive">{sale.error}</div>}
      {sale.needsReview && sale.reviewReason && (
        <div className="text-xs text-amber-800">Para revisión: {sale.reviewReason}</div>
      )}
    </li>
  );
}

function SaleStatus({ sale }: { sale: LocalSale }) {
  const [label, tone] =
    sale.status === 'rejected'
      ? ['Rechazada', 'border-red-200 bg-red-50 text-red-700']
      : sale.status === 'pending'
        ? ['Pendiente', 'border-gray-200 bg-gray-50 text-gray-700']
        : sale.needsReview
          ? ['Revisar', 'border-amber-200 bg-amber-50 text-amber-800']
          : ['Sincronizada', 'border-emerald-200 bg-emerald-50 text-emerald-700'];
  return <span className={cn('rounded-full border px-2 text-xs', tone)}>{label}</span>;
}

export function DifferenceText({ difference }: { difference: number }) {
  if (difference === 0) return <p className="text-sm text-emerald-700">La caja cuadra.</p>;
  return (
    <p className={cn('text-sm font-medium', difference < 0 ? 'text-destructive' : 'text-amber-700')}>
      {difference < 0 ? 'Faltante' : 'Sobrante'} de {formatMoney(Math.abs(difference))}
    </p>
  );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-lg border p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn('tabular-nums', strong ? 'text-2xl font-semibold' : 'text-lg')}>{value}</dd>
    </div>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={cn('flex justify-between', strong ? 'font-medium' : 'text-muted-foreground')}>
      <dt>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
