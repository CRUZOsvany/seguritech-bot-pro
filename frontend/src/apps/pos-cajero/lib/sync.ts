/**
 * Sincronización de la cola (outbox) de la caja con el servidor.
 *
 * Reglas, en orden de importancia:
 *
 * 1. FIFO estricto. Las operaciones salen en el orden en que se hicieron: la
 *    apertura antes que sus ventas y las ventas antes del cierre. Si el cierre
 *    llegara antes que una venta, el servidor la rechazaría (caja cerrada) y
 *    el arqueo se calcularía sin ella.
 *
 * 2. Ante red caída, 5xx o 429 (el rate limit global es de 100 req/min), la
 *    cola SE DETIENE y reintenta después — sin saltarse nada, para no romper
 *    el orden.
 *
 * 3. Ante 401 también se detiene: la cookie venció y hay que volver a entrar.
 *    Nada se pierde; la cola sigue ahí cuando el cajero entra de nuevo.
 *
 * 4. Otro 4xx es definitivo: repetirlo no cambia la respuesta. La operación
 *    se marca como fallida, se le muestra al cajero, y la cola SIGUE con la
 *    siguiente. (Stock insuficiente o precio cambiado ya no son 4xx: el
 *    servidor registra la venta y la marca para revisión.)
 *
 * 5. Cada cajero sincroniza solo SUS operaciones: con la cookie de otro, el
 *    servidor respondería "esa caja es de otro cajero" y se perderían.
 *
 * El servidor deduplica por client_id, así que reenviar algo que ya llegó (la
 * respuesta se perdió en el camino) devuelve lo mismo sin duplicar.
 */
import { PosApiError, type SyncApi } from './api';
import { findOpenSession, pendingOps, type CajaDb, type OutboxOp } from './db';
import { adoptServerSession } from './actions';

export type SyncState = 'synced' | 'offline' | 'retrying' | 'unauthorized';

export interface SyncResult {
  state: SyncState;
  sent: number;
  rejected: number;
}

export type ErrorClass = 'offline' | 'retry' | 'unauthorized' | 'definitive';

/** Error que se detecta sin preguntarle al servidor y que reintentar no arregla. */
export class LocalSyncError extends Error {}

export function classifyError(err: unknown): ErrorClass {
  if (err instanceof LocalSyncError) return 'definitive';
  if (err instanceof PosApiError) {
    if (err.status === 0) return 'offline';
    if (err.status === 401) return 'unauthorized';
    if (err.status === 408 || err.status === 429 || err.status >= 500) return 'retry';
    return 'definitive';
  }
  // Algo inesperado (IndexedDB, un bug): mejor reintentar que perder datos.
  return 'retry';
}

export async function syncOutbox(db: CajaDb, api: SyncApi, cashierId: string): Promise<SyncResult> {
  const ops = await pendingOps(db, cashierId);
  let sent = 0;
  let rejected = 0;

  for (const op of ops) {
    try {
      await sendOp(db, api, op);
      await db.outbox.update(op.seq!, { status: 'done', lastError: null, attempts: op.attempts + 1 });
      sent += 1;
    } catch (err) {
      const kind = classifyError(err);
      const message = err instanceof Error ? err.message : String(err);
      if (kind === 'definitive') {
        await markFailed(db, op, message);
        rejected += 1;
        continue;
      }
      await db.outbox.update(op.seq!, { attempts: op.attempts + 1, lastError: message });
      const state: SyncState =
        kind === 'unauthorized' ? 'unauthorized' : kind === 'offline' ? 'offline' : 'retrying';
      return { state, sent, rejected };
    }
  }
  return { state: 'synced', sent, rejected };
}

async function sendOp(db: CajaDb, api: SyncApi, op: OutboxOp): Promise<void> {
  switch (op.kind) {
    case 'open_session': {
      const session = await db.sessions.get(op.entityClientId);
      if (!session) throw new LocalSyncError('La apertura ya no existe en esta laptop');
      if (session.serverId) return;
      try {
        const { session: server } = await api.openSession({
          clientId: session.clientId,
          openingAmount: session.openingAmount,
        });
        await db.sessions.update(session.clientId, { serverId: server.id });
      } catch (err) {
        // El servidor ya tenía una caja abierta de este cajero (p. ej. una que
        // quedó sin cerrar). Se usa esa: rechazar la apertura dejaría todas
        // las ventas de esta caja sin dónde registrarse.
        const existingId = err instanceof PosApiError ? err.details?.sessionId : undefined;
        if (err instanceof PosApiError && err.code === 'session_already_open' && typeof existingId === 'string') {
          await db.sessions.update(session.clientId, {
            serverId: existingId,
            notice:
              'Ya había una caja abierta en el servidor para ti; estas ventas se registraron en esa caja.',
          });
          return;
        }
        throw err;
      }
      return;
    }

    case 'sale': {
      const sale = await db.sales.get(op.entityClientId);
      if (!sale) throw new LocalSyncError('La venta ya no existe en esta laptop');
      const session = await db.sessions.get(sale.sessionClientId);
      if (!session?.serverId) {
        throw new LocalSyncError('La caja de esta venta no se pudo abrir en el servidor');
      }
      const { sale: server } = await api.registerSale({
        clientId: sale.clientId,
        cashSessionId: session.serverId,
        items: sale.items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
        paymentMethod: sale.paymentMethod,
        amountPaid: sale.amountPaid,
      });
      await db.sales.update(sale.clientId, {
        status: 'synced',
        serverTicket: server.ticketNumber,
        serverTotal: server.total,
        needsReview: server.needsReview,
        reviewReason: server.reviewReason,
        error: null,
      });
      return;
    }

    case 'close_session': {
      const session = await db.sessions.get(op.entityClientId);
      if (!session?.serverId) {
        throw new LocalSyncError('La caja no se pudo abrir en el servidor, así que tampoco se puede cerrar allá');
      }
      if (session.closingAmount === null) throw new LocalSyncError('El cierre no tiene efectivo contado');
      const { session: server } = await api.closeSession(session.serverId, {
        closingAmount: session.closingAmount,
      });
      await db.sessions.update(session.clientId, {
        expectedAmount: server.expectedAmount,
        difference: server.difference,
        closeSynced: true,
      });
      return;
    }
  }
}

async function markFailed(db: CajaDb, op: OutboxOp, message: string): Promise<void> {
  await db.outbox.update(op.seq!, { status: 'failed', lastError: message, attempts: op.attempts + 1 });
  if (op.kind === 'sale') {
    await db.sales.update(op.entityClientId, { status: 'rejected', error: message });
  } else {
    await db.sessions.update(op.entityClientId, { notice: message });
  }
}

/**
 * Si esta laptop no tiene caja abierta pero el servidor sí (se abrió en otro
 * equipo, o se reinstaló la app), se adopta para no abrir una segunda.
 */
export async function reconcileOpenSession(db: CajaDb, api: SyncApi, cashierId: string): Promise<void> {
  if (await findOpenSession(db, cashierId)) return;
  const { session } = await api.currentSession();
  if (!session || session.cashierId !== cashierId) return;
  // Si ya la conocemos es porque se cerró aquí y el cierre aún no sube.
  if (await db.sessions.get(session.clientId)) return;
  await adoptServerSession(db, cashierId, session);
}
