import type { PosSaleRepository } from '@/domain/ports/pos/PosSaleRepository';
import type { PosCashSessionRepository } from '@/domain/ports/pos/PosCashSessionRepository';
import type { PosProductRepository } from '@/domain/ports/pos/PosProductRepository';
import type {
  NewPosSale,
  PosSale,
  ResolvedPosSaleLine,
} from '@/domain/entities/pos/Sale';
import { PosOperationError, roundMoney } from './PosOperationError';

/**
 * Registra una venta (POS Lite, T-04).
 *
 * Del cliente solo se toma productId + quantity por línea. Precio, nombre,
 * sku e impuesto salen de pos_products en el servidor — nunca del body.
 *
 * Aritmética (impuesto aditivo; con tax_rate=0, el caso del piloto, da igual):
 *   línea.subtotal   = unit_price × quantity
 *   línea.taxAmount  = línea.subtotal × tax_rate / 100
 *   venta.total      = Σ subtotal + Σ taxAmount
 *
 * ticketNumber: contador secuencial dentro de la sesión de caja (001, 002…).
 * Lo asigna el servidor porque el contrato de POST /sales no lo trae.
 *
 * Idempotente por clientId: un reintento de sincronización devuelve la venta
 * ya registrada ANTES de validar stock — si no, el reintento de la venta del
 * último artículo fallaría por el stock que ella misma descontó.
 *
 * No toca stock ni pos_inventory_movements: los triggers de pos_sale_items
 * (migración 011) lo hacen al insertar las líneas.
 */
export class RegisterSaleUseCase {
  constructor(
    private readonly sales: PosSaleRepository,
    private readonly cashSessions: PosCashSessionRepository,
    private readonly products: PosProductRepository,
  ) {}

  async execute(params: {
    tenantId: string;
    cashierId: string;
    input: NewPosSale;
  }): Promise<{ sale: PosSale; created: boolean }> {
    const { tenantId, cashierId, input } = params;

    const replay = await this.sales.findByClientId(tenantId, input.clientId);
    // Una cabecera sin líneas es un intento previo que se cortó a medias; el
    // repositorio la completa en create(). Solo una venta completa es replay.
    if (replay && replay.items.length > 0) {
      if (replay.cashierId !== cashierId) {
        throw new PosOperationError('session_not_owned', 'Esa venta pertenece a otro cajero');
      }
      return { sale: replay, created: false };
    }

    if (input.items.length === 0) {
      throw new PosOperationError('empty_cart', 'La venta no tiene productos');
    }

    const session = await this.cashSessions.findById(tenantId, input.cashSessionId);
    if (!session) {
      throw new PosOperationError('session_not_found', 'Caja no encontrada');
    }
    if (session.cashierId !== cashierId) {
      throw new PosOperationError('session_not_owned', 'Esa caja pertenece a otro cajero');
    }
    if (session.status !== 'open') {
      throw new PosOperationError('session_closed', 'La caja está cerrada; ábrela para vender');
    }

    const lines = await this.resolveLines(tenantId, input);

    const subtotal = roundMoney(lines.reduce((acc, l) => acc + l.subtotal, 0));
    const taxTotal = roundMoney(lines.reduce((acc, l) => acc + l.taxAmount, 0));
    const total = roundMoney(subtotal + taxTotal);

    if (input.paymentMethod === 'cash') {
      if (input.amountPaid < total) {
        throw new PosOperationError('insufficient_payment', 'El pago no cubre el total', {
          total,
          amountPaid: input.amountPaid,
        });
      }
    } else if (roundMoney(input.amountPaid) !== total) {
      // Tarjeta/transferencia no dan cambio: si amount_paid ≠ total, el cambio
      // saldría del cajón y el arqueo no cuadraría.
      throw new PosOperationError('invalid_payment', 'Con tarjeta o transferencia el pago debe ser exacto', {
        total,
        amountPaid: input.amountPaid,
      });
    }
    const changeGiven = roundMoney(input.amountPaid - total);

    const count = await this.sales.countByCashSession(tenantId, input.cashSessionId);
    const ticketNumber = String(count + 1).padStart(3, '0');

    const sale = await this.sales.create(tenantId, cashierId, {
      clientId: input.clientId,
      cashSessionId: input.cashSessionId,
      ticketNumber,
      subtotal,
      taxTotal,
      discountTotal: 0,
      total,
      paymentMethod: input.paymentMethod,
      amountPaid: input.amountPaid,
      changeGiven,
      lines,
    });
    return { sale, created: true };
  }

  /**
   * Agrupa por producto (escanear dos veces el mismo = una línea con qty 2) y
   * resuelve cada uno contra el catálogo real. Valida stock sobre la cantidad
   * agregada, no por línea suelta.
   */
  private async resolveLines(tenantId: string, input: NewPosSale): Promise<ResolvedPosSaleLine[]> {
    const qtyByProduct = new Map<string, number>();
    for (const item of input.items) {
      qtyByProduct.set(item.productId, (qtyByProduct.get(item.productId) ?? 0) + item.quantity);
    }

    const lines: ResolvedPosSaleLine[] = [];
    for (const [productId, quantity] of qtyByProduct) {
      const product = await this.products.findById(tenantId, productId);
      if (!product || !product.isActive) {
        throw new PosOperationError('product_not_found', 'Producto no encontrado', { productId });
      }
      if (product.trackStock && product.stockQty < quantity) {
        throw new PosOperationError('insufficient_stock', `Stock insuficiente de ${product.name}`, {
          productId,
          requested: quantity,
          available: product.stockQty,
        });
      }

      const lineSubtotal = roundMoney(product.unitPrice * quantity);
      lines.push({
        productId,
        quantity,
        unitPrice: product.unitPrice,
        discount: 0,
        taxAmount: roundMoney((lineSubtotal * product.taxRate) / 100),
        subtotal: lineSubtotal,
        productName: product.name,
        productSku: product.sku,
      });
    }
    return lines;
  }
}
