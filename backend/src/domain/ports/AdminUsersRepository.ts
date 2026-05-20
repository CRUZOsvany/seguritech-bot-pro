/**
 * Puerto para acceso a usuarios admin del panel (super_admin / admin_operator).
 * El password_hash es bcrypt cost=12, generado vía scripts/generate-admin-hash.ts.
 */

export type AdminRole = 'super_admin' | 'admin_operator';

export interface AdminUser {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  role: AdminRole;
  tenant_id: string | null;
  totp_enabled: boolean;
  /** Descifrado al vuelo desde totp_secret. NULL si totp_enabled=false. */
  totp_secret_decrypted: string | null;
  must_change_password: boolean;
}

export interface AdminUsersRepository {
  findByEmail(email: string): Promise<AdminUser | null>;
  findById(id: string): Promise<AdminUser | null>;
  updatePassword(id: string, newPasswordHash: string): Promise<void>;
}
