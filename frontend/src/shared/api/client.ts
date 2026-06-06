/**
 * Cliente HTTP del panel.
 *
 * Replica el comportamiento del backend/public/panel/_api.js legacy:
 *   - credentials: 'same-origin' (cookie JWT HTTPOnly)
 *   - 401 fuera de /api/auth → redirige a /app/login?next=<actual>
 *   - El propio /api/auth puede devolver 401 sin redirigir (login fallido,
 *     2FA_REQUIRED, etc) — esos casos los maneja la pantalla de login.
 */

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

const AUTH_PREFIX = '/api/auth';

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  /**
   * Cuerpo JSON crudo de la respuesta de error (cuando lo hay). Permite a los
   * callers leer payloads estructurados más allá de `error`, p. ej. el
   * `{ error, issues }` que devuelve el publish de flows en 400.
   */
  readonly body?: unknown;
  constructor(status: number, message: string, code?: string, body?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

export async function apiFetch<T = unknown>(
  method: Method,
  url: string,
  body?: unknown,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    throw new ApiError(0, `Red caída: ${(err as Error).message}`);
  }

  // 401 fuera de /api/auth → redirige a login con ?next= para volver después.
  if (res.status === 401 && !url.startsWith(AUTH_PREFIX)) {
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.href = `/app/login?next=${next}`;
    // Promise que nunca resuelve — evita render parcial mientras navega.
    return new Promise<T>(() => {});
  }

  // 204 No Content
  if (res.status === 204) {
    return undefined as T;
  }

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* sin body o no-JSON */
  }

  if (!res.ok) {
    const errObj = data as { error?: string } | null;
    const msg = errObj?.error ?? `HTTP ${res.status}`;
    throw new ApiError(res.status, msg, errObj?.error, data);
  }

  return data as T;
}
