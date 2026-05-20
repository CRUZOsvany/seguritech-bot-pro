/**
 * Usuario operador del POS (cajero/a). Tabla separada de admin_users porque
 * la auth es PIN bcrypt — no email/password — y no debe acceder al panel admin.
 *
 * Mapeo BD: pos_users (migración 011).
 *
 * Lockout: failedAttempts y lockedUntil viven en la fila (no en login_attempts)
 * para no contaminar el flujo admin.
 */
export type PosUserRole = 'pos_cashier' | 'pos_manager';

export interface PosUser {
  id: string;
  tenantId: string;
  name: string;
  pinHash: string;
  role: PosUserRole;
  isActive: boolean;
  failedAttempts: number;
  lockedUntil: Date | null;
  lastLoginAt: Date | null;
  createdAt: Date;
}
