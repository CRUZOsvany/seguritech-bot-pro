/**
 * Error tipado de auth POS. El router mapea cada code a un HTTP status.
 *
 * Mantiene PosAuthService framework-agnostic (no lanza 401/429 directamente).
 *
 * code mapping en AuthRouter.pos-login:
 *   'locked'          → 429
 *   'module_disabled' → 403
 *   resto             → 401
 */
export type PosAuthErrorCode =
  | 'not_found'
  | 'locked'
  | 'invalid_pin'
  | 'inactive'
  | 'module_disabled';

export class PosAuthError extends Error {
  public readonly code: PosAuthErrorCode;

  constructor(code: PosAuthErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'PosAuthError';
    this.code = code;
  }
}
