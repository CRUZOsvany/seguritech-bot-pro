import { useState, type FormEvent } from 'react';
import { LockOpen } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';
import { Label } from '@/shared/ui/label';
import { MoneyInput } from '../components/MoneyInput';
import { openCashLocal } from '../lib/actions';
import type { CajaDb } from '../lib/db';
import { parseMoney } from '../lib/money';

interface OpenCashScreenProps {
  db: CajaDb;
  cashierId: string;
  onOpened: () => void;
}

/**
 * Sin caja abierta no se vende (regla del diseño §3.2). Abrir funciona sin
 * internet: se guarda en la laptop y se sincroniza después.
 */
export function OpenCashScreen({ db, cashierId, onOpened }: OpenCashScreenProps) {
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const openingAmount = parseMoney(amount);
    if (openingAmount === null) {
      setError('Escribe el efectivo con el que abres (puede ser 0).');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await openCashLocal(db, { cashierId, openingAmount });
      onOpened();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <LockOpen className="size-5" aria-hidden />
            Abrir caja
          </CardTitle>
          <CardDescription>Cuenta el efectivo que hay en el cajón antes de empezar a vender.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={submit}>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="opening">Fondo inicial</Label>
              <MoneyInput
                id="opening"
                autoFocus
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
            <Button type="submit" size="lg" className="h-11 text-base" disabled={busy}>
              Abrir caja
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
