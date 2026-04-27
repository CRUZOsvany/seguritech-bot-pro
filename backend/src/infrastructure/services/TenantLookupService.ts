/**
 * Servicio para búsqueda de tenant por número de teléfono
 * Consulta tabla phone_tenant_map en Supabase
 * Usado por webhook POST /webhook para resolver tenantId desde businessNumber de Meta
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import logger from '@/config/logger';

class TenantLookupService {
  private supabaseClient: SupabaseClient | null = null;

  /**
   * Inicializa el cliente de Supabase con service role
   * Solo se ejecuta una vez
   */
  private initializeSupabase(): SupabaseClient {
    if (this.supabaseClient) {
      return this.supabaseClient;
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      logger.warn(
        '⚠️  Variables Supabase no configuradas (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY). '
        + 'Webhook sin tenant mapping fallará gracefully.',
      );
      // Retornar un cliente dummy que siempre falla
      return createClient(
        supabaseUrl || 'https://placeholder.supabase.co',
        serviceRoleKey || 'placeholder',
      );
    }

    this.supabaseClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    return this.supabaseClient;
  }

  /**
   * Buscar tenantId por número de teléfono (businessNumber)
   * Consulta tabla phone_tenant_map
   *
   * @param phoneNumber - Número de teléfono formateado (ej: 573123456789)
   * @returns tenantId si existe, null si no
   */
  async lookupTenantByPhone(phoneNumber: string): Promise<string | null> {
    try {
      if (!phoneNumber || phoneNumber.trim() === '') {
        logger.warn('🔍 Lookup fallido: número de teléfono vacío');
        return null;
      }

      const supabase = this.initializeSupabase();

      const { data, error } = await supabase
        .from('phone_tenant_map')
        .select('tenant_id')
        .eq('phone_number', phoneNumber)
        .eq('is_active', true)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // PGRST116 = no rows returned, es normal
          logger.debug(
            { phoneNumber },
            '🔍 No se encontró mapping de teléfono -> tenant',
          );
          return null;
        }

        logger.error(
          { phoneNumber, error },
          '❌ Error consultando phone_tenant_map',
        );
        return null;
      }

      if (!data || !data.tenant_id) {
        logger.debug({ phoneNumber }, '🔍 Mapping existe pero sin tenant_id');
        return null;
      }

      logger.info(
        { phoneNumber, tenantId: data.tenant_id },
        '✅ Tenant encontrado por número de teléfono',
      );
      return data.tenant_id;
    } catch (error) {
      logger.error(
        { phoneNumber, error },
        '❌ Error inesperado en lookupTenantByPhone',
      );
      return null;
    }
  }
}

// Exportar singleton
export const tenantLookupService = new TenantLookupService();
export { TenantLookupService };

