/**
 * Servicio para búsqueda de tenant por número de teléfono.
 * Consulta tabla phone_tenant_map en Supabase.
 * Usado por webhook POST /webhook para resolver tenantId desde businessNumber de Meta.
 *
 * Sprint 1: usa el singleton de SupabaseClientFactory en lugar de instanciar
 * su propio cliente, eliminando duplicación de configuración.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import logger from '@/config/logger';
import { getSupabaseClient } from '@/infrastructure/services/SupabaseClientFactory';

class TenantLookupService {
  /**
   * Buscar tenantId por número de teléfono (businessNumber).
   * Consulta tabla phone_tenant_map.
   *
   * @param phoneNumber - Número de teléfono formateado (ej: 5217471234567)
   * @returns tenantId si existe, null si no o si Supabase no está configurado
   */
  async lookupTenantByPhone(phoneNumber: string): Promise<string | null> {
    try {
      if (!phoneNumber || phoneNumber.trim() === '') {
        logger.warn('🔍 Lookup fallido: número de teléfono vacío');
        return null;
      }

      let supabase: SupabaseClient;
      try {
        supabase = getSupabaseClient();
      } catch (err) {
        logger.warn(
          { err },
          '⚠️  Supabase no configurado; lookup de tenant por teléfono deshabilitado',
        );
        return null;
      }

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