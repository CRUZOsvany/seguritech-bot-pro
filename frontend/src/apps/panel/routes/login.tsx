import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import { createRoute, useSearch } from '@tanstack/react-router';
import { useMutation } from '@tanstack/react-query';
import { rootRoute } from './__root';
import { login, type LoginResponse } from '@/shared/api/auth';
import { ApiError } from '@/shared/api/client';

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
      // success
      const next = search.next ? decodeURIComponent(search.next) : '/app/dashboard';
      window.location.href = next;
    },
    onError: (err) => {
      const msg = err instanceof ApiError ? err.message : 'Error inesperado';
      setErrorMsg(msg);
    },
  });

  // Focus inicial en email; al activar 2FA mover focus al campo TOTP.
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
    <div className="flex items-center justify-center min-h-screen">
      <form
        onSubmit={handleSubmit}
        className="w-[380px] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-base)] p-8"
      >
        <h1 className="text-xl font-semibold mb-2 text-[var(--color-text)]">SegurITech</h1>
        <p className="text-xs text-[var(--color-text-muted)] mb-6">
          Panel interno · Sólo equipo autorizado
        </p>

        <div className="mb-4">
          <label
            htmlFor="email"
            className="block text-[11px] uppercase tracking-wide font-semibold text-[var(--color-text-muted)] mb-1"
          >
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="username"
            autoFocus
            required
            disabled={mutation.isPending}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-[var(--color-border)] rounded-[var(--radius-base)] bg-[var(--color-surface)] focus:outline-none focus:border-[var(--color-primary)] focus:ring-[3px] focus:ring-[rgba(31,111,235,0.2)] disabled:opacity-55"
          />
        </div>

        <div className="mb-4">
          <label
            htmlFor="password"
            className="block text-[11px] uppercase tracking-wide font-semibold text-[var(--color-text-muted)] mb-1"
          >
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            disabled={mutation.isPending}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-[var(--color-border)] rounded-[var(--radius-base)] bg-[var(--color-surface)] focus:outline-none focus:border-[var(--color-primary)] focus:ring-[3px] focus:ring-[rgba(31,111,235,0.2)] disabled:opacity-55"
          />
        </div>

        {needsTotp && (
          <div className="mb-4">
            <label
              htmlFor="totp"
              className="block text-[11px] uppercase tracking-wide font-semibold text-[var(--color-text-muted)] mb-1"
            >
              Código 2FA (6 dígitos)
            </label>
            <input
              id="totp"
              type="text"
              inputMode="numeric"
              maxLength={6}
              pattern="\d{6}"
              disabled={mutation.isPending}
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
              className="w-full px-3 py-2 text-sm border border-[var(--color-border)] rounded-[var(--radius-base)] bg-[var(--color-surface)] focus:outline-none focus:border-[var(--color-primary)] focus:ring-[3px] focus:ring-[rgba(31,111,235,0.2)] disabled:opacity-55"
            />
          </div>
        )}

        <button
          type="submit"
          disabled={mutation.isPending}
          className="w-full py-3 mt-2 text-sm font-medium text-white bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] rounded-[var(--radius-base)] disabled:opacity-55 disabled:cursor-not-allowed transition-colors"
        >
          {mutation.isPending ? 'Entrando…' : 'Entrar'}
        </button>

        {errorMsg && (
          <p className="mt-3 text-xs text-[var(--color-danger)]" role="alert">
            {errorMsg}
          </p>
        )}
        {needsTotp && !errorMsg && (
          <p className="mt-3 text-xs text-[var(--color-text-muted)]">
            Ingresa tu código 2FA
          </p>
        )}
      </form>
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
