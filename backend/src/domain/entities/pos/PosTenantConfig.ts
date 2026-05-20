/**
 * Configuración POS por tenant. Mapeo BD: pos_tenant_config (migración 011).
 *
 * Una fila por tenant que tiene módulo 'pos' habilitado.
 * El campo `mould` apunta al Molde de industria activo (papeleria, ferreteria, etc).
 */
export type PosPrinterConnection = 'usb' | 'network' | 'bluetooth';

export interface PosTenantConfig {
  tenantId: string;
  mould: string;
  businessName: string;
  businessAddress: string | null;
  businessPhone: string | null;
  ticketHeader: string | null;
  ticketFooter: string | null;
  printerModel: string | null;
  printerConnection: PosPrinterConnection | null;
  printerAddress: string | null;
  defaultTaxRate: number;
  currency: string;
  loyaltyEnabled: boolean;
  loyaltyPointsPerPeso: number;
  whatsappTicketEnabled: boolean;
  updatedAt: Date;
}
