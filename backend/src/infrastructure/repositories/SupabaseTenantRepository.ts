import type { SupabaseClient } from '@supabase/supabase-js';
import type pino from 'pino';
import type {
  TenantRepository,
  TenantSummary,
  TenantDetail,
  CreateTenantInput,
  UpdateTenantInput,
  TenantStatus,
} from '@/domain/ports/TenantRepository';

/**
 * Implementación Supabase del TenantRepository.
 *
 * findAll/findById usan dos queries en paralelo (tenants + bot_flows activos)
 * para determinar has_active_flow sin depender del schema-cache de PostgREST.
 *
 * Soft-delete: todas las lecturas y updates filtran por deleted_at IS NULL.
 * findFullDetail incluye bot_configuration, meta_credentials y flow activo.
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
        .is('deleted_at', null)
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

    type TenantListRow = {
      id: string;
      nombre_negocio: string;
      giro: string;
      status: string;
      webhook_verified: boolean | null;
    };

    return (tenantsRes.data ?? []).map((t: TenantListRow) => ({
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
        .is('deleted_at', null)
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

    type TenantByIdRow = {
      id: string;
      nombre_negocio: string;
      giro: string;
      status: string;
      webhook_verified: boolean | null;
    };
    const t = tenantRes.data as TenantByIdRow;
    return {
      id: t.id,
      nombre_negocio: t.nombre_negocio,
      giro: t.giro,
      status: t.status,
      webhook_verified: t.webhook_verified ?? false,
      has_active_flow: !!flowRes.data,
    };
  }

  async findFullDetail(id: string): Promise<TenantDetail | null> {
    const [tenantRes, bcRes, mcRes, flowRes] = await Promise.all([
      this.supabase
        .from('tenants')
        .select(
          'id, nombre_negocio, giro, direccion, horario_semana, horario_sabado, ' +
            'abre_domingo, status, webhook_verified, created_at, updated_at',
        )
        .eq('id', id)
        .is('deleted_at', null)
        .maybeSingle(),
      this.supabase
        .from('bot_configurations')
        .select(
          'numero_whatsapp_asignado, nombre_bot, tono_bot, mensaje_bienvenida, ' +
            'mensaje_menu_principal, mensaje_fuera_horario, mensaje_no_entendio, ' +
            'mensaje_confirmacion_pedido',
        )
        .eq('tenant_id', id)
        .maybeSingle(),
      this.supabase
        .from('tenant_meta_credentials')
        .select('phone_number_id, waba_id, display_phone_number, is_active, rotated_at')
        .eq('tenant_id', id)
        .maybeSingle(),
      this.supabase
        .from('bot_flows')
        .select('id, nombre, source_template_id, updated_at')
        .eq('tenant_id', id)
        .eq('is_active', true)
        .maybeSingle(),
    ]);

    if (tenantRes.error) {
      this.logger.error({ error: tenantRes.error, id }, 'findFullDetail tenant failed');
      throw new Error(`findFullDetail tenant: ${tenantRes.error.message}`);
    }
    if (!tenantRes.data) return null;

    const t = tenantRes.data as any;
    const bc = bcRes.data as any | null;
    const mc = mcRes.data as any | null;
    const flow = flowRes.data as any | null;

    return {
      id: t.id,
      nombre_negocio: t.nombre_negocio,
      giro: t.giro,
      status: t.status,
      webhook_verified: t.webhook_verified ?? false,
      has_active_flow: !!flow,
      direccion: t.direccion ?? null,
      horario_semana: t.horario_semana ?? null,
      horario_sabado: t.horario_sabado ?? null,
      abre_domingo: !!t.abre_domingo,
      bot_configuration: bc
        ? {
          numero_whatsapp_asignado: bc.numero_whatsapp_asignado,
          nombre_bot: bc.nombre_bot,
          tono_bot: bc.tono_bot,
          mensaje_bienvenida: bc.mensaje_bienvenida ?? null,
          mensaje_menu_principal: bc.mensaje_menu_principal ?? null,
          mensaje_fuera_horario: bc.mensaje_fuera_horario ?? null,
          mensaje_no_entendio: bc.mensaje_no_entendio ?? null,
          mensaje_confirmacion_pedido: bc.mensaje_confirmacion_pedido ?? null,
        }
        : null,
      meta_credentials: mc
        ? {
          phone_number_id: mc.phone_number_id,
          waba_id: mc.waba_id,
          display_phone_number: mc.display_phone_number,
          is_active: !!mc.is_active,
          rotated_at: mc.rotated_at ?? null,
        }
        : null,
      active_flow: flow
        ? {
          id: flow.id,
          nombre: flow.nombre,
          source_template_id: flow.source_template_id ?? null,
          updated_at: flow.updated_at,
        }
        : null,
      created_at: t.created_at,
      updated_at: t.updated_at,
    };
  }

  async setStatus(id: string, status: TenantStatus): Promise<void> {
    const { error } = await this.supabase
      .from('tenants')
      .update({ status })
      .eq('id', id)
      .is('deleted_at', null);

    if (error) {
      this.logger.error({ error, id, status }, 'setStatus failed');
      throw new Error(`setStatus failed: ${error.message}`);
    }

    this.logger.info({ id, status }, '[SupabaseTenantRepository] status actualizado');
  }

  async findStatusById(id: string): Promise<TenantStatus | null> {
    const { data, error } = await this.supabase
      .from('tenants')
      .select('status')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) {
      this.logger.error({ error, id }, 'findStatusById failed');
      throw new Error(`findStatusById failed: ${error.message}`);
    }

    if (!data) return null;
    return data.status as TenantStatus;
  }

  async createAtomic(input: CreateTenantInput): Promise<string> {
    // 1. Insert tenant
    const { data: tenant, error: tErr } = await this.supabase
      .from('tenants')
      .insert({
        nombre_negocio: input.nombre_negocio,
        giro: input.giro,
        direccion: input.direccion ?? null,
        horario_semana: input.horario_semana ?? null,
        horario_sabado: input.horario_sabado ?? null,
        abre_domingo: input.abre_domingo ?? false,
        status: 'draft',
        webhook_verified: false,
      })
      .select('id')
      .single();

    if (tErr || !tenant) {
      this.logger.error({ err: tErr }, 'createAtomic tenant insert failed');
      throw new Error(`createAtomic tenant: ${tErr?.message ?? 'no row returned'}`);
    }
    const tenantId = tenant.id as string;

    try {
      // 2. Insert bot_configuration SOLO si el caller lo proveyó.
      //    En el flujo "tenant pelado" (FASE 2A) este bloque queda diferido a
      //    cuando el operador habilite el servicio whatsapp_bot y configure
      //    sus mensajes (FASE 2B).
      if (input.bot_configuration) {
        const bc = input.bot_configuration;
        const { error: bcErr } = await this.supabase.from('bot_configurations').insert({
          tenant_id: tenantId,
          numero_whatsapp_asignado: bc.numero_whatsapp_asignado,
          nombre_bot: bc.nombre_bot ?? 'Asistente',
          tono_bot: bc.tono_bot ?? 'amigable',
          mensaje_bienvenida: bc.mensaje_bienvenida ?? null,
          mensaje_menu_principal: bc.mensaje_menu_principal ?? null,
          mensaje_fuera_horario: bc.mensaje_fuera_horario ?? null,
          mensaje_no_entendio: bc.mensaje_no_entendio ?? null,
          mensaje_confirmacion_pedido: bc.mensaje_confirmacion_pedido ?? null,
        });
        if (bcErr) throw new Error(`bot_configuration: ${bcErr.message}`);
      }

      // 3. Opcional: clonar template como flow activo
      if (input.template_slug) {
        const { data: tpl, error: tplErr } = await this.supabase
          .from('flow_templates')
          .select('id, json_definition, version')
          .eq('slug', input.template_slug)
          .maybeSingle();

        if (tplErr) throw new Error(`flow_template lookup: ${tplErr.message}`);
        if (!tpl) throw new Error(`flow_template "${input.template_slug}" no encontrado`);

        const { error: flowErr } = await this.supabase.from('bot_flows').insert({
          tenant_id: tenantId,
          nombre: 'Flujo principal',
          json_definition: tpl.json_definition,
          is_active: true,
          source_template_id: tpl.id,
          version: tpl.version ?? '1.0',
        });
        if (flowErr) throw new Error(`bot_flow: ${flowErr.message}`);
      }

      // 4. Crear servicio whatsapp_bot en estado 'draft' (capa modular fase 1).
      // Se activa cuando alguien lo promueva via PATCH /services/:type.
      const { error: svcErr } = await this.supabase
        .from('tenant_services')
        .insert({
          tenant_id: tenantId,
          service_type: 'whatsapp_bot',
          status: 'draft',
        });
      if (svcErr) {
        this.logger.error(
          { svcErr, tenantId },
          'createAtomic: service insert failed (tenant queda sin fila de servicio)',
        );
        // No abortamos: el tenant ya está creado y el bot_configuration existe.
        // El backfill / un retry pueden reparar la fila de servicio después.
      }

      this.logger.info(
        { tenantId, template: input.template_slug ?? null },
        '✅ Tenant creado atómicamente',
      );
      return tenantId;
    } catch (err: unknown) {
      // Rollback: borrar el tenant. FK ON DELETE CASCADE limpia bot_configurations y bot_flows.
      await this.supabase.from('tenants').delete().eq('id', tenantId);
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        { err: msg, tenantId },
        '❌ createAtomic falló; tenant revertido vía cascade',
      );
      throw new Error(`createAtomic: ${msg || 'error desconocido'}`);
    }
  }

  async update(id: string, input: UpdateTenantInput): Promise<void> {
    const tenantPatch: Record<string, unknown> = {};
    if (input.nombre_negocio !== undefined) tenantPatch.nombre_negocio = input.nombre_negocio;
    if (input.giro !== undefined) tenantPatch.giro = input.giro;
    if (input.direccion !== undefined) tenantPatch.direccion = input.direccion;
    if (input.horario_semana !== undefined) tenantPatch.horario_semana = input.horario_semana;
    if (input.horario_sabado !== undefined) tenantPatch.horario_sabado = input.horario_sabado;
    if (input.abre_domingo !== undefined) tenantPatch.abre_domingo = input.abre_domingo;

    if (Object.keys(tenantPatch).length > 0) {
      const { error } = await this.supabase
        .from('tenants')
        .update(tenantPatch)
        .eq('id', id)
        .is('deleted_at', null);
      if (error) throw new Error(`update tenant: ${error.message}`);
    }

    if (input.bot_configuration) {
      const bc = input.bot_configuration;
      const bcPatch: Record<string, unknown> = {};
      if (bc.numero_whatsapp_asignado !== undefined) bcPatch.numero_whatsapp_asignado = bc.numero_whatsapp_asignado;
      if (bc.nombre_bot !== undefined) bcPatch.nombre_bot = bc.nombre_bot;
      if (bc.tono_bot !== undefined) bcPatch.tono_bot = bc.tono_bot;
      if (bc.mensaje_bienvenida !== undefined) bcPatch.mensaje_bienvenida = bc.mensaje_bienvenida;
      if (bc.mensaje_menu_principal !== undefined) bcPatch.mensaje_menu_principal = bc.mensaje_menu_principal;
      if (bc.mensaje_fuera_horario !== undefined) bcPatch.mensaje_fuera_horario = bc.mensaje_fuera_horario;
      if (bc.mensaje_no_entendio !== undefined) bcPatch.mensaje_no_entendio = bc.mensaje_no_entendio;
      if (bc.mensaje_confirmacion_pedido !== undefined) bcPatch.mensaje_confirmacion_pedido = bc.mensaje_confirmacion_pedido;

      if (Object.keys(bcPatch).length > 0) {
        const { error } = await this.supabase
          .from('bot_configurations')
          .update(bcPatch)
          .eq('tenant_id', id);
        if (error) throw new Error(`update bot_configuration: ${error.message}`);
      }
    }

    this.logger.info({ id }, '[SupabaseTenantRepository] tenant actualizado');
  }

  async softDelete(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('tenants')
      .update({ deleted_at: new Date().toISOString(), status: 'archived' as TenantStatus })
      .eq('id', id)
      .is('deleted_at', null);
    if (error) throw new Error(`softDelete tenant: ${error.message}`);

    this.logger.warn({ id }, '🗑️  Tenant soft-deleted (status=archived, deleted_at set)');
  }

  async isModuleEnabled(id: string, module: 'pos' | 'bot'): Promise<boolean> {
    // DEC-A: fuente de verdad = tenant_services. DEC-B: 'active' = operativo.
    const serviceType = module === 'pos' ? 'pos' : 'whatsapp_bot';
    const { data, error } = await this.supabase
      .from('tenant_services')
      .select('status')
      .eq('tenant_id', id)
      .eq('service_type', serviceType)
      .maybeSingle();
    if (error) {
      this.logger.error({ error, id, module }, 'isModuleEnabled failed');
      throw new Error(`isModuleEnabled: ${error.message}`);
    }
    return data?.status === 'active';
  }
}
