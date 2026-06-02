// PRIORIDAD 1: crea la fila bot_configurations que le falta a SECURITECH.
// Sin ella, SupabaseTenantConfigService.getConfig() devuelve null y el bot
// IGNORA los mensajes. Idempotente: upsert por tenant_id (unique).
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const TID = '786c56a2-1c6a-4510-9656-0a264265db01';

(async () => {
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data: existing } = await sb
    .from('bot_configurations')
    .select('id')
    .eq('tenant_id', TID)
    .maybeSingle();

  const row = {
    tenant_id: TID,
    numero_whatsapp_asignado: '+1 555 195 5555', // número sandbox de Meta (display)
    nombre_bot: 'SECURITECH Bot',
    tono_bot: 'amigable',
    mensaje_bienvenida: '¡Hola! Bienvenido a SECURITECH.',
    mensaje_menu_principal: 'Elige una opción 👇',
    mensaje_no_entendio: 'Disculpa, no te entendí 🤔.',
  };

  if (existing?.id) {
    const { error } = await sb.from('bot_configurations').update(row).eq('tenant_id', TID);
    if (error) throw new Error(error.message);
    console.log('bot_configurations: UPDATED (ya existía)');
  } else {
    const { error } = await sb.from('bot_configurations').insert(row);
    if (error) throw new Error(error.message);
    console.log('bot_configurations: INSERTED');
  }

  const { data: check } = await sb
    .from('bot_configurations')
    .select('tenant_id, numero_whatsapp_asignado, nombre_bot, tono_bot')
    .eq('tenant_id', TID)
    .maybeSingle();
  console.log('VERIFY:', JSON.stringify(check));
})().catch((e) => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
