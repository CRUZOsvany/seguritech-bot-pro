import { apiFetch } from './client';

export type AdminRole = 'super_admin' | 'admin_operator';

export interface LoginRequest {
  email: string;
  password: string;
  totpCode?: string;
}

/**
 * Respuestas posibles del backend (POST /api/auth/login):
 *   200 { ok: true, user: { email, name, role } }                   → success
 *   200 { mustChangePassword: true }                                → forzar cambio
 *   401 { error: '2FA_REQUIRED' }                                   → pedir TOTP
 *   401 { error: 'Credenciales inválidas' }                         → mostrar inline
 *   429 { error: 'Cuenta bloqueada...' }                            → mostrar inline
 *   400 { error: 'Email y password requeridos' }                    → mostrar inline
 */
export type LoginResponse =
  | { kind: 'success'; user: { email: string; name: string; role: AdminRole } }
  | { kind: 'must_change_password' }
  | { kind: 'totp_required' };

export interface SessionUser {
  email: string;
  role: AdminRole;
  tenantId: string | null;
}

/**
 * Hace login y normaliza las 3 respuestas exitosas como discriminated union.
 * Los errores (401 no-2FA, 429, 400) se propagan como ApiError.
 */
export async function login(req: LoginRequest): Promise<LoginResponse> {
  try {
    const raw = await apiFetch<{
      ok?: boolean;
      mustChangePassword?: boolean;
      user?: { email: string; name: string; role: AdminRole };
    }>('POST', '/api/auth/login', req);

    if (raw?.mustChangePassword === true) {
      return { kind: 'must_change_password' };
    }
    if (raw?.ok === true && raw.user) {
      return { kind: 'success', user: raw.user };
    }
    // Defensivo: el backend cambió su shape sin avisar.
    throw new Error('Respuesta de login no reconocida');
  } catch (err) {
    // 2FA_REQUIRED viene como ApiError(401, '2FA_REQUIRED').
    if (err instanceof Error && err.message === '2FA_REQUIRED') {
      return { kind: 'totp_required' };
    }
    throw err;
  }
}

export async function logout(): Promise<void> {
  await apiFetch<void>('POST', '/api/auth/logout');
}

export async function getSession(): Promise<SessionUser> {
  return apiFetch<SessionUser>('GET', '/api/auth/me');
}
