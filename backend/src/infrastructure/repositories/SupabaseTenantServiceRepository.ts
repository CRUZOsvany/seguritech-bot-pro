import type { SupabaseClient } from '@supabase/supabase-js';
import type pino from 'pino';
import type {
  TenantServiceRepository,
  TenantService,
  ServiceType,
  ServiceStatus,
} from '@/domain/ports/TenantServiceRepository';

interface ServiceRow {
  id: string;
  tenant_id: string;
  service_type: ServiceType;
  status: ServiceStatus;
  enabled_at: string | null;
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

function mapRow(row: ServiceRow): TenantService {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    serviceType: row.service_type,
    status: row.status,
    enabledAt: row.enabled_at,
    config: row.config ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class SupabaseTenantServiceRepository implements TenantServiceRepository {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly logger: pino.Logger,
  ) {}

  async listByTenant(tenantId: string): Promise<TenantService[]> {
    const { data, error } = await this.supabase
      .from('tenant_services')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: true });

    if (error) {
      this.logger.error({ error, tenantId }, 'listByTenant failed');
      throw new Error(`listByTenant failed: ${error.message}`);
    }
    return (data as ServiceRow[]).map(mapRow);
  }

  async findOne(
    tenantId: string,
    serviceType: ServiceType,
  ): Promise<TenantService | null> {
    const { data, error } = await this.supabase
      .from('tenant_services')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('service_type', serviceType)
      .maybeSingle();

    if (error) {
      this.logger.error({ error, tenantId, serviceType }, 'findOne failed');
      throw new Error(`findOne failed: ${error.message}`);
    }
    return data ? mapRow(data as ServiceRow) : null;
  }

  async enable(
    tenantId: string,
    serviceType: ServiceType,
  ): Promise<TenantService> {
    // Idempotente: si ya existe, lo devolvemos.
    const existing = await this.findOne(tenantId, serviceType);
    if (existing) return existing;

    const { data, error } = await this.supabase
      .from('tenant_services')
      .insert({
        tenant_id: tenantId,
        service_type: serviceType,
        status: 'configuring',
      })
      .select('*')
      .single();

    if (error) {
      this.logger.error({ error, tenantId, serviceType }, 'enable failed');
      throw new Error(`enable failed: ${error.message}`);
    }
    this.logger.info({ tenantId, serviceType }, '✅ Servicio habilitado');
    return mapRow(data as ServiceRow);
  }

  async setStatus(
    tenantId: string,
    serviceType: ServiceType,
    status: ServiceStatus,
  ): Promise<void> {
    const patch: Record<string, unknown> = { status };
    // Al activar por primera vez, sellar enabled_at.
    if (status === 'active') patch.enabled_at = new Date().toISOString();

    const { error } = await this.supabase
      .from('tenant_services')
      .update(patch)
      .eq('tenant_id', tenantId)
      .eq('service_type', serviceType);

    if (error) {
      this.logger.error(
        { error, tenantId, serviceType, status },
        'setStatus failed',
      );
      throw new Error(`setStatus failed: ${error.message}`);
    }
  }

  async findServiceStatus(
    tenantId: string,
    serviceType: ServiceType,
  ): Promise<ServiceStatus | null> {
    const { data, error } = await this.supabase
      .from('tenant_services')
      .select('status')
      .eq('tenant_id', tenantId)
      .eq('service_type', serviceType)
      .maybeSingle();

    if (error) {
      this.logger.error(
        { error, tenantId, serviceType },
        'findServiceStatus failed',
      );
      throw new Error(`findServiceStatus failed: ${error.message}`);
    }
    return data ? (data.status as ServiceStatus) : null;
  }
}
