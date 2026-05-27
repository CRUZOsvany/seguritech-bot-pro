import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import { createRoute, useSearch } from '@tanstack/react-router';
import { useMutation } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { rootRoute } from './__root';
import { login, type LoginResponse } from '@/shared/api/auth';
import { ApiError } from '@/shared/api/client';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/ui/card';
import { Alert, AlertDescription } from '@/shared/ui/alert';

interface LoginSearch {
  next?: string;
}

function LoginPage() {
  const search = useSearch({ from: loginRoute.id }) as LoginSearch;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [needsTotp, setNeedsTotp] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const mutation = useMutation<LoginResponse, Error>({
    mutationFn: () =>
      login({
        email: email.trim(),
        password,
        ...(needsTotp && totpCode ? { totpCode: totpCode.trim() } : {}),
      }),
    onSuccess: (resp) => {
      setErrorMsg(null);
      if (resp.kind === 'totp_required') {
        setNeedsTotp(true);
        return;
      }
      if (resp.kind === 'must_change_password') {
        const qsEmail = encodeURIComponent(email.trim());
        window.location.href = `/panel/change-password.html?email=${qsEmail}`;
        return;
      }
      const next = search.next ? decodeURIComponent(search.next) : '/app/dashboard';
      window.location.href = next;
    },
    onError: (err) => {
      const msg = err instanceof ApiError ? err.message : 'Error inesperado';
      setErrorMsg(msg);
    },
  });

  useEffect(() => {
    if (needsTotp) {
      const el = document.getElementById('totp');
      if (el) (el as HTMLInputElement).focus();
    }
  }, [needsTotp]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) {
      setErrorMsg('Email y password requeridos');
      return;
    }
    mutation.mutate();
  }

  return (
    <div className="flex items-center justify-center min-h-screen p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">SegurITech</CardTitle>
          <CardDescription>Panel interno · Sólo equipo autorizado</CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                autoFocus
                required
                disabled={mutation.isPending}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                disabled={mutation.isPending}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {needsTotp && (
              <div className="grid gap-2">
                <Label htmlFor="totp">Código 2FA (6 dígitos)</Label>
                <Input
                  id="totp"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  pattern="\d{6}"
                  disabled={mutation.isPending}
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                />
              </div>
            )}

            <Button type="submit" disabled={mutation.isPending} className="mt-2">
              {mutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              )}
              {mutation.isPending ? 'Entrando…' : 'Entrar'}
            </Button>

            {errorMsg && (
              <Alert variant="destructive">
                <AlertDescription>{errorMsg}</AlertDescription>
              </Alert>
            )}
            {needsTotp && !errorMsg && (
              <p className="text-sm text-muted-foreground">
                Ingresa tu código 2FA
              </p>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginPage,
  validateSearch: (search: Record<string, unknown>): LoginSearch => ({
    next: typeof search.next === 'string' ? search.next : undefined,
  }),
});
