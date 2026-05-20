/**
 * Genera un hash bcrypt (cost=12) para password de admin_user.
 *
 * Uso:
 *   npx ts-node backend/scripts/generate-admin-hash.ts 'TuPasswordAquí'
 *
 * Pega el output en backend/supabase/migrations/seed_admin_user.sql
 * y ejecutá ese SQL una sola vez en Supabase SQL Editor.
 *
 * No lo loguees a archivos ni a stdout en pipelines. Salida solo a terminal.
 */
import bcrypt from 'bcryptjs';

async function main(): Promise<void> {
  const password = process.argv[2];
  if (!password) {
    console.error('Uso: ts-node scripts/generate-admin-hash.ts <password>');
    process.exit(1);
  }
  if (password.length < 12) {
    console.error('Password debe tener al menos 12 caracteres.');
    process.exit(1);
  }
  const cost = 12;
  const hash = await bcrypt.hash(password, cost);
  console.log('\n--- hash bcrypt (cost=' + cost + ') ---');
  console.log(hash);
  console.log('\nPégalo en seed_admin_user.sql como valor de password_hash.\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
