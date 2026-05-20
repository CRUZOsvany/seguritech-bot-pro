import type { SupabaseClient } from '@supabase/supabase-js';
import type pino from 'pino';
import type { PosTenantConfigRepository } from '@/domain/ports/pos/PosTenantConfigRepository';
import type {
  PosTenantConfig,
  PosPrinterConnection,
} from '@/domain/entities/pos/PosTenantConfig';

/**
 * Implementación Supabase del PosTenantConfigRepository.
 *
 * Sprint 5.1a: solo getByTenant. Updates en 5.2.
 */
export class SupabasePosTenantConfigRepository implements PosTenantConfigRepository {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly logger: pino.Logger,
  ) {}

  async getByTenant(tenantId: string): Promise<PosTenantConfig | null> {
    const { data, error } = await this.supabase
      .from('pos_tenant_config')
      .select('*')
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (error) {
      this.logger.error({ error, tenantId }, 'pos.config.getByTenant failed');
      throw new Error(`pos.config.getByTenant failed: ${error.message}`);
    }
    return data ? mapRow(data) : null;
  }
}

function mapRow(row: Record<string, unknown>): PosTenantConfig {
  return {
    tenantId: row.tenant_id as string,
    mould: row.mould as string,
    businessName: row.business_name as string,
    businessAddress: (row.business_address as string | null) ?? null,
    businessPhone: (row.business_phone as string | null) ?? null,
    ticketHeader: (row.ticket_header as string | null) ?? null,
    ticketFooter: (row.ticket_footer as string | null) ?? null,
    printerModel: (row.printer_model as string | null) ?? null,
    printerConnection: (row.printer_connection as PosPrinterConnection | null) ?? null,
    printerAddress: (row.printer_address as string | null) ?? null,
    defaultTaxRate: Number(row.default_tax_rate),
    currency: row.currency as string,
    loyaltyEnabled: row.loyalty_enabled as boolean,
    loyaltyPointsPerPeso: Number(row.loyalty_points_per_peso),
    whatsappTicketEnabled: row.whatsapp_ticket_enabled as boolean,
    updatedAt: new Date(row.updated_at as string),
  };
}
