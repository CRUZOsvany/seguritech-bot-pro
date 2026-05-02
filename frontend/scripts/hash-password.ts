/**
 * Script CLI para hashear contraseñas manualmente
 * Uso: npx ts-node scripts/hash-password.ts "mi_contraseña"
 *
 * Ejemplo:
 *   npx ts-node scripts/hash-password.ts "MySecurePassword123!"
 *
 * Salida:
 *   $2b$10$... (hash bcrypt con cost factor 10)
 */

import bcrypt from 'bcryptjs';

async function hashPassword() {
  const passwordArg = process.argv[2];

  if (!passwordArg) {
    console.error('❌ Debe proporcionar una contraseña como argumento');
    console.error('Uso: npx ts-node scripts/hash-password.ts "contraseña"');
    process.exit(1);
  }

  try {
    const hash = await bcrypt.hash(passwordArg, 10);
    console.log('✅ Hash generado correctamente:');
    console.log(hash);
    console.log('\n💾 Copie este valor en el campo password_hash de Supabase');
  } catch (error) {
    console.error('❌ Error generando hash:', error);
    process.exit(1);
  }
}

hashPassword();

