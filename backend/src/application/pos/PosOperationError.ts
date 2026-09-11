/**
 * Error tipado de operación POS (caja y ventas). El router mapea cada code a
 * un HTTP status — los casos de uso no conocen HTTP.
 *
 * Para el cliente offline la distinción importa: un 4xx es definitivo (se
 * muestra al cajero, no se reintenta); un 5xx o fallo de red se reintenta.
 *
 * code mapping en PosRouter:
 *   'session_not_found' | 'product_not_found'                     → 404
 *   'session_not_owned'                                           → 403
 *   'session_closed' | 'session_already_open'                     → 409
 *   'empty_cart'                                                  → 400
 *
 * Stock insuficiente, producto desactivado o pago que no cuadra NO son
 * errores: la venta se registra con needs_review (ver RegisterSaleUseCase).
 */
export type PosOperationErrorCode =
  | 'session_not_found'
  | 'session_not_owned'
  | 'session_closed'
  | 'session_already_open'
  | 'product_not_found'
  | 'empty_cart';

export class PosOperationError extends Error {
  public readonly code: PosOperationErrorCode;
  public readonly details?: Record<string, unknown>;

  constructor(code: PosOperationErrorCode, message?: string, details?: Record<string, unknown>) {
    super(message ?? code);
    this.name = 'PosOperationError';
    this.code = code;
    this.details = details;
  }
}

/** Redondeo monetario a centavos — numeric(10,2) en BD. */
export function roundMoney(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
