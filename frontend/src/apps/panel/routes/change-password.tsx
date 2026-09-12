import { useState } from 'react';
import type { FormEvent } from 'react';
import { createLazyRoute, useNavigate, useSearch } from '@tanstack/react-router';
import { useMutation } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { changePassword } from '@/shared/api/auth';
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
import { NEW_PASSWORD_MIN_LENGTH, changePasswordError } from '../auth/change-password-model';

interface ChangePasswordSearch {
  email?: string;
}

/**
 * Cambio de contraseña. El login trae aquí a quien tiene
 * `must_change_password` (primer login de un admin nuevo), con el correo en
 * `?email=`. No necesita sesión: el backend re-valida la contraseña actual.
 */
function ChangePasswordPage() {
  const search = useSearch({ from: '/change-password' }) as ChangePasswordSearch;
  const navigate = useNavigate();
  const [email, setEmail] = useState(search.email ?? '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const mutation = useMutation<void, Error>({
    mutationFn: () => changePassword({ email: email.trim(), currentPassword, newPassword }),
    onSuccess: () => {
      setErrorMsg(null);
      window.setTimeout(() => void navigate({ to: '/login' }), 1200);
    },
    onError: (err) => {
      setErrorMsg(err instanceof ApiError ? err.message : 'Error inesperado');
    },
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const problem = changePasswordError({ email, currentPassword, newPassword, confirmPassword });
    if (problem) {
      setErrorMsg(problem);
      return;
    }
    mutation.mutate();
  }

  const disabled = mutation.isPending || mutation.isSuccess;

  return (
    <div className="flex items-center justify-center min-h-screen p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">Cambiar contraseña</CardTitle>
          <CardDescription>Tu cuenta pide una contraseña nueva antes de continuar.</CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                autoFocus={!search.email}
                required
                disabled={disabled}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="current">Contraseña actual</Label>
              <Input
                id="current"
                type="password"
                autoComplete="current-password"
                autoFocus={!!search.email}
                required
                disabled={disabled}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="new">Contraseña nueva</Label>
              <Input
                id="new"
                type="password"
                autoComplete="new-password"
                required
                disabled={disabled}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Mínimo {NEW_PASSWORD_MIN_LENGTH} caracteres, con mayúscula, minúscula y número.
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="confirm">Confirma la contraseña nueva</Label>
              <Input
                id="confirm"
                type="password"
                autoComplete="new-password"
                required
                disabled={disabled}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>

            <Button type="submit" disabled={disabled} className="mt-2">
              {mutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              )}
              {mutation.isPending ? 'Guardando…' : 'Cambiar contraseña'}
            </Button>

            {errorMsg && (
              <Alert variant="destructive">
                <AlertDescription>{errorMsg}</AlertDescription>
              </Alert>
            )}
            {mutation.isSuccess && (
              <Alert>
                <AlertDescription>Contraseña actualizada. Entra con la nueva…</AlertDescription>
              </Alert>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export const Route = createLazyRoute('/change-password')({
  component: ChangePasswordPage,
});
