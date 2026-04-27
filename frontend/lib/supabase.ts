/**
 * Cliente de Supabase inicializado para el lado del cliente y servidor
 * Incluye funciones auxiliares para operaciones comunes
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.placeholder';

// En desarrollo, permitir placeholder values
const isDev = process.env.NEXT_PUBLIC_APP_ENV === 'development' || process.env.NODE_ENV === 'development';

if (!isDev && (!supabaseUrl || !supabaseAnonKey || supabaseUrl.includes('placeholder'))) {
  throw new Error('Variables de Supabase no configuradas en .env.local');
}

if (isDev && (supabaseUrl.includes('placeholder') || supabaseAnonKey.includes('placeholder'))) {
  console.warn('⚠️  ADVERTENCIA: Usando valores placeholder de Supabase. Configura .env.local con credenciales reales.');
}

export const supabase: SupabaseClient = createClient(
  supabaseUrl,
  supabaseAnonKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  }
);

/**
 * Cliente con service role para operaciones en el servidor
 * NO expo esto al cliente en funciones públicas
 */
export const createServiceClient = (): SupabaseClient => {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!serviceRoleKey) {
    throw new Error('Service role key no configurada en variables de entorno del servidor');
  }

  return createClient(supabaseUrl!, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
};

/**
 * Obtener usuarios de un tenant
 */
export async function getTenantUsers(tenantId: string) {
  const { data, error } = await supabase
    .from('admin_users')
    .select('*')
    .eq('tenant_id', tenantId);

  if (error) {
    throw new Error(`Error al obtener usuarios del tenant: ${error.message}`);
  }

  return data;
}

/**
 * Obtener configuración completa del cliente
 */
export async function getClientConfig(tenantId: string) {
  const { data: tenant, error: tenantError } = await supabase
    .from('tenants')
    .select('*')
    .eq('id', tenantId)
    .single();

  if (tenantError) {
    throw new Error(`Error al obtener tenant: ${tenantError.message}`);
  }

  const { data: owner, error: ownerError } = await supabase
    .from('owner_data')
    .select('*')
    .eq('tenant_id', tenantId)
    .single();

  if (ownerError && ownerError.code !== 'PGRST116') {
    // PGRST116 = no rows returned (es ok)
    throw new Error(`Error al obtener datos del dueño: ${ownerError.message}`);
  }

  const { data: botConfig, error: botError } = await supabase
    .from('bot_configurations')
    .select('*')
    .eq('tenant_id', tenantId)
    .single();

  if (botError && botError.code !== 'PGRST116') {
    throw new Error(`Error al obtener configuración del bot: ${botError.message}`);
  }

  const { data: catalog, error: catalogError } = await supabase
    .from('catalog_items')
    .select('*')
    .eq('tenant_id', tenantId);

  if (catalogError) {
    throw new Error(`Error al obtener catálogo: ${catalogError.message}`);
  }

  const { data: urgentService, error: urgentError } = await supabase
    .from('urgent_service_config')
    .select('*')
    .eq('tenant_id', tenantId)
    .single();

  if (urgentError && urgentError.code !== 'PGRST116') {
    throw new Error(`Error al obtener config de servicio urgente: ${urgentError.message}`);
  }

  return {
    tenant,
    owner: owner || null,
    botConfig: botConfig || null,
    catalog: catalog || [],
    urgentService: urgentService || null,
  };
}

/**
 * Crear nuevo tenant (cliente)
 */
export async function createTenant(data: any) {
  const { data: tenant, error } = await supabase
    .from('tenants')
    .insert([data])
    .select()
    .single();

  if (error) {
    throw new Error(`Error al crear tenant: ${error.message}`);
  }

  return tenant;
}

/**
 * Actualizar tenant
 */
export async function updateTenant(tenantId: string, data: any) {
  const { data: tenant, error } = await supabase
    .from('tenants')
    .update(data)
    .eq('id', tenantId)
    .select()
    .single();

  if (error) {
    throw new Error(`Error al actualizar tenant: ${error.message}`);
  }

  return tenant;
}

/**
 * Listar todos los tenants del usuario (admin)
 */
export async function listTenantsByUser(userId: string) {
  const { data, error } = await supabase
    .from('admin_users')
    .select('tenant_id')
    .eq('user_id', userId);

  if (error) {
    throw new Error(`Error al obtener tenants: ${error.message}`);
  }

  const tenantIds = data?.map((record: any) => record.tenant_id) || [];
  
  if (tenantIds.length === 0) {
    return [];
  }

  const { data: tenants, error: tenantsError } = await supabase
    .from('tenants')
    .select('*')
    .in('id', tenantIds);

  if (tenantsError) {
    throw new Error(`Error al obtener detalles de tenants: ${tenantsError.message}`);
  }

  return tenants || [];
}

/**
 * Agregar catálogo de productos
 */
export async function addCatalogItems(tenantId: string, items: any[]) {
  const itemsWithTenant = items.map((item) => ({
    ...item,
    tenant_id: tenantId,
  }));

  const { data, error } = await supabase
    .from('catalog_items')
    .insert(itemsWithTenant)
    .select();

  if (error) {
    throw new Error(`Error al agregar catálogo: ${error.message}`);
  }

  return data;
}

/**
 * Obtener métricas del bot (mensajes procesados este mes)
 */
export async function getBotMetrics(tenantId: string) {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const { data, error, count } = await supabase
    .from('messages')
    .select('*', { count: 'exact' })
    .eq('tenant_id', tenantId)
    .gte('timestamp', startOfMonth.toISOString());

  if (error) {
    throw new Error(`Error al obtener métricas: ${error.message}`);
  }

  return {
    messages_this_month: count || 0,
    messages_all_time: 0, // Calcular después con supabase stats
  };
}

/**
 * Verificar estado del webhook para verificación inicial de Meta
 */
export async function recordWebhookVerification(tenantId: string, verified: boolean) {
  const { data, error } = await supabase
    .from('tenants')
    .update({
      webhook_verified: verified,
      updated_at: new Date().toISOString(),
    })
    .eq('id', tenantId)
    .select()
    .single();

  if (error) {
    throw new Error(`Error al actualizar webhook: ${error.message}`);
  }

  return data;
}

