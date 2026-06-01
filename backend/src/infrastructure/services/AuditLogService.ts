import type { SupabaseClient } from '@supabase/supabase-js';
import type pino from 'pino';

/**
 * admin_id es columna UUID (FK a admin_users). Las sesiones no-cookie
 * (x-api-key → sub='cli', Cloudflare Access → sub='') traen un sub que NO es
 * UUID; insertarlo revienta el INSERT. Sanitizamos a null en esos casos.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface AuditEvent {
  adminId?: string | null;
  adminEmail: string;
  action: string; // 'tenant.create', 'tenant.status.change', etc.
  targetType?: string;
  targetId?: string;
  ip?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Append-only log de toda acción mutating del panel admin.
 * Inmutable por diseño: la tabla solo tiene RLS de SELECT (super_admin).
 * INSERT lo hace el service_role siempre (bypasea RLS).
 */
export class AuditLogService {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly logger: pino.Logger,
  ) {}

  /**
   * Log async, NUNCA bloquea la respuesta. Si falla, se loguea localmente
   * para investigación pero no devuelve error al usuario.
   */
  log(event: AuditEvent): void {
    void this.supabase
      .from('admin_audit_log')
      .insert({
        admin_id: event.adminId && UUID_RE.test(event.adminId) ? event.adminId : null,
        admin_email: event.adminEmail,
        action: event.action,
        target_type: event.targetType ?? null,
        target_id: event.targetId ?? null,
        ip: event.ip ?? null,
        user_agent: event.userAgent ?? null,
        metadata: event.metadata ?? {},
      })
      .then(({ error }) => {
        if (error) {
          this.logger.error({ error, event: { ...event, metadata: '[omitted]' } }, 'AuditLog insert failed');
        }
      });
  }
}
