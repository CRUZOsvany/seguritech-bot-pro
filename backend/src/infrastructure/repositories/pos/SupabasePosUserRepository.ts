import type { SupabaseClient } from '@supabase/supabase-js';
import type pino from 'pino';
import type { PosUserRepository } from '@/domain/ports/pos/PosUserRepository';
import type { PosUser, PosUserRole } from '@/domain/entities/pos/PosUser';

/**
 * Implementación Supabase del PosUserRepository.
 *
 * Lockout on-row: failed_attempts + locked_until viven en la fila.
 * El service de auth (PosAuthService, fase 4.3) llama recordFailedAttempt()
 * tras un fallo de PIN y recordSuccessfulLogin() tras un éxito.
 */
export class SupabasePosUserRepository implements PosUserRepository {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly logger: pino.Logger,
  ) {}

  async findById(tenantId: string, id: string): Promise<PosUser | null> {
    const { data, error } = await this.supabase
      .from('pos_users')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .maybeSingle();
    if (error) {
      this.logger.error({ error, tenantId, id }, 'pos.user.findById failed');
      throw new Error(`pos.user.findById failed: ${error.message}`);
    }
    return data ? mapRow(data) : null;
  }

  async findByTenantAndName(tenantId: string, name: string): Promise<PosUser | null> {
    const { data, error } = await this.supabase
      .from('pos_users')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('name', name)
      .maybeSingle();
    if (error) {
      this.logger.error(
        { error, tenantId, name },
        'pos.user.findByTenantAndName failed',
      );
      throw new Error(`pos.user.findByTenantAndName failed: ${error.message}`);
    }
    return data ? mapRow(data) : null;
  }

  async recordFailedAttempt(id: string, lockoutUntil: Date | null): Promise<void> {
    // Incrementamos failed_attempts y, si el caller decidió bloqueo, lo seteamos.
    // El cálculo del umbral vive en el service, no acá.
    // Usamos RPC fallback: como Supabase no expone increment atómico desde el
    // cliente, hacemos read-modify-write. Es aceptable porque el lockout es
    // best-effort y la unicidad la garantiza la cookie de sesión (un cajero
    // con 6 ventanas haciendo brute force es un caso de detección, no de carrera).
    const { data: row, error: readErr } = await this.supabase
      .from('pos_users')
      .select('failed_attempts')
      .eq('id', id)
      .maybeSingle();
    if (readErr) {
      this.logger.error({ error: readErr, id }, 'pos.user.recordFailedAttempt read failed');
      throw new Error(`pos.user.recordFailedAttempt failed: ${readErr.message}`);
    }
    const current = row?.failed_attempts ? Number(row.failed_attempts) : 0;

    const { error: updErr } = await this.supabase
      .from('pos_users')
      .update({
        failed_attempts: current + 1,
        locked_until: lockoutUntil ? lockoutUntil.toISOString() : null,
      })
      .eq('id', id);
    if (updErr) {
      this.logger.error({ error: updErr, id }, 'pos.user.recordFailedAttempt update failed');
      throw new Error(`pos.user.recordFailedAttempt failed: ${updErr.message}`);
    }
  }

  async recordSuccessfulLogin(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('pos_users')
      .update({
        failed_attempts: 0,
        locked_until: null,
        last_login_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (error) {
      this.logger.error({ error, id }, 'pos.user.recordSuccessfulLogin failed');
      throw new Error(`pos.user.recordSuccessfulLogin failed: ${error.message}`);
    }
  }
}

function mapRow(row: Record<string, unknown>): PosUser {
  return {
    id: row.id as string,
    tenantId: row.tenant_id as string,
    name: row.name as string,
    pinHash: row.pin_hash as string,
    role: row.role as PosUserRole,
    isActive: row.is_active as boolean,
    failedAttempts: Number(row.failed_attempts ?? 0),
    lockedUntil: row.locked_until ? new Date(row.locked_until as string) : null,
    lastLoginAt: row.last_login_at ? new Date(row.last_login_at as string) : null,
    createdAt: new Date(row.created_at as string),
  };
}
