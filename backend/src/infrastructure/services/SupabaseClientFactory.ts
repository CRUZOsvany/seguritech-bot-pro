import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from '@/config/env';

let cachedClient: SupabaseClient | null = null;

/**
 * Crea (una sola vez) un cliente de Supabase con service_role.
 * service_role bypasea RLS — uso server-side exclusivo.
 *
 * El client se reutiliza en SupabaseUserRepository, SupabaseTenantConfigService
 * y MessageLogService para evitar sobrecargar conexiones.
 */
export function getSupabaseClient(): SupabaseClient {
  if (cachedClient) return cachedClient;

  if (!config.supabase.url || !config.supabase.serviceRoleKey) {
    throw new Error(
      'SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY son requeridos en producción. ' +
      'Configúralos en backend/.env',
    );
  }

  cachedClient = createClient(config.supabase.url, config.supabase.serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    db: { schema: 'public' },
  });

  return cachedClient;
}

/**
 * Reset del singleton — útil en tests.
 */
export function resetSupabaseClient(): void {
  cachedClient = null;
}