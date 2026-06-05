// Inserta owner_data (teléfono del dueño) para SECURITECH. Idempotente.
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const TID = '786c56a2-1c6a-4510-9656-0a264265db01';
(async () => {
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const row = { tenant_id: TID, nombre_dueno: 'SECURITECH', whatsapp_dueno: '5217474592444', monto_mensual: 0 };
  const { data: ex } = await sb.from('owner_data').select('id').eq('tenant_id', TID).maybeSingle();
  if (ex?.id) {
    const { error } = await sb.from('owner_data').update(row).eq('tenant_id', TID);
    if (error) throw new Error(error.message);
    console.log('owner_data: UPDATED');
  } else {
    const { error } = await sb.from('owner_data').insert(row);
    if (error) throw new Error(error.message);
    console.log('owner_data: INSERTED');
  }
  const { data } = await sb.from('owner_data').select('whatsapp_dueno, nombre_dueno').eq('tenant_id', TID).maybeSingle();
  console.log('VERIFY:', JSON.stringify(data));
})().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
