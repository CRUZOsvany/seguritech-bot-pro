import type { PosUser } from '@/domain/entities/pos/PosUser';

/**
 * Puerto: persistencia de usuarios POS (cajeros).
 *
 * El lockout vive en la fila (failedAttempts, lockedUntil) — NO usamos la
 * tabla login_attempts del admin. Esto mantiene los dos sistemas auth
 * desacoplados.
 */
export interface PosUserRepository {
  findById(tenantId: string, id: string): Promise<PosUser | null>;
  /**
   * Login por (tenantSlug, name). El service resuelve tenantSlug → tenantId
   * antes de llamar este método.
   */
  findByTenantAndName(tenantId: string, name: string): Promise<PosUser | null>;

  /** +1 al contador. Setea lockedUntil si supera el umbral. */
  recordFailedAttempt(id: string, lockoutUntil: Date | null): Promise<void>;

  /** Reset a 0, actualiza lastLoginAt. */
  recordSuccessfulLogin(id: string): Promise<void>;
}
