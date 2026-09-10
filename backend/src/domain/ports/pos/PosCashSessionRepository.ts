import type {
  CloseCashSessionPatch,
  NewPosCashSession,
  PosCashSession,
  PosCashSessionSummary,
} from '@/domain/entities/pos/CashSession';

/**
 * Puerto: persistencia de sesiones de caja POS (pos_cash_sessions).
 *
 * IMPORTANTE: todos los métodos reciben tenantId y deben aplicar
 * `WHERE tenant_id = ?` en la query. La RLS de Supabase es segunda barrera.
 */
export interface PosCashSessionRepository {
  /**
   * Abre una sesión. Idempotente por (tenantId, clientId): un reintento de
   * sincronización devuelve la sesión existente en vez de abrir otra.
   */
  open(tenantId: string, cashierId: string, session: NewPosCashSession): Promise<PosCashSession>;
  findById(tenantId: string, id: string): Promise<PosCashSession | null>;
  findByClientId(tenantId: string, clientId: string): Promise<PosCashSession | null>;
  findOpenByCashier(tenantId: string, cashierId: string): Promise<PosCashSession | null>;
  /** Marca la sesión como cerrada con el arqueo ya calculado por el caso de uso. */
  close(tenantId: string, id: string, patch: CloseCashSessionPatch): Promise<PosCashSession>;
  /** Agrega las ventas `completed` de la sesión (total, conteo, por método de pago). */
  getSummary(tenantId: string, id: string): Promise<PosCashSessionSummary>;
}
