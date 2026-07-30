/**
 * Bootstrap idempotente de N cerrajerías en PRODUCCIÓN sobre UN MISMO flow.
 *
 * Generaliza el antiguo seed-cerracruz.ts a un loop sobre `TENANTS`. Cada tenant
 * YA EXISTE en el panel (creado a mano): este script NO crea tenants, solo los
 * completa y les activa el flow de cerrajería v2 (idéntico para todos; lo único
 * que cambia es el negocio: nombre + mensajes + WhatsApp del dueño por env).
 *
 * Por cada tenant deja operativo de punta a punta:
 *   - bot_configurations (sin esta fila el bot IGNORA todos los mensajes)
 *   - owner_data.whatsapp_dueno (sin esto, escape_to_human NO avisa al dueño)
 *   - tenant_services.whatsapp_bot = 'active' (ÚNICO gate real del webhook)
 *   - tenants.status = 'sandbox' (cosmético; solo si venía en 'draft')
 *   - bot_flows: el flow de cerrajería validado, is_active=true (un solo activo)
 *
 * 100% idempotente y re-ejecutable: solo upserts/updates filtrados por tenant_id.
 * NUNCA crea un tenant ni borra datos. Si un tenant resuelve a 0 o >1 filas,
 * registra el error PARA ESE tenant y sigue con el siguiente (no aborta el resto).
 *
 * El flow es UNO solo (cerrajeria-flow.json). Interpola {{nombre_negocio}},
 * {{welcome_message}}, {{menu_message}} y {{not_understood_message}} en runtime
 * por tenant vía VariableResolver — por eso el mismo objeto se siembra a todos.
 *
 * Uso (con las env vars cargadas en el entorno):
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   CERRACRUZ_OWNER_WHATSAPP=... TONY_OWNER_WHATSAPP=... \
 *     npx ts-node -r tsconfig-paths/register scripts/seed-cerrajerias.ts
 *
 * Variables de entorno:
 *   SUPABASE_URL                (req)
 *   SUPABASE_SERVICE_ROLE_KEY   (req)
 *   <ownerEnv> por tenant       (req) WhatsApp del dueño, E.164. PII → solo env.
 */
import 'dotenv/config';
import { readFileSync } from 'fs';
import path from 'path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import pino, { type Logger } from 'pino';
import { validateFlow } from '@/domain/validators/flowSchema';
import type { BotFlow } from '@/domain/entities/flow';
import { SupabaseBotFlowRepository } from '@/infrastructure/repositories/SupabaseBotFlowRepository';
import { SupabaseTenantServiceRepository } from '@/infrastructure/repositories/SupabaseTenantServiceRepository';
import { SupabaseTenantRepository } from '@/infrastructure/repositories/SupabaseTenantRepository';

/**
 * Datos PÚBLICOS del negocio por tenant. El WhatsApp del dueño (PII) NO va aquí:
 * se lee por env vía `ownerEnv`.
 *
 * OJO (VariableResolver hace UNA sola pasada): `welcomeMessage` lleva el nombre
 * del negocio escrito a mano. Si pusiéramos {{nombre_negocio}} dentro del valor
 * de config, NO se re-resolvería y saldría literal. El flow sí interpola
 * {{nombre_negocio}} porque vive en el JSON del nodo, no dentro de un config.
 */
interface TenantSeed {
  /** Patrón ilike sobre tenants.nombre_negocio para resolver el tenant. */
  match: string;
  /** Nombre canónico; se normaliza en tenants.nombre_negocio. */
  nombreNegocio: string;
  /** Nombre de la env var con el WhatsApp del dueño (PII). */
  ownerEnv: string;
  welcomeMessage: string;
  menuMessage: string;
  notUnderstoodMessage: string;
}

