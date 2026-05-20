import type { SupabaseClient } from '@supabase/supabase-js';
import type pino from 'pino';
import type { AdminSessionsRepository } from '@/domain/ports/AdminSessionsRepository';

export class SupabaseAdminSessionsRepository implements AdminSessionsRepository {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly logger: pino.Logger,
  ) {}

  async revoke(jti: string, adminId: string | null, expiresAt: Date): Promise<void> {
    const { error } = await this.supabase
      .from('admin_sessions_revoked')
      .upsert(
        {
          jti,
          admin_id: adminId,
          expires_at: expiresAt.toISOString(),
        },
        { onConflict: 'jti' },
      );
    if (error) {
      this.logger.error({ err: error, jti }, '❌ revoke session failed');
      throw new Error(`revoke session: ${error.message}`);
    }
  }

  async isRevoked(jti: string): Promise<boolean> {
    if (!jti) return false;
    const { data, error } = await this.supabase
      .from('admin_sessions_revoked')
      .select('jti, expires_at')
      .eq('jti', jti)
      .maybeSingle();

    if (error) {
      this.logger.error({ err: error, jti }, '❌ isRevoked check failed');
      // Fail-closed: si no podemos verificar, asumimos que está revocado.
      return true;
    }
    if (!data) return false;

    // Si ya expiró el JWT de por sí, la denylist ya no aplica.
    const expMs = new Date(data.expires_at).getTime();
    if (expMs < Date.now()) return false;
    return true;
  }
}
