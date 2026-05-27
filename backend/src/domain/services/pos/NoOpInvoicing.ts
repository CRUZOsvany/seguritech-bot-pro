import type {
  InvoicingPort,
  InvoicingRequest,
  InvoicingResult,
} from '@/domain/ports/pos/InvoicingPort';

/**
 * Implementación no-op del puerto de facturación.
 *
 * Sprint 5.1a — todavía no facturamos CFDI. Cuando un tenant pague por
 * facturación, se sustituye esta clase por FacturamaInvoicing (u otra) en
 * ApplicationContainer.
 *
 * isEnabled() siempre false. invoice() devuelve invoiced=false sin error.
 */
export class NoOpInvoicing implements InvoicingPort {
  async isEnabled(_tenantId: string): Promise<boolean> {
    return false;
  }

  async invoice(_request: InvoicingRequest): Promise<InvoicingResult> {
    return {
      invoiced: false,
      errorMessage: 'Invoicing not enabled — NoOpInvoicing active',
    };
  }
}
