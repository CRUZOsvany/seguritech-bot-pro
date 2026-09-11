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
 * La venta ya ocurrió cuando llega aquí (la PWA registra local primero y
 * sincroniza después), así que lo que delata un catálogo desactualizado en la
 * laptop NO se rechaza — se registra y se marca `needsReview` con el motivo:
 *   - stock insuficiente (el trigger deja stock_qty negativo)
 *   - producto desactivado después de que la laptop bajó el catálogo
 *   - pago que no cuadra con el total del servidor (el precio cambió)
 * Solo se rechaza lo que no se puede registrar: sin caja válida, carrito
 * vacío o un producto que no existe en el tenant.
 *
 * Idempotente por clientId: un reintento de sincronización devuelve la venta
 * ya registrada sin volver a resolverla.
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

    const reviewReasons: string[] = [];
    const lines = await this.resolveLines(tenantId, input, reviewReasons);

    const subtotal = roundMoney(lines.reduce((acc, l) => acc + l.subtotal, 0));
    const taxTotal = roundMoney(lines.reduce((acc, l) => acc + l.taxAmount, 0));
    const total = roundMoney(subtotal + taxTotal);
    const amountPaid = roundMoney(input.amountPaid);

    if (input.paymentMethod === 'cash') {
      if (amountPaid < total) {
        reviewReasons.push(
          `Pago en efectivo menor al total del servidor (pagó ${money(amountPaid)}, total ${money(total)})`,
        );
      }
    } else if (amountPaid !== total) {
      // Tarjeta/transferencia no dan cambio: una diferencia solo puede venir
      // de un precio distinto al que tenía la laptop.
      reviewReasons.push(
        `Cobro con ${input.paymentMethod === 'card' ? 'tarjeta' : 'transferencia'} distinto al total del servidor (cobró ${money(amountPaid)}, total ${money(total)})`,
      );
    }
    const changeGiven =
      input.paymentMethod === 'cash' ? roundMoney(Math.max(0, amountPaid - total)) : 0;

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
      amountPaid,
      changeGiven,
      needsReview: reviewReasons.length > 0,
      reviewReason: reviewReasons.length > 0 ? reviewReasons.join(' · ') : null,
      lines,
    });
    return { sale, created: true };
  }

  /**
   * Agrupa por producto (escanear dos veces el mismo = una línea con qty 2) y
   * resuelve cada uno contra el catálogo real. El stock se compara contra la
   * cantidad agregada, no por línea suelta.
   */
  private async resolveLines(
    tenantId: string,
    input: NewPosSale,
    reviewReasons: string[],
  ): Promise<ResolvedPosSaleLine[]> {
    const qtyByProduct = new Map<string, number>();
    for (const item of input.items) {
      qtyByProduct.set(item.productId, (qtyByProduct.get(item.productId) ?? 0) + item.quantity);
    }

    const lines: ResolvedPosSaleLine[] = [];
    for (const [productId, quantity] of qtyByProduct) {
      const product = await this.products.findById(tenantId, productId);
      if (!product) {
        throw new PosOperationError('product_not_found', 'Producto no encontrado', { productId });
      }
      if (!product.isActive) {
        reviewReasons.push(`Producto desactivado: ${product.name}`);
      }
      if (product.trackStock && product.stockQty < quantity) {
        reviewReasons.push(
          `Stock insuficiente: ${product.name} (vendido ${quantity}, había ${product.stockQty})`,
        );
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

function money(n: number): string {
  return `$${n.toFixed(2)}`;
}
