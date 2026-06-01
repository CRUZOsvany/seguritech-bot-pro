import type { SupabaseClient } from '@supabase/supabase-js';
import type pino from 'pino';
import type { BotFlow } from '@/domain/entities/flow';
import { BotFlowRepository, BotFlowChannel } from '@/domain/ports/BotFlowRepository';
import { validateFlow } from '@/domain/validators/flowSchema';

/**
 * created_by es columna UUID (FK a admin_users). Las sesiones no-cookie
 * (x-api-key → sub='cli', Cloudflare Access → sub='') traen un sub que NO es
 * UUID; insertarlo revienta el INSERT. Sanitizamos a null en esos casos.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const toUuidOrNull = (id: string | null): string | null =>
  id && UUID_RE.test(id) ? id : null;

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

  // ==========================================================================
  // Bloque A1 — draft / publish / rollback (versionado activo)
  // ==========================================================================

  async listFlowsByTenant(tenantId: string): Promise<Array<{
    id: string;
    channel: BotFlowChannel;
    nombre: string;
    isActive: boolean;
    hasDraft: boolean;
    updatedAt: string;
  }>> {
    const { data, error } = await this.supabase
      .from('bot_flows')
      .select('id, channel, nombre, is_active, draft_json, updated_at')
      .eq('tenant_id', tenantId)
      .order('updated_at', { ascending: false });

    if (error) {
      this.logger.error({ error, tenantId }, 'listFlowsByTenant failed');
      throw new Error(`listFlowsByTenant failed: ${error.message}`);
    }
    return (data ?? []).map((r) => ({
      id: r.id as string,
      channel: (r.channel ?? 'whatsapp') as BotFlowChannel,
      nombre: r.nombre as string,
      isActive: r.is_active as boolean,
      hasDraft: r.draft_json != null,
      updatedAt: r.updated_at as string,
    }));
  }

  async getDraft(flowId: string, tenantId: string): Promise<unknown | null> {
    const { data, error } = await this.supabase
      .from('bot_flows')
      .select('draft_json')
      .eq('id', flowId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (error) {
      this.logger.error({ error, flowId, tenantId }, 'getDraft failed');
      throw new Error(`getDraft failed: ${error.message}`);
    }
    if (!data) return null;
    return data.draft_json ?? null;
  }

  async saveDraft(params: { flowId: string; tenantId: string; flow: unknown }): Promise<void> {
    const { error } = await this.supabase
      .from('bot_flows')
      .update({
        draft_json: params.flow,
        draft_updated_at: new Date().toISOString(),
      })
      .eq('id', params.flowId)
      .eq('tenant_id', params.tenantId);

    if (error) {
      this.logger.error({ error, flowId: params.flowId }, 'saveDraft failed');
      throw new Error(`saveDraft failed: ${error.message}`);
    }
  }

  async publishDraft(params: {
    flowId: string;
    tenantId: string;
    createdBy: string | null;
    note?: string;
  }): Promise<{ versionNumber: number }> {
    const { flowId, tenantId, createdBy, note } = params;

    // 1. Leer draft + channel del flow.
    const { data: row, error: readErr } = await this.supabase
      .from('bot_flows')
      .select('draft_json, channel')
      .eq('id', flowId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (readErr) {
      this.logger.error({ readErr, flowId }, 'publishDraft: read failed');
      throw new Error(`publishDraft read failed: ${readErr.message}`);
    }
    if (!row) {
      throw new Error(`Flow "${flowId}" no existe para el tenant "${tenantId}"`);
    }
    if (row.draft_json == null) {
      throw new Error(`Flow "${flowId}" no tiene draft para publicar`);
    }

    // 2. Validar (deja propagar FlowValidationError con detalle Meta).
    const flow = validateFlow(row.draft_json);

    // 3. Calcular siguiente version_number e insertar la versión.
    //    NOTA: supabase-js no da transacción multi-statement. Insertamos la
    //    versión ANTES de activar; si activar falla, la fila de versión queda
    //    huérfana pero inocua (el historial nunca pierde, solo puede sobrar).
    const versionNumber = await this.nextVersionNumber(flowId);
    const { error: insErr } = await this.supabase.from('bot_flow_versions').insert({
      tenant_id: tenantId,
      flow_id: flowId,
      version_number: versionNumber,
      flow_json: flow,
      created_by: toUuidOrNull(createdBy),
      note: note ?? null,
    });
    if (insErr) {
      this.logger.error({ insErr, flowId, versionNumber }, 'publishDraft: insert version failed');
      throw new Error(`publishDraft insert version failed: ${insErr.message}`);
    }

    // 4. Activar este flow (desactiva hermanos del mismo channel) y limpiar draft.
    await this.setActiveFlow({
      flowId,
      tenantId,
      channel: (row.channel ?? 'whatsapp') as BotFlowChannel,
      flow,
      clearDraft: true,
    });

    this.logger.info({ flowId, tenantId, versionNumber }, '[SupabaseBotFlowRepository] draft publicado');
    return { versionNumber };
  }

  async listVersions(flowId: string, tenantId: string): Promise<Array<{
    id: string;
    versionNumber: number;
    createdAt: string;
    createdBy: string | null;
    note: string | null;
  }>> {
    const { data, error } = await this.supabase
      .from('bot_flow_versions')
      .select('id, version_number, created_at, created_by, note')
      .eq('flow_id', flowId)
      .eq('tenant_id', tenantId)
      .order('version_number', { ascending: false });

    if (error) {
      this.logger.error({ error, flowId }, 'listVersions failed');
      throw new Error(`listVersions failed: ${error.message}`);
    }
    return (data ?? []).map((r) => ({
      id: r.id as string,
      versionNumber: r.version_number as number,
      createdAt: r.created_at as string,
      createdBy: (r.created_by ?? null) as string | null,
      note: (r.note ?? null) as string | null,
    }));
  }

  async getVersionFlow(versionId: string, tenantId: string): Promise<BotFlow | null> {
    const { data, error } = await this.supabase
      .from('bot_flow_versions')
      .select('flow_json')
      .eq('id', versionId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (error) {
      this.logger.error({ error, versionId }, 'getVersionFlow failed');
      throw new Error(`getVersionFlow failed: ${error.message}`);
    }
    if (!data) return null;
    return data.flow_json as BotFlow;
  }

  async rollback(params: {
    flowId: string;
    tenantId: string;
    versionNumber: number;
    createdBy: string | null;
  }): Promise<{ versionNumber: number }> {
    const { flowId, tenantId, versionNumber, createdBy } = params;

    // 1. Leer el flow_json de la versión histórica objetivo.
    const { data: ver, error: verErr } = await this.supabase
      .from('bot_flow_versions')
      .select('flow_json')
      .eq('flow_id', flowId)
      .eq('tenant_id', tenantId)
      .eq('version_number', versionNumber)
      .maybeSingle();

    if (verErr) {
      this.logger.error({ verErr, flowId, versionNumber }, 'rollback: read version failed');
      throw new Error(`rollback read version failed: ${verErr.message}`);
    }
    if (!ver) {
      throw new Error(`Versión ${versionNumber} no existe para el flow "${flowId}"`);
    }
    const flow = ver.flow_json as BotFlow;

    // 2. channel del flow (para desactivar hermanos al activar).
    const { data: row, error: rowErr } = await this.supabase
      .from('bot_flows')
      .select('channel')
      .eq('id', flowId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (rowErr) {
      this.logger.error({ rowErr, flowId }, 'rollback: read flow failed');
      throw new Error(`rollback read flow failed: ${rowErr.message}`);
    }
    if (!row) {
      throw new Error(`Flow "${flowId}" no existe para el tenant "${tenantId}"`);
    }

    // 3. Append inmutable: nueva versión con el contenido viejo.
    const newVersion = await this.nextVersionNumber(flowId);
    const { error: insErr } = await this.supabase.from('bot_flow_versions').insert({
      tenant_id: tenantId,
      flow_id: flowId,
      version_number: newVersion,
      flow_json: flow,
      created_by: toUuidOrNull(createdBy),
      note: `rollback a v${versionNumber}`,
    });
    if (insErr) {
      this.logger.error({ insErr, flowId, newVersion }, 'rollback: insert version failed');
      throw new Error(`rollback insert version failed: ${insErr.message}`);
    }

    // 4. Activar el contenido restaurado.
    await this.setActiveFlow({
      flowId,
      tenantId,
      channel: (row.channel ?? 'whatsapp') as BotFlowChannel,
      flow,
      clearDraft: false,
    });

    this.logger.info(
      { flowId, tenantId, restoredFrom: versionNumber, newVersion },
      '[SupabaseBotFlowRepository] rollback aplicado',
    );
    return { versionNumber: newVersion };
  }

  /**
   * version_number siguiente para un flow (max + 1, o 1 si no hay versiones).
   * unique(flow_id, version_number) actúa de red si dos publish corren a la par.
   */
  private async nextVersionNumber(flowId: string): Promise<number> {
    const { data, error } = await this.supabase
      .from('bot_flow_versions')
      .select('version_number')
      .eq('flow_id', flowId)
      .order('version_number', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      this.logger.error({ error, flowId }, 'nextVersionNumber failed');
      throw new Error(`nextVersionNumber failed: ${error.message}`);
    }
    return ((data?.version_number as number | undefined) ?? 0) + 1;
  }

  /**
   * Activa un flow respetando el índice único de activo por (tenant, channel):
   * primero desactiva los activos del mismo channel, luego activa este y setea
   * json_definition (opcionalmente limpiando el draft).
   */
  private async setActiveFlow(params: {
    flowId: string;
    tenantId: string;
    channel: BotFlowChannel;
    flow: BotFlow;
    clearDraft: boolean;
  }): Promise<void> {
    const { flowId, tenantId, channel, flow, clearDraft } = params;

    const { error: deErr } = await this.supabase
      .from('bot_flows')
      .update({ is_active: false })
      .eq('tenant_id', tenantId)
      .eq('channel', channel)
      .eq('is_active', true);

    if (deErr) {
      this.logger.error({ deErr, tenantId, channel }, 'setActiveFlow: deactivate siblings failed');
      throw new Error(`setActiveFlow deactivate failed: ${deErr.message}`);
    }

    const patch: Record<string, unknown> = {
      json_definition: flow,
      is_active: true,
    };
    if (clearDraft) {
      patch.draft_json = null;
      patch.draft_updated_at = null;
    }

    const { error: upErr } = await this.supabase
      .from('bot_flows')
      .update(patch)
      .eq('id', flowId)
      .eq('tenant_id', tenantId);

    if (upErr) {
      this.logger.error({ upErr, flowId }, 'setActiveFlow: activate failed');
      throw new Error(`setActiveFlow activate failed: ${upErr.message}`);
    }
  }
}