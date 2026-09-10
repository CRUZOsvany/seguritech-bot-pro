import type { PosCashSessionRepository } from '@/domain/ports/pos/PosCashSessionRepository';
import type { NewPosCashSession, PosCashSession } from '@/domain/entities/pos/CashSession';
import { PosOperationError } from './PosOperationError';

/**
 * Abre la caja de un cajero (POS Lite, T-04).
 *
 * Orden importante: primero se busca por clientId. Un reintento de
 * sincronización de ESTA misma apertura debe devolver la sesión que ya creó,
 * no chocar con "ya tienes una caja abierta" — que es justo la sesión que
 * abrió el primer intento.
 */
export class OpenCashSessionUseCase {
  constructor(private readonly cashSessions: PosCashSessionRepository) {}

  async execute(params: {
    tenantId: string;
    cashierId: string;
    input: NewPosCashSession;
  }): Promise<{ session: PosCashSession; created: boolean }> {
    const { tenantId, cashierId, input } = params;

    const replay = await this.cashSessions.findByClientId(tenantId, input.clientId);
    if (replay) {
      if (replay.cashierId !== cashierId) {
        throw new PosOperationError('session_not_owned', 'Esa caja pertenece a otro cajero');
      }
      return { session: replay, created: false };
    }

    const alreadyOpen = await this.cashSessions.findOpenByCashier(tenantId, cashierId);
    if (alreadyOpen) {
      throw new PosOperationError('session_already_open', 'Ya tienes una caja abierta', {
        sessionId: alreadyOpen.id,
      });
    }

    const session = await this.cashSessions.open(tenantId, cashierId, input);
    return { session, created: true };
  }
}
