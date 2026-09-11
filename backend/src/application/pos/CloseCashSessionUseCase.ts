import type { PosCashSessionRepository } from '@/domain/ports/pos/PosCashSessionRepository';
import type {
  CloseCashSessionInput,
  PosCashSession,
  PosCashSessionSummary,
} from '@/domain/entities/pos/CashSession';
import { PosOperationError, roundMoney } from './PosOperationError';

/**
 * Cierra la caja con arqueo (POS Lite, T-04).
 *
 *   expectedAmount = openingAmount + Σ pos_sales.total (payment_method='cash')
 *   difference     = closingAmount − expectedAmount   (negativo = faltante)
 *
 * El cambio entregado no entra en la cuenta: en efectivo el cajón recibe
 * amount_paid y devuelve change_given, así que lo que queda es `total`.
 *
 * Idempotente: cerrar una sesión ya cerrada devuelve la sesión tal cual (un
 * reintento de sincronización del cierre no es un error).
 */
export class CloseCashSessionUseCase {
  constructor(private readonly cashSessions: PosCashSessionRepository) {}

  async execute(params: {
    tenantId: string;
    cashierId: string;
    sessionId: string;
    input: CloseCashSessionInput;
  }): Promise<{ session: PosCashSession; summary: PosCashSessionSummary }> {
    const { tenantId, cashierId, sessionId, input } = params;

    const session = await this.cashSessions.findById(tenantId, sessionId);
    if (!session) {
      throw new PosOperationError('session_not_found', 'Caja no encontrada');
    }
    if (session.cashierId !== cashierId) {
      throw new PosOperationError('session_not_owned', 'Esa caja pertenece a otro cajero');
    }

    const summary = await this.cashSessions.getSummary(tenantId, sessionId);
    if (session.status === 'closed') {
      return { session, summary };
    }

    const cashSales = summary.byPaymentMethod.cash ?? 0;
    const expectedAmount = roundMoney(session.openingAmount + cashSales);
    const difference = roundMoney(input.closingAmount - expectedAmount);

    const closed = await this.cashSessions.close(tenantId, sessionId, {
      closingAmount: input.closingAmount,
      expectedAmount,
      difference,
    });
    return { session: closed, summary };
  }
}
