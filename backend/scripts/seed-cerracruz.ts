/**
 * Bootstrap idempotente del tenant CerraCruz (cerrajería) en PRODUCCIÓN.
 *
 * Deja CerraCruz operativo de punta a punta para demo:
 *   - bot_configurations (sin esta fila el bot IGNORA todos los mensajes)
 *   - owner_data.whatsapp_dueno (sin esto, escape_to_human NO avisa al dueño)
 *   - tenant_services.whatsapp_bot = 'active' (ÚNICO gate real del webhook, DEC-D)
 *   - tenants.status = 'sandbox' (cosmético para el panel; NO lo exige el gating)
 *   - bot_flows: flow de cerrajería validado, marcado is_active=true (un solo activo)
 *
 * 100% idempotente y re-ejecutable: solo upserts/updates filtrados por tenant_id.
 * NUNCA crea un tenant ni borra datos. Si CerraCruz no resuelve a 1 tenant, aborta.
 *
 * Uso (con las env vars cargadas en el entorno):
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... CERRACRUZ_OWNER_WHATSAPP=... \
 *     npx ts-node -r tsconfig-paths/register scripts/seed-cerracruz.ts
 *
 * Variables de entorno:
 *   SUPABASE_URL                (req)
 *   SUPABASE_SERVICE_ROLE_KEY   (req)
 *   CERRACRUZ_OWNER_WHATSAPP    (req) WhatsApp del dueño, E.164 (ej. 52747XXXXXXX). PII → solo env.
 *   CERRACRUZ_DISPLAY_NUMBER    (opc) número WhatsApp asignado para la "Identidad" del bot.
 */
import 'dotenv/config';
import { readFileSync } from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import pino from 'pino';
import { validateFlow } from '@/domain/validators/flowSchema';
import { SupabaseBotFlowRepository } from '@/infrastructure/repositories/SupabaseBotFlowRepository';
import { SupabaseTenantServiceRepository } from '@/infrastructure/repositories/SupabaseTenantServiceRepository';
import { SupabaseTenantRepository } from '@/infrastructure/repositories/SupabaseTenantRepository';

const FLOW_NAME = 'CerraCruz — Cerrajería V1';
const NOMBRE_NEGOCIO = 'CerraCruz';

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === '') {
    throw new Error(`Falta env var requerida: ${name}`);
  }
  return v.trim();
}