const TENANTS: TenantSeed[] = [
  {
    match: '%cerracruz%',
    nombreNegocio: 'CerraCruz',
    ownerEnv: 'CERRACRUZ_OWNER_WHATSAPP',
    welcomeMessage:
      'Hola 👋 Bienvenido a CerraCruz, tu cerrajería de confianza en Chilpancingo. Atendemos emergencias 24/7.',
    menuMessage: 'Elige una opción 👇 o escríbeme: emergencia, agendar o información.',
    notUnderstoodMessage: 'No te entendí 🤔. Dime qué necesitas:',
  },
  {
    match: '%tony%',
    nombreNegocio: 'Cerrajería Tony',
    ownerEnv: 'TONY_OWNER_WHATSAPP',
    welcomeMessage:
      'Hola 👋 Bienvenido a Cerrajería Tony. Atendemos emergencias 24/7 en Chilpancingo.',
    menuMessage: 'Elige una opción 👇 o escríbeme: emergencia, agendar o información.',
    notUnderstoodMessage: 'No te entendí 🤔. Dime qué necesitas:',
  },
];

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === '') {
    throw new Error(`Falta env var requerida: ${name}`);
  }
  return v.trim();
}

interface Deps {
  supabase: SupabaseClient;
  logger: Logger;
  flow: BotFlow;
  flowRepo: SupabaseBotFlowRepository;
  serviceRepo: SupabaseTenantServiceRepository;
  tenantRepo: SupabaseTenantRepository;
}

/**
 * Siembra un único tenant. Lanza si algo falla (el caller lo captura para no
 * abortar al resto de tenants). Todas las queries van filtradas por tenant_id.
 */
async function seedTenant(t: TenantSeed, d: Deps): Promise<void> {
  const { supabase } = d;

  // 1. WhatsApp del dueño (PII) por env. Falla claro si falta.
  const ownerWhatsapp = requireEnv(t.ownerEnv);

  // 2. Resolver tenant_id por nombre (exactamente uno). NUNCA crear.
  const { data: matches, error: tErr } = await supabase
    .from('tenants')
    .select('id, nombre_negocio')
    .ilike('nombre_negocio', t.match)
    .is('deleted_at', null);
  if (tErr) throw new Error(`Resolver tenant falló: ${tErr.message}`);
  if (!matches || matches.length === 0) {
    throw new Error(`0 tenants matchean "${t.match}". NO se crea tenant.`);
  }
  if (matches.length > 1) {
    throw new Error(`${matches.length} tenants matchean "${t.match}". Ambiguo → se omite.`);
  }
  const tenantId = matches[0].id as string;

  // 3. Normalizar tenants.nombre_negocio (el flow interpola {{nombre_negocio}}).
  if (matches[0].nombre_negocio !== t.nombreNegocio) {
    const { error } = await supabase
      .from('tenants')
      .update({ nombre_negocio: t.nombreNegocio })
      .eq('id', tenantId);
    if (error) throw new Error(`Update nombre_negocio falló: ${error.message}`);
  }

  // 4. Upsert bot_configurations (OBLIGATORIA: sin ella el bot ignora todo).
  // tono_bot CHECK = ('formal','amigable','directo'); 'profesional' NO existe →
  // 'formal' es el más cercano al tono profesional pedido.
  // numero_whatsapp_asignado es NOT NULL: en insert cae a 'pendiente'; en update
  // se PRESERVA el valor existente (no lo pisamos con 'pendiente' si ya tiene uno).
  {
    const { data: existing } = await supabase
      .from('bot_configurations')
      .select('id, numero_whatsapp_asignado')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    const baseConfig = {
      tenant_id: tenantId,
      nombre_bot: t.nombreNegocio,
      tono_bot: 'formal',
      mensaje_bienvenida: t.welcomeMessage,
      mensaje_menu_principal: t.menuMessage,
      mensaje_no_entendio: t.notUnderstoodMessage,
      mensaje_fuera_horario:
        'Atendemos emergencias 24/7. Déjanos tu dirección y teléfono y un cerrajero te contacta.',
    };

    if (existing?.id) {
      const { error } = await supabase
        .from('bot_configurations')
        .update(baseConfig) // NO toca numero_whatsapp_asignado → preserva el real
        .eq('tenant_id', tenantId);
      if (error) throw new Error(`Update bot_configurations falló: ${error.message}`);
    } else {
      const { error } = await supabase
        .from('bot_configurations')
        .insert({ ...baseConfig, numero_whatsapp_asignado: 'pendiente' });
      if (error) throw new Error(`Insert bot_configurations falló: ${error.message}`);
    }
  }

  // 5. Upsert owner_data (whatsapp_dueno = PII del dueño, vía env).
  // Sin esto, escape_to_human corre pero la alerta al dueño NO se envía.
  {
    const ownerData = {
      tenant_id: tenantId,
      nombre_dueno: t.nombreNegocio,
      whatsapp_dueno: ownerWhatsapp,
      monto_mensual: 0,
    };
    const { data: existing } = await supabase
      .from('owner_data')
      .select('id')
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (existing?.id) {
      const { error } = await supabase
        .from('owner_data')
        .update(ownerData)
        .eq('tenant_id', tenantId);
      if (error) throw new Error(`Update owner_data falló: ${error.message}`);
    } else {
      const { error } = await supabase.from('owner_data').insert(ownerData);
      if (error) throw new Error(`Insert owner_data falló: ${error.message}`);
    }
  }

  // 6. Activar el servicio whatsapp_bot (ÚNICO gate real del webhook).
  await d.serviceRepo.enable(tenantId, 'whatsapp_bot'); // idempotente (no-op si existe)
  await d.serviceRepo.setStatus(tenantId, 'whatsapp_bot', 'active');

  // 7. tenants.status = sandbox solo si venía en draft (transición válida demo).
  const currentStatus = await d.tenantRepo.findStatusById(tenantId);
  if (currentStatus === 'draft') {
    await d.tenantRepo.setStatus(tenantId, 'sandbox');
  }

  // 8. Persistir el flow validado como activo (un solo activo por tenant).
  await d.flowRepo.deactivateForTenant(tenantId); // baja cualquier flow activo previo
  await d.flowRepo.upsert({
    tenantId,
    nombre: `${t.nombreNegocio} — Cerrajería V2`,
    flow: d.flow,
  });

  // 9. Verificación de lectura: lo que el bot leerá en runtime (SIN PII).
  const active = await d.flowRepo.findActiveByTenant(tenantId);
  const svcStatus = await d.serviceRepo.findServiceStatus(tenantId, 'whatsapp_bot');
  if (!active) throw new Error('Tras sembrar, findActiveByTenant devolvió null');

  d.logger.info(
    {
      nombreNegocio: t.nombreNegocio,
      tenant_id: tenantId,
      flujoActivo: true,
      servicio: svcStatus,
      startNode: active.start_node_id,
      nodos: active.nodes.length,
    },
    '✅ Tenant sembrado',
  );
}

