import type { SupabaseClient } from '@supabase/supabase-js';
import type pino from 'pino';
import type { WhatsAppFlowRepository } from '@/domain/ports/WhatsAppFlowRepository';
import type {
  WhatsAppFlow,
  WhatsAppFlowSummary,
  CreateWhatsAppFlowInput,
  UpdateWhatsAppFlowInput,
} from '@/domain/entities/WhatsAppFlow';

/**
 * Fila raw de la tabla whatsapp_flows tal como la devuelve Supabase.
 * Los campos snake_case se mapean a camelCase en el dominio.
 */
interface WhatsAppFlowRow {
  id: string;
  tenant_id: string;
  name: string;
  flow_id_meta: string | null;
  flow_json: Record<string, unknown> | null;
  status: 'draft' | 'active' | 'archived';
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

function rowToEntity(row: WhatsAppFlowRow): WhatsAppFlow {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    flowIdMeta: row.flow_id_meta,
    flowJson: row.flow_json,
    status: row.status,
    createdBy: row.created_by,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function rowToSummary(row: WhatsAppFlowRow): WhatsAppFlowSummary {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    flowIdMeta: row.flow_id_meta,
    status: row.status,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

/**
 * Adapter de WhatsAppFlowRepository contra Supabase (tabla whatsapp_flows).
 * service_role bypasea RLS — uso server-side exclusivo.
 * Toda query filtra explícitamente por tenant_id para aislamiento multi-tenant.
 */
export class SupabaseWhatsAppFlowRepository implements WhatsAppFlowRepository {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly logger: pino.Logger,
  ) {}

  async listByTenant(tenantId: string): Promise<WhatsAppFlowSummary[]> {
    const { data, error } = await this.supabase
      .from('whatsapp_flows')
      .select('id, tenant_id, name, flow_id_meta, status, created_at, updated_at')
      .eq('tenant_id', tenantId)
      .order('updated_at', { ascending: false });

    if (error) {
      this.logger.error({ error, tenantId }, 'SupabaseWhatsAppFlowRepository.listByTenant failed');
      throw new Error(`listByTenant failed: ${error.message}`);
    }

    return (data as WhatsAppFlowRow[]).map(rowToSummary);
  }

  async findById(id: string, tenantId: string): Promise<WhatsAppFlow | null> {
    const { data, error } = await this.supabase
      .from('whatsapp_flows')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (error) {
      this.logger.error({ error, id, tenantId }, 'SupabaseWhatsAppFlowRepository.findById failed');
      throw new Error(`findById failed: ${error.message}`);
    }

    if (!data) return null;
    return rowToEntity(data as WhatsAppFlowRow);
  }

  async create(input: CreateWhatsAppFlowInput): Promise<WhatsAppFlow> {
    const { data, error } = await this.supabase
      .from('whatsapp_flows')
      .insert({
        tenant_id: input.tenantId,
        name: input.name,
        flow_id_meta: input.flowIdMeta ?? null,
        flow_json: input.flowJson ?? null,
        status: 'draft',
        created_by: input.createdBy ?? null,
      })
      .select('*')
      .single();

    if (error) {
      this.logger.error({ error, tenantId: input.tenantId }, 'SupabaseWhatsAppFlowRepository.create failed');
      throw new Error(`create failed: ${error.message}`);
    }

    return rowToEntity(data as WhatsAppFlowRow);
  }

  async update(
    id: string,
    tenantId: string,
    input: UpdateWhatsAppFlowInput,
  ): Promise<WhatsAppFlow | null> {
    // Construir objeto de actualización solo con los campos presentes
    const patch: Record<string, unknown> = {};
    if (input.name !== undefined) patch['name'] = input.name;
    if ('flowIdMeta' in input) patch['flow_id_meta'] = input.flowIdMeta ?? null;
    if ('flowJson' in input) patch['flow_json'] = input.flowJson ?? null;
    if (input.status !== undefined) patch['status'] = input.status;

    if (Object.keys(patch).length === 0) {
      // Nada que actualizar — devolver el registro actual
      return this.findById(id, tenantId);
    }

    const { data, error } = await this.supabase
      .from('whatsapp_flows')
      .update(patch)
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .select('*')
      .maybeSingle();

    if (error) {
      this.logger.error({ error, id, tenantId }, 'SupabaseWhatsAppFlowRepository.update failed');
      throw new Error(`update failed: ${error.message}`);
    }

    if (!data) return null;
    return rowToEntity(data as WhatsAppFlowRow);
  }

  async delete(id: string, tenantId: string): Promise<boolean> {
    const { error, count } = await this.supabase
      .from('whatsapp_flows')
      .delete({ count: 'exact' })
      .eq('id', id)
      .eq('tenant_id', tenantId);

    if (error) {
      this.logger.error({ error, id, tenantId }, 'SupabaseWhatsAppFlowRepository.delete failed');
      throw new Error(`delete failed: ${error.message}`);
    }

    return (count ?? 0) > 0;
  }
}
