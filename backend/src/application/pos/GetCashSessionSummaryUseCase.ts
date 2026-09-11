import type { PosCashSessionRepository } from '@/domain/ports/pos/PosCashSessionRepository';
import type { PosCashSession, PosCashSessionSummary } from '@/domain/entities/pos/CashSession';
import { PosOperationError } from './PosOperationError';

/**
 * Resumen de una sesión de caja para la pantalla de cierre (POS Lite, T-04):
 * total vendido, número de ventas y desglose por método de pago.
 *
 * Solo el dueño de la sesión la consulta — mismo criterio que el cierre.
 */
export class GetCashSessionSummaryUseCase {
  constructor(private readonly cashSessions: PosCashSessionRepository) {}

  async execute(params: {
    tenantId: string;
    cashierId: string;
    sessionId: string;
  }): Promise<{ session: PosCashSession; summary: PosCashSessionSummary }> {
    const { tenantId, cashierId, sessionId } = params;

    const session = await this.cashSessions.findById(tenantId, sessionId);
    if (!session) {
      throw new PosOperationError('session_not_found', 'Caja no encontrada');
    }
    if (session.cashierId !== cashierId) {
      throw new PosOperationError('session_not_owned', 'Esa caja pertenece a otro cajero');
    }

    const summary = await this.cashSessions.getSummary(tenantId, sessionId);
    return { session, summary };
  }
}
