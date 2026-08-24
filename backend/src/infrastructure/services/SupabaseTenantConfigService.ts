import { SupabaseClient } from '@supabase/supabase-js';
import pino from 'pino';
import NodeCache from 'node-cache';
import { TenantConfig, CatalogItem, BotTone, ServiceDirectoryEntry } from '@/domain/entities';
import { TenantConfigPort } from '@/domain/ports';

const TTL_SECONDS = 5 * 60; // 5 minutos

/**
 * Carga configuración del bot + catálogo + nombre de negocio desde Supabase
 * y cachea por tenant. Implementa TenantConfigPort (puerto del dominio).
 *
 * Si bot_configurations no existe para el tenant, retorna null (el caller
 * decide qué hacer — típicamente loguear y no responder).
 *
 * Sprint 1.5: incluye nombreNegocio cargado desde tabla tenants (necesario
 * para VariableResolver de Sprint B).
 */
export class SupabaseTenantConfigService implements TenantConfigPort {
  private cache: NodeCache;

  constructor(
    private readonly supabase: SupabaseClient,
    private readonly logger: pino.Logger,
  ) {
    this.cache = new NodeCache({ stdTTL: TTL_SECONDS, checkperiod: 60 });
  }

  async getConfig(tenantId: string): Promise<TenantConfig | null> {
    const cached = this.cache.get<TenantConfig>(tenantId);
    if (cached) {
      this.logger.debug({ tenantId }, 'TenantConfig cache HIT');
      return cached;
    }

    this.logger.debug({ tenantId }, 'TenantConfig cache MISS — cargando');

    const [tenantRes, configRes, catalogRes, ownerRes, serviceDirRes] = await Promise.all([
      this.supabase
        .from('tenants')
        .select('nombre_negocio, horario_semana, horario_sabado, abre_domingo')
        .eq('id', tenantId)
        .maybeSingle(),
      this.supabase
        .from('bot_configurations')
        .select('*')
        .eq('tenant_id', tenantId)
        .maybeSingle(),
      this.supabase
        .from('catalog_items')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('disponible', true),
      this.supabase
        .from('owner_data')
        .select('whatsapp_dueno')
        .eq('tenant_id', tenantId)
        .maybeSingle(),
      this.supabase
        .from('tenant_service_directory')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('activo', true)
        .order('orden', { ascending: true }),
    ]);

    if (configRes.error) {
      this.logger.error(
        { error: configRes.error, tenantId },
        'Error cargando bot_configurations',
      );
      return null;
    }

    if (!configRes.data) {
      this.logger.warn(
        { tenantId },
        'No existe bot_configuration para este tenant',
      );
      return null;
    }

    if (tenantRes.error) {
      this.logger.warn(
        { error: tenantRes.error, tenantId },
        'Error cargando tenants.nombre_negocio — usando fallback',
      );
    }

    if (catalogRes.error) {
      this.logger.warn(
        { error: catalogRes.error, tenantId },
        'Error cargando catalog_items — usando catálogo vacío',
      );
    }

    if (ownerRes.error) {
      this.logger.warn(
        { error: ownerRes.error, tenantId },
        'Error cargando owner_data — sin ownerPhone (no se enviará aviso al dueño)',
      );
    }

    if (serviceDirRes.error) {
      this.logger.warn(
        { error: serviceDirRes.error, tenantId },
        'Error cargando tenant_service_directory — usando directorio vacío',
      );
    }

    const c = configRes.data;
    const nombreNegocio = (tenantRes.data?.nombre_negocio as string | undefined) ?? '';
    const ownerPhone = (ownerRes.data?.whatsapp_dueno as string | undefined) || undefined;
    const horarioSemana = (tenantRes.data?.horario_semana as string | null | undefined) ?? null;
    const horarioSabado = (tenantRes.data?.horario_sabado as string | null | undefined) ?? null;
    const abreDomingo = Boolean(tenantRes.data?.abre_domingo);

    const catalog: CatalogItem[] = (catalogRes.data || []).map((row: any) => ({
      id: row.id,
      name: row.nombre_producto,
      description: row.descripcion ?? '',
      price: Number(row.precio),
      category: row.categoria ?? '',
      available: row.disponible,
    }));

    const serviceDirectory: ServiceDirectoryEntry[] = (serviceDirRes.data || []).map(
      (row: any) => ({
        id: row.id,
        tenantId: row.tenant_id,
        nombre: row.nombre,
        keywords: row.keywords ?? [],
        respuesta: row.respuesta,
        precio: row.precio != null ? Number(row.precio) : undefined,
        activo: row.activo,
        orden: row.orden ?? 0,
      }),
    );

    const config: TenantConfig = {
      tenantId,
      botName: c.nombre_bot ?? 'Asistente',
      nombreNegocio,
      tone: (c.tono_bot ?? 'amigable') as BotTone,
      welcomeMessage: c.mensaje_bienvenida ?? '¡Hola! ¿En qué puedo ayudarte?',
      menuMessage:
        c.mensaje_menu_principal ??
        'Elige una opción:\n1. Productos\n2. Precios\n3. Hacer pedido',
      outOfHoursMessage:
        c.mensaje_fuera_horario ?? 'Estamos fuera de horario.',
      notUnderstoodMessage:
        c.mensaje_no_entendio ??
        'No entendí. Escribe "menu" para volver al inicio.',
      orderConfirmationMessage:
        c.mensaje_confirmacion_pedido ??
        '✅ Pedido confirmado. Te contactaremos pronto.',
      catalog,
      ownerPhone,
      serviceDirectory,
      horarioSemana,
      horarioSabado,
      abreDomingo,
    };

    this.cache.set(tenantId, config);
    this.logger.info(
      { tenantId, catalogSize: catalog.length, nombreNegocio },
      'TenantConfig cargado',
    );
    return config;
  }

  invalidate(tenantId: string): void {
    this.cache.del(tenantId);
    this.logger.info({ tenantId }, 'TenantConfig cache invalidado');
  }
}