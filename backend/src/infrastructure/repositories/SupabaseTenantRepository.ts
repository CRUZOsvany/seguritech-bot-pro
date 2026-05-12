import type { SupabaseClient } from '@supabase/supabase-js';
import type pino from 'pino';
import type { TenantRepository, TenantSummary } from '@/domain/ports/TenantRepository';

/**
 * Implementación Supabase del TenantRepository.
 *
 * findAll(): dos queries en paralelo (tenants + bot_flows activos) para
 * determinar has_active_flow sin JOIN nativo (limitación del JS client).
 */
export class SupabaseTenantRepository implements TenantRepository {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly logger: pino.Logger,
  ) {}

  async findAll(): Promise<TenantSummary[]> {
    const [tenantsRes, flowsRes] = await Promise.all([
      this.supabase
        .from('tenants')
        .select('id, nombre_negocio, giro, status, webhook_verified')
        .order('nombre_negocio'),
      this.supabase
        .from('bot_flows')
        .select('tenant_id')
        .eq('is_active', true),
    ]);

    if (tenantsRes.error) {
      this.logger.error({ error: tenantsRes.error }, 'SupabaseTenantRepository.findAll failed');
      throw new Error(`findAll failed: ${tenantsRes.error.message}`);
    }

    const activeFlowTenants = new Set(
      (flowsRes.data ?? []).map((r: { tenant_id: string }) => r.tenant_id),
    );

    return (tenantsRes.data ?? []).map((t: any) => ({
      id: t.id,
      nombre_negocio: t.nombre_negocio,
      giro: t.giro,
      status: t.status,
      webhook_verified: t.webhook_verified ?? false,
      has_active_flow: activeFlowTenants.has(t.id),
    }));
  }

  async findById(id: string): Promise<TenantSummary | null> {
    const [tenantRes, flowRes] = await Promise.all([
      this.supabase
        .from('tenants')
        .select('id, nombre_negocio, giro, status, webhook_verified')
        .eq('id', id)
        .maybeSingle(),
      this.supabase
        .from('bot_flows')
        .select('id')
        .eq('tenant_id', id)
        .eq('is_active', true)
        .maybeSingle(),
    ]);

    if (tenantRes.error) {
      this.logger.error({ error: tenantRes.error, id }, 'findById failed');
      throw new Error(`findById failed: ${tenantRes.error.message}`);
    }

    if (!tenantRes.data) return null;

    const t = tenantRes.data as any;
    return {
      id: t.id,
      nombre_negocio: t.nombre_negocio,
      giro: t.giro,
      status: t.status,
      webhook_verified: t.webhook_verified ?? false,
      has_active_flow: !!flowRes.data,
    };
  }

  async setStatus(id: string, status: 'active' | 'paused'): Promise<void> {
    const { error } = await this.supabase
      .from('tenants')
      .update({ status })
      .eq('id', id);

    if (error) {
      this.logger.error({ error, id, status }, 'setStatus failed');
      throw new Error(`setStatus failed: ${error.message}`);
    }

    this.logger.info({ id, status }, '[SupabaseTenantRepository] status actualizado');
  }
}
