import { useState, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { KeyRound } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { posApi, PosApiError, type CashierUser } from '../lib/api';
import type { CajaDb } from '../lib/db';

interface LoginScreenProps {
  tenantId: string;
  db: CajaDb;
  onLogin: (user: CashierUser) => void;
}

function loginErrorMessage(err: unknown): string {
  if (!(err instanceof PosApiError)) return 'No se pudo entrar. Intenta otra vez.';
  if (err.status === 0) return 'Sin conexión. Para entrar necesitas internet; después la caja sigue funcionando sin él.';
  if (err.code === 'module_disabled') return 'El punto de venta no está activo para este negocio.';
  if (err.status === 429 || err.code === 'locked') return err.message;
  if (err.status === 401) return 'Nombre o PIN incorrectos.';
  return err.message;
}

/** Login del cajero (diseño §3.1): solo nombre + PIN. El negocio sale de la URL. */
export function LoginScreen({ tenantId, db, onLogin }: LoginScreenProps) {
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pendingOthers = useLiveQuery(() => db.outbox.where('status').equals('pending').count(), [db], 0);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^\d{4,8}$/.test(pin)) {
      setError('El PIN son de 4 a 8 números.');
      return;
    }
    setBusy(true);
    try {
      const { user } = await posApi.login(tenantId, name.trim(), pin);
      onLogin(user);
    } catch (err) {
      setError(loginErrorMessage(err));
      setPin('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <KeyRound className="size-5" aria-hidden />
            Entrar a la caja
          </CardTitle>
          <CardDescription>Escribe tu nombre y tu PIN.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={submit}>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">Nombre</Label>
              <Input
                id="name"
                className="h-11 text-base"
                autoComplete="username"
                autoFocus
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pin">PIN</Label>
              <Input
                id="pin"
                className="h-11 text-base tracking-widest"
                type="password"
                inputMode="numeric"
                autoComplete="current-password"
                maxLength={8}
                required
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              />
            </div>
            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
            <Button type="submit" size="lg" className="h-11 text-base" disabled={busy || !name.trim()}>
              {busy ? 'Entrando…' : 'Entrar'}
            </Button>
            {pendingOthers > 0 && (
              <p className="text-xs text-muted-foreground">
                Hay {pendingOthers} operaciones guardadas en esta laptop que aún no llegan al servidor.
                Se envían cuando entre el cajero que las hizo.
              </p>
            )}
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
