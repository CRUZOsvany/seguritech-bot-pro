import type { SupabaseClient } from '@supabase/supabase-js';
import type pino from 'pino';
import type {
  AdminUser,
  AdminUsersRepository,
  AdminRole,
} from '@/domain/ports/AdminUsersRepository';
import type { TokenCrypto } from '@/infrastructure/services/TokenCrypto';

interface AdminUserRow {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  role: AdminRole;
  tenant_id: string | null;
  totp_secret: string | null;
  totp_enabled: boolean | null;
  must_change_password: boolean | null;
}

export class SupabaseAdminUsersRepository implements AdminUsersRepository {
  constructor(
    private readonly supabase: SupabaseClient,
    /**
     * TokenCrypto se usa para descifrar totp_secret (cuando se implemente 2FA TOTP).
     * Opcional: si no se pasa, totp queda como null en el mapeo (2FA deshabilitado
     * de facto).
     */
    private readonly crypto: TokenCrypto | null,
    private readonly logger: pino.Logger,
  ) {}

  async findByEmail(email: string): Promise<AdminUser | null> {
    const { data, error } = await this.supabase
      .from('admin_users')
      .select('id, email, password_hash, name, role, tenant_id, totp_secret, totp_enabled, must_change_password')
      .eq('email', email)
      .maybeSingle();

    if (error) {
      this.logger.error({ err: error, email }, '❌ findByEmail admin_users falló');
      return null;
    }
    if (!data) return null;
    return this.toDomain(data as AdminUserRow);
  }

  async findById(id: string): Promise<AdminUser | null> {
    const { data, error } = await this.supabase
      .from('admin_users')
      .select('id, email, password_hash, name, role, tenant_id, totp_secret, totp_enabled, must_change_password')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      this.logger.error({ err: error, id }, '❌ findById admin_users falló');
      return null;
    }
    if (!data) return null;
    return this.toDomain(data as AdminUserRow);
  }

  async updatePassword(id: string, newPasswordHash: string): Promise<void> {
    const { error } = await this.supabase
      .from('admin_users')
      .update({ password_hash: newPasswordHash, must_change_password: false })
      .eq('id', id);
    if (error) {
      throw new Error(`updatePassword admin_users: ${error.message}`);
    }
  }

  private toDomain(row: AdminUserRow): AdminUser {
    let decrypted: string | null = null;
    if (row.totp_enabled && row.totp_secret && this.crypto) {
      try {
        decrypted = this.crypto.decrypt(row.totp_secret);
      } catch (err) {
        this.logger.error({ err, email: row.email }, '❌ No se pudo descifrar totp_secret');
      }
    }
    return {
      id: row.id,
      email: row.email,
      password_hash: row.password_hash,
      name: row.name,
      role: row.role,
      tenant_id: row.tenant_id,
      totp_enabled: !!row.totp_enabled,
      totp_secret_decrypted: decrypted,
      must_change_password: !!row.must_change_password,
    };
  }
}
