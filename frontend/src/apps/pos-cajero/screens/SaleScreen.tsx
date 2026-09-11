import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeftRight, Banknote, CircleCheck, CreditCard, Minus, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { cn } from '@/lib/utils';
import { CatalogPanel } from '../components/CatalogPanel';
import { QuickAdd } from '../components/QuickAdd';
import { MoneyInput } from '../components/MoneyInput';
import { Notice } from '../components/Notice';
import { registerSaleLocal } from '../lib/actions';
import {
  addToCart,
  cartTotals,
  lineSubtotal,
  overStockLines,
  paymentProblem,
  setQuantity,
  type CartLine,
} from '../lib/cart';
import type { CajaDb, CatalogProduct, LocalCashSession, LocalSale, PaymentMethod } from '../lib/db';
import { formatMoney, parseMoney, roundMoney } from '../lib/money';

interface SaleScreenProps {
  db: CajaDb;
  cashierId: string;
  session: LocalCashSession;
  onSaved: () => void;
}

const METHODS: Array<{ value: PaymentMethod; label: string; icon: typeof Banknote }> = [
  { value: 'cash', label: 'Efectivo', icon: Banknote },
  { value: 'card', label: 'Tarjeta', icon: CreditCard },
  { value: 'transfer', label: 'Transferencia', icon: ArrowLeftRight },
];

/** Pantalla principal de venta (diseño §3.2): catálogo a la izquierda, venta actual a la derecha. */
export function SaleScreen({ db, cashierId, session, onSaved }: SaleScreenProps) {
  const products = useLiveQuery(() => db.catalog.toArray(), [db], []);
  const rejected = useLiveQuery(
    () =>
      db.sales
        .where('sessionClientId')
        .equals(session.clientId)
        .filter((s) => s.status === 'rejected')
        .count(),
    [db, session.clientId],
    0,
  );

  const [lines, setLines] = useState<CartLine[]>([]);
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [received, setReceived] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [lastSale, setLastSale] = useState<LocalSale | null>(null);
  const [busy, setBusy] = useState(false);
  const quickAddRef = useRef<HTMLInputElement>(null);

  // F2 regresa al campo de agregar rápido desde cualquier parte de la pantalla.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        quickAddRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const totals = useMemo(() => cartTotals(lines), [lines]);
  const overStock = useMemo(() => overStockLines(lines), [lines]);
  const amountPaid = method === 'cash' ? parseMoney(received) : totals.total;
  const problem = paymentProblem(lines, method, amountPaid);
  const change = method === 'cash' && amountPaid !== null ? roundMoney(amountPaid - totals.total) : 0;

  function add(product: CatalogProduct) {
    setLines((current) => addToCart(current, product));
    setLastSale(null);
    setError(null);
  }

  async function charge() {
    if (problem || busy) return;
    setBusy(true);
    setError(null);
    try {
      const sale = await registerSaleLocal(db, {
        cashierId,
        session,
        lines,
        paymentMethod: method,
        amountPaid,
      });
      setLastSale(sale);
      setLines([]);
      setReceived('');
      setMethod('cash');
      onSaved();
      quickAddRef.current?.focus();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-0 flex-1 gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_26rem]">
      <div className="flex min-h-0 flex-col gap-3">
        {rejected > 0 && (
          <Notice tone="error">
            {rejected === 1 ? 'Una venta no se pudo' : `${rejected} ventas no se pudieron`} registrar en el
            servidor. Revísalas en «Cerrar caja».
          </Notice>
        )}
        {session.notice && <Notice tone="warn">{session.notice}</Notice>}
        <CatalogPanel products={products} onPick={add} />
      </div>

      <section className="flex min-h-0 flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
        <h2 className="font-medium">Venta actual</h2>
        <QuickAdd products={products} onAdd={add} inputRef={quickAddRef} />

        <div className="min-h-24 flex-1 overflow-y-auto">
          {lines.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {lastSale ? <LastSaleMessage sale={lastSale} /> : 'Agrega productos para empezar.'}
            </p>
          ) : (
            <ul className="divide-y">
              {lines.map((line) => (
                <CartRow
                  key={line.productId}
                  line={line}
                  onQuantity={(q) => setLines((current) => setQuantity(current, line.productId, q))}
                />
              ))}
            </ul>
          )}
        </div>

        {overStock.length > 0 && (
          <Notice tone="warn">
            Vas a vender más de lo que marca el inventario:{' '}
            {overStock.map((l) => `${l.name} (hay ${l.stockQty})`).join(', ')}. La venta se registra y queda
            para revisión.
          </Notice>
        )}

        <dl className="flex flex-col gap-1 border-t pt-3 text-sm">
          {totals.taxTotal > 0 && (
            <>
              <Row label="Subtotal" value={formatMoney(totals.subtotal)} />
              <Row label="Impuestos" value={formatMoney(totals.taxTotal)} />
            </>
          )}
          <div className="flex items-baseline justify-between">
            <dt className="text-base font-medium">Total</dt>
            <dd className="text-3xl font-semibold tabular-nums">{formatMoney(totals.total)}</dd>
          </div>
        </dl>

        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Método de pago">
          {METHODS.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={method === value}
              onClick={() => setMethod(value)}
              className={cn(
                'flex flex-col items-center gap-1 rounded-lg border px-2 py-2 text-sm transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
                method === value ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted',
              )}
            >
              <Icon className="size-4" aria-hidden />
              {label}
            </button>
          ))}
        </div>

        {method === 'cash' && (
          <div className="grid grid-cols-2 items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="received">Recibido</Label>
              <MoneyInput
                id="received"
                placeholder={totals.total ? totals.total.toFixed(2) : '0.00'}
                value={received}
                onChange={(e) => setReceived(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void charge();
                }}
              />
            </div>
            <div className="pb-2 text-right">
              <div className="text-xs text-muted-foreground">Cambio</div>
              <div className={cn('text-xl font-semibold tabular-nums', change < 0 && 'text-destructive')}>
                {amountPaid === null ? '—' : formatMoney(Math.max(change, 0))}
              </div>
            </div>
          </div>
        )}

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <Button size="lg" className="h-12 text-base" disabled={!!problem || busy} onClick={() => void charge()}>
          {lines.length > 0 && problem ? problem : `Cobrar ${formatMoney(totals.total)}`}
        </Button>
      </section>
    </div>
  );
}