async function main(): Promise<void> {
  const supabaseUrl = requireEnv('SUPABASE_URL');
  const serviceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const ownerWhatsapp = requireEnv('CERRACRUZ_OWNER_WHATSAPP');
  // Display number es opcional; la columna numero_whatsapp_asignado es NOT NULL,
  // así que caemos a 'pendiente' (no es PII, es el número público del negocio).
  const displayNumber = process.env.CERRACRUZ_DISPLAY_NUMBER?.trim() || 'pendiente';

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });
  const logger = pino({ level: 'info' });

  // ── 1. Resolver tenant_id por nombre (exactamente uno). NUNCA crear. ──────
  const { data: matches, error: tErr } = await supabase
    .from('tenants')
    .select('id, nombre_negocio')
    .ilike('nombre_negocio', '%cerracruz%')
    .is('deleted_at', null);
  if (tErr) throw new Error(`Resolver tenant falló: ${tErr.message}`);
  if (!matches || matches.length === 0) {
    throw new Error('No se encontró ningún tenant CerraCruz. Abortando (NO se crea tenant).');
  }
  if (matches.length > 1) {
    throw new Error(
      `Se encontraron ${matches.length} tenants que matchean CerraCruz. Ambiguo → abortando.`,
    );
  }
  const tenantId = matches[0].id as string;
  console.log('Tenant CerraCruz resuelto:', tenantId);

  // ── 2. Normalizar tenants.nombre_negocio (el flow interpola {{nombre_negocio}}) ──
  if (matches[0].nombre_negocio !== NOMBRE_NEGOCIO) {
    const { error } = await supabase
      .from('tenants')
      .update({ nombre_negocio: NOMBRE_NEGOCIO })
      .eq('id', tenantId);
    if (error) throw new Error(`Update nombre_negocio falló: ${error.message}`);
    console.log('nombre_negocio normalizado a:', NOMBRE_NEGOCIO);
  }

  // ── 3. Upsert bot_configurations (OBLIGATORIA: sin ella el bot ignora todo) ──
  // tono_bot CHECK = ('formal','amigable','directo'); 'profesional' NO existe →
  // usamos 'formal' como el tono más cercano a profesional.
  const botConfig = {
    tenant_id: tenantId,
    numero_whatsapp_asignado: displayNumber,
    nombre_bot: 'CerraCruz',
    tono_bot: 'formal',
    mensaje_bienvenida:
      'Hola 👋 Bienvenido a CerraCruz, tu cerrajería de confianza en Chilpancingo. Atendemos emergencias 24/7.',
    mensaje_menu_principal:
      '¿En qué te ayudamos? Escribe *emergencia*, *agendar* o *información*.',
    mensaje_no_entendio:
      'No te entendí 🤔. Escribe *menu* para volver al inicio o dinos si es una *emergencia*.',
    mensaje_fuera_horario:
      'Atendemos emergencias 24/7. Déjanos tu dirección y teléfono y un cerrajero te contacta.',
  };
  {
    const { data: existing } = await supabase
      .from('bot_configurations')
      .select('id')
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (existing?.id) {
      const { error } = await supabase
        .from('bot_configurations')
        .update(botConfig)
        .eq('tenant_id', tenantId);
      if (error) throw new Error(`Update bot_configurations falló: ${error.message}`);
      console.log('bot_configurations: UPDATED');
    } else {
      const { error } = await supabase.from('bot_configurations').insert(botConfig);
      if (error) throw new Error(`Insert bot_configurations falló: ${error.message}`);
      console.log('bot_configurations: INSERTED');
    }
  }

  // ── 4. Upsert owner_data (whatsapp_dueno = PII del dueño, vía env) ──────────
  // Sin esto, escape_to_human corre pero la alerta al dueño NO se envía.
  const ownerData = {
    tenant_id: tenantId,
    nombre_dueno: 'CerraCruz',
    whatsapp_dueno: ownerWhatsapp,
    monto_mensual: 0,
  };
  {
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
      console.log('owner_data: UPDATED');
    } else {
      const { error } = await supabase.from('owner_data').insert(ownerData);
      if (error) throw new Error(`Insert owner_data falló: ${error.message}`);
      console.log('owner_data: INSERTED');
    }
  }

  // ── 5. Activar el servicio whatsapp_bot (ÚNICO gate real del webhook) ──────
  const serviceRepo = new SupabaseTenantServiceRepository(supabase, logger);
  await serviceRepo.enable(tenantId, 'whatsapp_bot'); // idempotente (no-op si existe)
  await serviceRepo.setStatus(tenantId, 'whatsapp_bot', 'active');
  console.log('tenant_services.whatsapp_bot: active');

  // ── 6. tenant.status = sandbox (cosmético; el gating NO lo exige). ─────────
  // Solo si está en draft → sandbox (transición válida para demo). No tocar si
  // ya está sandbox/live/etc.
  const tenantRepo = new SupabaseTenantRepository(supabase, logger);
  const currentStatus = await tenantRepo.findStatusById(tenantId);
  if (currentStatus === 'draft') {
    await tenantRepo.setStatus(tenantId, 'sandbox');
    console.log('tenants.status: draft → sandbox');
  } else {
    console.log('tenants.status:', currentStatus, '(sin cambios)');
  }

  // ── 7. Persistir el flow validado como activo (un solo activo por tenant) ──
  const raw = JSON.parse(
    readFileSync(path.join(__dirname, 'cerracruz-flow.json'), 'utf8'),
  );
  const flow = validateFlow(raw); // doble check explícito; debe pasar
  const flowRepo = new SupabaseBotFlowRepository(supabase, logger);
  await flowRepo.deactivateForTenant(tenantId); // baja cualquier flow activo previo
  const { id: flowId } = await flowRepo.upsert({
    tenantId,
    nombre: FLOW_NAME,
    flow,
  });
  console.log('bot_flows: activo =', flowId, `(${FLOW_NAME})`);

  // ── 8. Verificación de lectura: lo que el bot leerá en runtime ────────────
  const active = await flowRepo.findActiveByTenant(tenantId);
  const svcStatus = await serviceRepo.findServiceStatus(tenantId, 'whatsapp_bot');

  console.log('--- RESUMEN (sin PII) ---');
  console.log('tenant_id        :', tenantId);
  console.log('servicio         :', svcStatus);
  console.log('flujo activo     :', !!active, '— start:', active?.start_node_id, '— nodos:', active?.nodes.length);
  console.log('bot_config       : OK');
  console.log('owner_data       : OK (whatsapp_dueno poblado vía env)');
}

main().catch((e) => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
