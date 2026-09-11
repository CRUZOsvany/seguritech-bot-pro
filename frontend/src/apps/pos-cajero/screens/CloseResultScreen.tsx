import { useLiveQuery } from 'dexie-react-hooks';
import { CircleCheck } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import type { CajaDb, LocalCashSession } from '../lib/db';
import { formatMoney } from '../lib/money';
import { DifferenceText } from './CloseCashScreen';

interface CloseResultScreenProps {
  db: CajaDb;
  closed: LocalCashSession;
  onDone: () => void;
}

/**
 * Resultado del arqueo. Lee la sesión en vivo: cuando el cierre sube, el
 * esperado y la diferencia pasan a ser los que calculó el servidor.
 */
export function CloseResultScreen({ db, closed, onDone }: CloseResultScreenProps) {
  const session = useLiveQuery(() => db.sessions.get(closed.clientId), [db, closed.clientId]) ?? closed;

  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <CircleCheck className="size-5 text-emerald-600" aria-hidden />
            Caja cerrada
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <dl className="flex flex-col gap-1 text-sm">
            <Line label="Fondo inicial" value={formatMoney(session.openingAmount)} />
            <Line label="Efectivo esperado" value={formatMoney(session.expectedAmount ?? 0)} />
            <Line label="Efectivo contado" value={formatMoney(session.closingAmount ?? 0)} />
          </dl>
          {session.difference !== null && <DifferenceText difference={session.difference} />}
          <p className="text-xs text-muted-foreground">
            {session.closeSynced
              ? 'Confirmado por el servidor.'
              : 'Guardado en esta laptop. Se envía al servidor en cuanto haya internet.'}
          </p>
          <Button size="lg" className="h-11" onClick={onDone}>
            Listo
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}
