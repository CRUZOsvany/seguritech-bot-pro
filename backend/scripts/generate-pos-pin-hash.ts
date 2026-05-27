/**
 * Genera un hash bcrypt (cost=12) para el PIN de un cajero POS.
 *
 * Uso:
 *   npx ts-node backend/scripts/generate-pos-pin-hash.ts '1234'
 *
 * Pega el output en backend/supabase/migrations/seed_pos_papeleria_pilot.sql
 * como valor de pin_hash, y ejecutá ese SQL una sola vez en Supabase SQL Editor.
 *
 * Restricciones:
 * - PIN entre 4 y 8 dígitos numéricos.
 * - Mismo cost (12) que admin_users para no levantar sospechas en pentests.
 *
 * No lo loguees a archivos ni a stdout en pipelines. Salida solo a terminal.
 */
import bcrypt from 'bcryptjs';

async function main(): Promise<void> {
  const pin = process.argv[2];
  if (!pin) {
    console.error('Uso: ts-node scripts/generate-pos-pin-hash.ts <pin>');
    process.exit(1);
  }
  if (!/^\d{4,8}$/.test(pin)) {
    console.error('PIN debe ser numérico de 4 a 8 dígitos.');
    process.exit(1);
  }
  const cost = 12;
  const hash = await bcrypt.hash(pin, cost);
  console.log('\n--- hash bcrypt (cost=' + cost + ') ---');
  console.log(hash);
  console.log('\nPégalo en seed_pos_papeleria_pilot.sql como valor de pin_hash.\n');
}

main().catch((err) => {
  console.error('Error generando hash:', err);
  process.exit(1);
});
