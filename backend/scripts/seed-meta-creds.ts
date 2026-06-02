/**
 * Carga credenciales Meta de un tenant, CIFRADAS, usando el mecanismo real
 * (TokenCrypto + SupabaseMetaCredentialsRepository.upsert).
 *
 * El access token NO se pasa por argv ni se hardcodea: se lee de la env var
 * SEED_META_TOKEN para que no quede en el archivo, en logs ni en commits.
 *
 * Uso (PowerShell):
 *   $env:SEED_META_TOKEN='EAAW...'; npx ts-node -r tsconfig-paths/register `
 *     scripts/seed-meta-creds.ts <tenantId> <phoneNumberId> <wabaId> "<displayPhoneNumber>"
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import pino from 'pino';
import { TokenCrypto } from '@/infrastructure/services/TokenCrypto';
import { SupabaseMetaCredentialsRepository } from '@/infrastructure/repositories/SupabaseMetaCredentialsRepository';

async function main(): Promise<void> {
  const [tenantId, phoneNumberId, wabaId, displayPhoneNumber] = process.argv.slice(2);
  const accessToken = process.env.SEED_META_TOKEN;

  if (!tenantId || !phoneNumberId || !wabaId || !displayPhoneNumber) {
    console.error('Faltan args: <tenantId> <phoneNumberId> <wabaId> "<displayPhoneNumber>"');
    process.exit(1);
  }
  if (!accessToken) {
    console.error('Falta env var SEED_META_TOKEN con el access token.');
    process.exit(1);
  }

  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const encKey = process.env.META_TOKEN_ENCRYPTION_KEY;
  if (!url || !serviceKey || !encKey) {
    console.error('Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / META_TOKEN_ENCRYPTION_KEY en .env');
    process.exit(1);
  }

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
  const logger = pino({ level: 'info' });
  const crypto = new TokenCrypto(encKey);
  const repo = new SupabaseMetaCredentialsRepository(supabase, crypto, logger);

  await repo.upsert({ tenantId, phoneNumberId, wabaId, displayPhoneNumber, accessToken });

  // Verificación: leer crudo de DB (ciphertext) y comprobar que NO es texto plano,
  // y que al descifrar coincide con el token original.
  const { data: raw } = await supabase
    .from('tenant_meta_credentials')
    .select('phone_number_id, waba_id, display_phone_number, access_token_ciphertext, is_active')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  const cipher = raw?.access_token_ciphertext ?? '';
  const roundtrip = await repo.findByTenantId(tenantId);

  console.log('--- VERIFICACION ---');
  console.log('phone_number_id      :', raw?.phone_number_id);
  console.log('waba_id              :', raw?.waba_id);
  console.log('display_phone_number :', raw?.display_phone_number);
  console.log('is_active            :', raw?.is_active);
  console.log('ciphertext_len       :', cipher.length);
  console.log('ciphertext_es_texto_plano (contiene el token):', cipher.includes(accessToken));
  console.log('decrypt_roundtrip_ok :', roundtrip?.accessToken === accessToken);
}

main().catch((err) => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
