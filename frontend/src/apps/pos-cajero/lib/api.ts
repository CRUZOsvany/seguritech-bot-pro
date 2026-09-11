/**
 * Cliente HTTP de la caja contra /api/pos y /api/auth/pos-*.
 *
 * No reutiliza apiFetch del panel a propósito: aquel redirige a /app/login en
 * un 401, y la caja tiene que seguir funcionando offline con su cola local.
 * Aquí un 401 es solo un error más que la cola interpreta ("hay que volver a
 * entrar para sincronizar").
 */
import type { PaymentMethod } from './db';

export class PosApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly details?: Record<string, unknown>;

  constructor(status: number, message: string, code?: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'PosApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export interface CashierUser {
  id: string;
  displayName: string;
  role: 'pos_cashier' | 'pos_manager';
  tenantId: string;
}

/** Sesión de caja tal como la devuelve el servidor (fechas en ISO). */
export interface ServerCashSession {
  id: string;
  cashierId: string;
  openedAt: string;
  closedAt: string | null;
  openingAmount: number;
  closingAmount: number | null;
  expectedAmount: number | null;
  difference: number | null;
  status: 'open' | 'closed';
  clientId: string;
}

export interface ServerSale {
  id: string;
  ticketNumber: string;
  total: number;
  changeGiven: number;
  needsReview: boolean;
  reviewReason: string | null;
}

export interface CashSummary {
  totalSales: number;
  saleCount: number;
  byPaymentMethod: Record<string, number>;
}

export interface ServerProduct {
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
  isActive: boolean;
}

type Method = 'GET' | 'POST' | 'PATCH';

async function posFetch<T>(method: Method, url: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      credentials: 'same-origin',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    throw new PosApiError(0, `Sin conexión: ${(err as Error).message}`);
  }

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* sin body o no-JSON */
  }

  if (!res.ok) {
    const err = (data ?? {}) as { error?: unknown; code?: unknown; details?: unknown };
    throw new PosApiError(
      res.status,
      typeof err.error === 'string' ? err.error : `HTTP ${res.status}`,
      typeof err.code === 'string' ? err.code : undefined,
      err.details && typeof err.details === 'object' ? (err.details as Record<string, unknown>) : undefined,
    );
  }
  return data as T;
}

export interface OpenSessionBody {
  clientId: string;
  openingAmount: number;
}

export interface RegisterSaleBody {
  clientId: string;
  cashSessionId: string;
  items: Array<{ productId: string; quantity: number }>;
  paymentMethod: PaymentMethod;
  amountPaid: number;
}

/** Lo que usa la cola de sincronización — separado para poder simularlo en tests. */
export interface SyncApi {
  openSession(body: OpenSessionBody): Promise<{ session: ServerCashSession }>;
  registerSale(body: RegisterSaleBody): Promise<{ sale: ServerSale }>;
  closeSession(
    id: string,
    body: { closingAmount: number },
  ): Promise<{ session: ServerCashSession; summary: CashSummary }>;
  currentSession(): Promise<{ session: ServerCashSession | null }>;
}

export const posApi = {
  login: (tenantId: string, name: string, pin: string) =>
    posFetch<{ ok: true; user: CashierUser }>('POST', '/api/auth/pos-login', { tenantId, name, pin }),
  logout: () => posFetch<{ ok: true }>('POST', '/api/auth/pos-logout'),
  products: (limit: number, offset: number) =>
    posFetch<{ products: ServerProduct[] }>('GET', `/api/pos/products?limit=${limit}&offset=${offset}`),
  summary: (sessionId: string) =>
    posFetch<{ session: ServerCashSession; summary: CashSummary }>(
      'GET',
      `/api/pos/cash-sessions/${sessionId}/summary`,
    ),
  currentSession: () =>
    posFetch<{ session: ServerCashSession | null }>('GET', '/api/pos/cash-sessions/current'),
  openSession: (body: OpenSessionBody) =>
    posFetch<{ session: ServerCashSession }>('POST', '/api/pos/cash-sessions', body),
  registerSale: (body: RegisterSaleBody) =>
    posFetch<{ sale: ServerSale }>('POST', '/api/pos/sales', body),
  closeSession: (id: string, body: { closingAmount: number }) =>
    posFetch<{ session: ServerCashSession; summary: CashSummary }>(
      'PATCH',
      `/api/pos/cash-sessions/${id}/close`,
      body,
    ),
} satisfies SyncApi & Record<string, unknown>;
