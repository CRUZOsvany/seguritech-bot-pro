import type { SupabaseClient } from '@supabase/supabase-js';
import type pino from 'pino';
import type { BotFlow } from '@/domain/entities/flow';
import { BotFlowRepository } from '@/domain/ports/BotFlowRepository';
import { validateFlow } from '@/domain/validators/flowSchema';

/**
 * Adapter de BotFlowRepository contra Supabase.
 * service_role bypasea RLS — uso server-side exclusivo.
 */
export class SupabaseBotFlowRepository implements BotFlowRepository {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly logger: pino.Logger,
  ) {}

  async findActiveByTenant(tenantId: string): Promise<BotFlow | null> {
    const { data, error } = await this.supabase
      .from('bot_flows')
      .select('json_definition')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .maybeSingle();

    if (error) {
      this.logger.error({ error, tenantId }, 'findActiveByTenant failed');
      throw new Error(`findActiveByTenant failed: ${error.message}`);
    }
    if (!data) return null;
    return data.json_definition as BotFlow;
  }

  async cloneFromTemplate(tenantId: string, templateSlug: string): Promise<BotFlow> {
    const { data: tmpl, error: tmplErr } = await this.supabase
      .from('flow_templates')
      .select('id, json_definition')
      .eq('slug', templateSlug)
      .maybeSingle();

    if (tmplErr) {
      this.logger.error({ tmplErr, templateSlug }, 'cloneFromTemplate: load template failed');
      throw new Error(`No se pudo cargar template ${templateSlug}: ${tmplErr.message}`);
    }
    if (!tmpl) {
      throw new Error(`Template "${templateSlug}" no existe`);
    }

    const flow = validateFlow(tmpl.json_definition);

    const { data: existing } = await this.supabase
      .from('bot_flows')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .maybeSingle();

    if (existing) {
      throw new Error(
        `Tenant ${tenantId} ya tiene un bot_flow activo (${existing.id}). Desactívalo primero.`,
      );
    }

    const { error: insErr } = await this.supabase.from('bot_flows').insert({
      tenant_id: tenantId,
      nombre: 'Flujo principal',
      json_definition: flow,
      is_active: true,
      source_template_id: tmpl.id,
      version: '1.0',
    });

    if (insErr) {
      this.logger.error({ insErr, tenantId, templateSlug }, 'cloneFromTemplate: insert failed');
      throw new Error(`Insert bot_flow failed: ${insErr.message}`);
    }

    this.logger.info(
      { tenantId, templateSlug },
      '[SupabaseBotFlowRepository] flow clonado desde template',
    );
    return flow;
  }

  async upsert(params: {
    id?: string;
    tenantId: string;
    nombre: string;
    flow: BotFlow;
    sourceTemplateId?: string | null;
  }): Promise<{ id: string }> {
    const validated = validateFlow(params.flow);

    if (params.id) {
      const { error } = await this.supabase
        .from('bot_flows')
        .update({
          nombre: params.nombre,
          json_definition: validated,
          source_template_id: params.sourceTemplateId ?? null,
        })
        .eq('id', params.id)
        .eq('tenant_id', params.tenantId);

      if (error) {
        this.logger.error({ error, id: params.id }, 'upsert failed');
        throw new Error(`upsert failed: ${error.message}`);
      }
      return { id: params.id };
    }

    const { data, error } = await this.supabase
      .from('bot_flows')
      .insert({
        tenant_id: params.tenantId,
        nombre: params.nombre,
        json_definition: validated,
        is_active: true,
        source_template_id: params.sourceTemplateId ?? null,
        version: '1.0',
      })
      .select('id')
      .single();

    if (error || !data) {
      this.logger.error({ error, tenantId: params.tenantId }, 'upsert insert failed');
      throw new Error(`upsert insert failed: ${error?.message ?? 'unknown'}`);
    }
    return { id: data.id };
  }

  async deactivateForTenant(tenantId: string): Promise<void> {
    const { error } = await this.supabase
      .from('bot_flows')
      .update({ is_active: false })
      .eq('tenant_id', tenantId)
      .eq('is_active', true);

    if (error) {
      this.logger.error({ error, tenantId }, 'deactivateForTenant failed');
      throw new Error(`deactivateForTenant failed: ${error.message}`);
    }
    this.logger.info({ tenantId }, '[SupabaseBotFlowRepository] flow desactivado');
  }

  async listTemplates(): Promise<Array<{
    slug: string;
    giro: string;
    nombre: string;
    descripcion: string | null;
  }>> {
    const { data, error } = await this.supabase
      .from('flow_templates')
      .select('slug, giro, nombre, descripcion')
      .order('giro');

    if (error) {
      this.logger.error({ error }, 'listTemplates failed');
      throw new Error(`listTemplates failed: ${error.message}`);
    }
    return data ?? [];
  }
}