function CartRow({ line, onQuantity }: { line: CartLine; onQuantity: (q: number) => void }) {
  return (
    <li className="flex items-center gap-2 py-2">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{line.name}</div>
        <div className="text-xs text-muted-foreground tabular-nums">{formatMoney(line.unitPrice)} c/u</div>
      </div>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="icon-sm" aria-label="Uno menos" onClick={() => onQuantity(line.quantity - 1)}>
          <Minus />
        </Button>
        <Input
          className="h-7 w-14 text-center tabular-nums"
          inputMode="decimal"
          aria-label={`Cantidad de ${line.name}`}
          value={line.quantity}
          onChange={(e) => {
            const q = Number(e.target.value.replace(',', '.'));
            if (Number.isFinite(q) && q > 0) onQuantity(q);
          }}
        />
        <Button variant="outline" size="icon-sm" aria-label="Uno más" onClick={() => onQuantity(line.quantity + 1)}>
          <Plus />
        </Button>
      </div>
      <div className="w-20 text-right text-sm font-medium tabular-nums">{formatMoney(lineSubtotal(line))}</div>
      <Button variant="ghost" size="icon-sm" aria-label={`Quitar ${line.name}`} onClick={() => onQuantity(0)}>
        <Trash2 />
      </Button>
    </li>
  );
}

function LastSaleMessage({ sale }: { sale: LocalSale }) {
  return (
    <span className="inline-flex flex-col items-center gap-1 text-foreground">
      <CircleCheck className="size-6 text-emerald-600" aria-hidden />
      <span>
        Venta {sale.localTicket} guardada · {formatMoney(sale.total)}
      </span>
      {sale.paymentMethod === 'cash' && sale.changeGiven > 0 && (
        <span className="text-lg font-semibold">Cambio {formatMoney(sale.changeGiven)}</span>
      )}
    </span>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-muted-foreground">
      <dt>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
