/**
 * Puerto: facturación electrónica (CFDI México).
 *
 * Punto de extensión declarado desde día 1 para evitar refactor cuando entre
 * Facturama (o cualquier proveedor). En Sprint 5.1a la impl es NoOpInvoicing
 * (devuelve un stub no-cfdi). Cuando un tenant pague por facturar, se inyecta
 * una impl real sin tocar dominio.
 *
 * IMPORTANTE: el dominio NO depende de Facturama. Solo de este puerto.
 */

export interface InvoicingRequest {
  tenantId: string;
  saleId: string;
  total: number;
  /** RFC del receptor, formato XAXX010101000 para público en general. */
  receiverRfc: string;
  receiverName?: string;
  /** Uso CFDI ('G03' = gastos en general por defecto). */
  cfdiUse?: string;
  items: Array<{
    productSku: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    /** Clave producto SAT. Si falta, la impl real puede inferir o rechazar. */
    satCode?: string;
  }>;
}

export interface InvoicingResult {
  /** true = se generó CFDI. false = el puerto está en modo no-op. */
  invoiced: boolean;
  uuid?: string;
  pdfUrl?: string;
  xmlUrl?: string;
  errorMessage?: string;
}

export interface InvoicingPort {
  isEnabled(tenantId: string): Promise<boolean>;
  invoice(request: InvoicingRequest): Promise<InvoicingResult>;
}
