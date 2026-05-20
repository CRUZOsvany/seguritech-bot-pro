import type { SupabaseClient } from '@supabase/supabase-js';
import type pino from 'pino';
import type { LoginAttemptsRepository } from '@/domain/ports/LoginAttemptsRepository';

export class SupabaseLoginAttemptsRepository implements LoginAttemptsRepository {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly logger: pino.Logger,
  ) {}

  async record(input: { email: string; ip: string; success: boolean }): Promise<void> {
    const { error } = await this.supabase.from('admin_login_attempts').insert({
      email: input.email,
      ip: input.ip || null,
      success: input.success,
    });
    if (error) {
      // No bloqueamos el flujo si falla el log de intentos; logueamos local.
      this.logger.error({ err: error, email: input.email }, '❌ record login attempt failed');
    }
  }

  async countFailed(email: string, windowMinutes: number): Promise<number> {
    const since = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();
    const { count, error } = await this.supabase
      .from('admin_login_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('email', email)
      .eq('success', false)
      .gte('created_at', since);

    if (error) {
      this.logger.error({ err: error, email }, '❌ countFailed login attempts');
      // Fail-closed: si no podemos contar, asumimos bloqueo (devolvemos high).
      return Number.MAX_SAFE_INTEGER;
    }
    return count ?? 0;
  }
}
