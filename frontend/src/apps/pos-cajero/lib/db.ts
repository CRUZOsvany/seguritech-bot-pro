/**
 * Base local de la caja (IndexedDB vía Dexie). Una base por negocio.
 *
 * Todo lo que hace el cajero se escribe aquí PRIMERO y después se sincroniza:
 *   - catalog  → copia del catálogo del servidor (solo lectura para el cajero)
 *   - sessions → aperturas/cierres de caja hechos en esta laptop
 *   - sales    → ventas hechas en esta laptop, con su estado de sincronización
 *   - outbox   → cola FIFO de operaciones pendientes de mandar al servidor
 *
 * El outbox no duplica datos: cada operación apunta (entityClientId) a la
 * sesión o venta cuyo registro tiene lo que hay que mandar.
 */
import Dexie, { type EntityTable } from 'dexie';

export type PaymentMethod = 'cash' | 'card' | 'transfer';

export interface CatalogProduct {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  unitType: string;
  unitPrice: number;
  taxRate: number;
  stockQty: number;
  stockMin: number;
  trackStock: boolean;
}

export interface LocalCashSession {
  /** UUID generado aquí al abrir; es el client_id que deduplica en el servidor. */
  clientId: string;
  cashierId: string;
  /** id del servidor; null hasta que la apertura se sincroniza. */
  serverId: string | null;
  openingAmount: number;
  openedAt: string;
  status: 'open' | 'closed';
  closedAt: string | null;
  closingAmount: number | null;
  /** Calculado aquí al cerrar; se reemplaza por el del servidor al sincronizar. */
  expectedAmount: number | null;
  difference: number | null;
  /** true cuando el cierre ya llegó al servidor (expected/difference son los suyos). */
  closeSynced: boolean;
  /** Aviso para el cajero: apertura adoptada, error definitivo, etc. */
  notice: string | null;
}

export interface LocalSaleItem {
  productId: string;
  name: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export type LocalSaleStatus = 'pending' | 'synced' | 'rejected';

export interface LocalSale {
  clientId: string;
  cashierId: string;
  sessionClientId: string;
  /** Número provisional (001, 002…) mientras no hay respuesta del servidor. */
  localTicket: string;
  serverTicket: string | null;
  items: LocalSaleItem[];
  subtotal: number;
  taxTotal: number;
  /** Lo que se le cobró al cliente con los precios que tenía la laptop. */
  total: number;
  paymentMethod: PaymentMethod;
  amountPaid: number;
  changeGiven: number;
  createdAt: string;
  status: LocalSaleStatus;
  /** Total calculado por el servidor con sus precios; null hasta sincronizar. */
  serverTotal: number | null;
  needsReview: boolean;
  reviewReason: string | null;
  /** Motivo si el servidor la rechazó definitivamente. */
  error: string | null;
}

export type OutboxKind = 'open_session' | 'sale' | 'close_session';

export interface OutboxOp {
  seq?: number;
  cashierId: string;
  kind: OutboxKind;
  /** clientId de la sesión (open/close) o de la venta (sale). */
  entityClientId: string;
  status: 'pending' | 'done' | 'failed';
  attempts: number;
  lastError: string | null;
  createdAt: string;
}

export class CajaDb extends Dexie {
  catalog!: EntityTable<CatalogProduct, 'id'>;
  sessions!: EntityTable<LocalCashSession, 'clientId'>;
  sales!: EntityTable<LocalSale, 'clientId'>;
  outbox!: EntityTable<OutboxOp, 'seq'>;
  meta!: EntityTable<{ key: string; value: string }, 'key'>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({
      catalog: 'id, barcode, sku',
      sessions: 'clientId, cashierId, serverId',
      sales: 'clientId, sessionClientId, cashierId',
      outbox: '++seq, cashierId, status',
      meta: 'key',
    });
  }
}

export function openCajaDb(tenantId: string): CajaDb {
  return new CajaDb(`seguritech-caja-${tenantId}`);
}

export function newClientId(): string {
  return crypto.randomUUID();
}

/** Sesión abierta del cajero en esta laptop, si hay. */
export async function findOpenSession(db: CajaDb, cashierId: string): Promise<LocalCashSession | undefined> {
  return db.sessions
    .where('cashierId')
    .equals(cashierId)
    .filter((s) => s.status === 'open')
    .first();
}

export async function pendingOps(db: CajaDb, cashierId?: string): Promise<OutboxOp[]> {
  const ops = await db.outbox.where('status').equals('pending').sortBy('seq');
  return cashierId ? ops.filter((op) => op.cashierId === cashierId) : ops;
}
