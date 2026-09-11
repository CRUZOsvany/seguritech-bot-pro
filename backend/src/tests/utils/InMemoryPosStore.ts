import { randomUUID } from 'crypto';
import type { PosProduct } from '@/domain/entities/pos/Product';
import type { PosSale, ResolvedPosSale } from '@/domain/entities/pos/Sale';
import type {
  CloseCashSessionPatch,
  NewPosCashSession,
  PosCashSession,
  PosCashSessionSummary,
} from '@/domain/entities/pos/CashSession';
import type { PosSaleRepository } from '@/domain/ports/pos/PosSaleRepository';
import type { PosCashSessionRepository } from '@/domain/ports/pos/PosCashSessionRepository';
import type { PosProductRepository } from '@/domain/ports/pos/PosProductRepository';

/**
 * Store en memoria del POS para tests de casos de uso y router.
 *
 * Emula lo que en Supabase hacen las constraints y los triggers:
 *   - UNIQUE(tenant_id, client_id) en pos_sales y pos_cash_sessions
 *   - pos_decrement_stock_on_sale_item (solo track_stock=true)
 * así los tests pueden verificar que el código NO descuenta stock a mano y
 * que un reintento no lo descuenta dos veces.
 */
export class InMemoryPosStore {
  readonly products = new Map<string, PosProduct>();
  readonly sessions = new Map<string, PosCashSession>();
  readonly sales = new Map<string, PosSale>();

  addProduct(p: PosProduct): PosProduct {
    this.products.set(p.id, p);
    return p;
  }

  productRepo(): PosProductRepository {
    return {
      findById: async (tenantId: string, id: string) => {
        const p = this.products.get(id);
        return p && p.tenantId === tenantId ? { ...p } : null;
      },
    } as unknown as PosProductRepository;
  }

  sessionRepo(): PosCashSessionRepository {
    const store = this;
    return {
      async open(tenantId: string, cashierId: string, s: NewPosCashSession) {
        const existing = await this.findByClientId(tenantId, s.clientId);
        if (existing) return existing;
        const session: PosCashSession = {
          id: randomUUID(),
          tenantId,
          cashierId,
          openedAt: new Date(),
          closedAt: null,
          openingAmount: s.openingAmount,
          closingAmount: null,
          expectedAmount: null,
          difference: null,
          notes: null,
          status: 'open',
          clientId: s.clientId,
          syncedAt: new Date(),
        };
        store.sessions.set(session.id, session);
        return { ...session };
      },
      async findById(tenantId: string, id: string) {
        const s = store.sessions.get(id);
        return s && s.tenantId === tenantId ? { ...s } : null;
      },
      async findByClientId(tenantId: string, clientId: string) {
        const s = [...store.sessions.values()].find(
          (x) => x.tenantId === tenantId && x.clientId === clientId,
        );
        return s ? { ...s } : null;
      },
      async findOpenByCashier(tenantId: string, cashierId: string) {
        const s = [...store.sessions.values()].find(
          (x) => x.tenantId === tenantId && x.cashierId === cashierId && x.status === 'open',
        );
        return s ? { ...s } : null;
      },
      async close(tenantId: string, id: string, patch: CloseCashSessionPatch) {
        const s = store.sessions.get(id);
        if (!s || s.tenantId !== tenantId) throw new Error('not found');
        const closed: PosCashSession = {
          ...s,
          ...patch,
          status: 'closed',
          closedAt: new Date(),
        };
        store.sessions.set(id, closed);
        return { ...closed };
      },
      async getSummary(tenantId: string, id: string): Promise<PosCashSessionSummary> {
        const summary: PosCashSessionSummary = { totalSales: 0, saleCount: 0, byPaymentMethod: {} };
        for (const sale of store.sales.values()) {
          if (sale.tenantId !== tenantId || sale.cashSessionId !== id || sale.status !== 'completed') {
            continue;
          }
          summary.totalSales += sale.total;
          summary.saleCount += 1;
          summary.byPaymentMethod[sale.paymentMethod] =
            (summary.byPaymentMethod[sale.paymentMethod] ?? 0) + sale.total;
        }
        return summary;
      },
    };
  }

  saleRepo(): PosSaleRepository {
    const store = this;
    return {
      async create(tenantId: string, cashierId: string, r: ResolvedPosSale) {
        const existing = await this.findByClientId(tenantId, r.clientId);
        if (existing) return existing;
        const id = randomUUID();
        const sale: PosSale = {
          id,
          tenantId,
          cashSessionId: r.cashSessionId,
          cashierId,
          ticketNumber: r.ticketNumber,
          subtotal: r.subtotal,
          taxTotal: r.taxTotal,
          discountTotal: r.discountTotal,
          total: r.total,
          paymentMethod: r.paymentMethod,
          amountPaid: r.amountPaid,
          changeGiven: r.changeGiven,
          customerPhone: null,
          customerId: null,
          status: 'completed',
          notes: null,
          createdAt: new Date(),
          clientId: r.clientId,
          syncedAt: new Date(),
          needsReview: r.needsReview,
          reviewReason: r.reviewReason,
          items: r.lines.map((l) => ({ ...l, id: randomUUID(), saleId: id })),
        };
        store.sales.set(id, sale);
        // Emula trg_pos_decrement_stock_on_sale_item.
        for (const l of r.lines) {
          const p = store.products.get(l.productId);
          if (p && p.trackStock) p.stockQty -= l.quantity;
        }
        return sale;
      },
      async findByClientId(tenantId: string, clientId: string) {
        return (
          [...store.sales.values()].find((s) => s.tenantId === tenantId && s.clientId === clientId) ??
          null
        );
      },
      async listByCashSession(tenantId: string, cashSessionId: string) {
        return [...store.sales.values()].filter(
          (s) => s.tenantId === tenantId && s.cashSessionId === cashSessionId,
        );
      },
      async countByCashSession(tenantId: string, cashSessionId: string) {
        return (await this.listByCashSession(tenantId, cashSessionId)).length;
      },
    };
  }
}

export function fakePosProduct(over: Partial<PosProduct> = {}): PosProduct {
  return {
    id: randomUUID(),
    tenantId: '00000000-0000-0000-0000-000000000001',
    sku: 'LAP-001',
    barcode: null,
    name: 'Lápiz Mirado',
    description: null,
    categoryId: null,
    unitType: 'piece',
    unitPrice: 5,
    costPrice: 2.5,
    taxRate: 0,
    stockQty: 100,
    stockMin: 10,
    trackStock: true,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  };
}