async function main(): Promise<void> {
  const supabaseUrl = requireEnv('SUPABASE_URL');
  const serviceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });
  const logger = pino({ level: 'info' });

  // Cargar y validar el flow UNA sola vez; el mismo objeto se siembra a todos.
  const raw = JSON.parse(
    readFileSync(path.join(__dirname, 'cerrajeria-flow.json'), 'utf8'),
  );
  const flow = validateFlow(raw); // debe pasar; lanza si el JSON es inválido

  const deps: Deps = {
    supabase,
    logger,
    flow,
    flowRepo: new SupabaseBotFlowRepository(supabase, logger),
    serviceRepo: new SupabaseTenantServiceRepository(supabase, logger),
    tenantRepo: new SupabaseTenantRepository(supabase, logger),
  };

  const results: Array<{ nombre: string; ok: boolean; motivo?: string }> = [];
  for (const t of TENANTS) {
    try {
      await seedTenant(t, deps);
      results.push({ nombre: t.nombreNegocio, ok: true });
    } catch (e) {
      const motivo = e instanceof Error ? e.message : String(e);
      logger.error({ nombreNegocio: t.nombreNegocio, motivo }, '❌ Tenant falló');
      results.push({ nombre: t.nombreNegocio, ok: false, motivo });
    }
  }

  console.log('\n--- RESUMEN (sin PII) ---');
  let anyFail = false;
  for (const r of results) {
    if (r.ok) {
      console.log(`  ${r.nombre.padEnd(18)} → OK`);
    } else {
      anyFail = true;
      console.log(`  ${r.nombre.padEnd(18)} → ERROR: ${r.motivo}`);
    }
  }

  if (anyFail) process.exit(1);
}

main().catch((e) => {
  console.error('FATAL:', e instanceof Error ? e.message : e);
  process.exit(1);
});
