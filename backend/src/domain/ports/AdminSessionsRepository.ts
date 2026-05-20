/**
 * Denylist de JWTs revocados. Sin esto, un JWT robado de un logout viejo
 * seguiría válido hasta su exp.
 */
export interface AdminSessionsRepository {
  /**
   * Marca un jti como revocado. expiresAt = exp del JWT (cuando pase, la fila
   * puede borrarse con pg_cron — ver migration 009).
   */
  revoke(jti: string, adminId: string | null, expiresAt: Date): Promise<void>;

  /** Devuelve true si el jti está en la denylist y aún no ha expirado. */
  isRevoked(jti: string): Promise<boolean>;
}
