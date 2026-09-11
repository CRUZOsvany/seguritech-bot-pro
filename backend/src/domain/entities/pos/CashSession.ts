/**
 * Sesión de caja (apertura → cierre con arqueo) de un cajero.
 *
 * Mapeo BD: pos_cash_sessions (migración 011 + 022 para client_id/synced_at).
 * Multi-tenant: tenantId siempre presente. RLS en BD + WHERE en repositorio.
 *
 * Una sesión por cajero: varios cajeros del mismo tenant pueden tener cada
 * uno su caja abierta al mismo tiempo sin conflicto (cashier_id la separa).
 *
 * pos_sales.cash_session_id es NOT NULL: sin sesión abierta no hay venta.
 */
export type PosCashSessionStatus = 'open' | 'closed';

export interface PosCashSession {
  id: string;
  tenantId: string;
  cashierId: string;
  openedAt: Date;
  closedAt: Date | null;
  openingAmount: number;
  closingAmount: number | null;
  expectedAmount: number | null;
  difference: number | null;
  notes: string | null;
  status: PosCashSessionStatus;
  clientId: string;
  syncedAt: Date | null;
}

/**
 * Input para abrir caja. tenantId/cashierId salen de la cookie POS, no de aquí.
 */
export interface NewPosCashSession {
  clientId: string;
  openingAmount: number;
}

/** Input del cajero al cerrar: solo lo que contó físicamente (arqueo). */
export interface CloseCashSessionInput {
  closingAmount: number;
}

/**
 * Lo que el repositorio persiste al cerrar. expectedAmount y difference los
 * calcula CloseCashSessionUseCase — el repositorio no hace aritmética.
 */
export interface CloseCashSessionPatch {
  closingAmount: number;
  expectedAmount: number;
  difference: number;
}

/**
 * Resumen para la pantalla de cierre. Solo cuenta ventas `completed`.
 * byPaymentMethod: total vendido por método (cash/card/transfer/mixed);
 * los métodos sin ventas no aparecen.
 */
export interface PosCashSessionSummary {
  totalSales: number;
  saleCount: number;
  byPaymentMethod: Record<string, number>;
}
