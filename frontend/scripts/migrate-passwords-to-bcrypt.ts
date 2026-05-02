/**
 * Script de migración de contraseñas a bcrypt
 * Migra todos los admin_users que no tengan hash bcrypt válido
 *
 * Uso: npx ts-node scripts/migrate-passwords-to-bcrypt.ts
 *
 * ⚠️  IMPORTANTE: Asegúrate de tener SUPABASE_SERVICE_ROLE_KEY en el .env
 * Antes de ejecutar:
 *   - Haz backup de tu base de datos
 *   - Verifica que tienes acceso de escritura a admin_users
 */

import { createServiceClient } from '../lib/supabase';
import bcrypt from 'bcryptjs';

interface AdminUser {
  id: string;
  email: string;
  password_hash: string;
  name: string;
}

async function migratePasswordsToBcrypt() {
  console.log('🔄 Iniciando migración de contraseñas a bcrypt...\n');

  try {
    const supabase = createServiceClient();

    // Obtener todos los admin_users
    const { data: adminUsers, error: fetchError } = await supabase
      .from('admin_users')
      .select('id, email, password_hash, name');

    if (fetchError) {
      console.error('❌ Error obteniendo usuarios:', fetchError);
      process.exit(1);
    }

    if (!adminUsers || adminUsers.length === 0) {
      console.log('ℹ️  No hay usuarios en admin_users');
      return;
    }

    let migrated = 0;
    let alreadyBcrypt = 0;
    let errors = 0;

    console.log(`📊 Total de usuarios encontrados: ${adminUsers.length}\n`);

    for (const user of adminUsers as AdminUser[]) {
      try {
        // Verificar si ya tiene bcrypt
        if (user.password_hash.match(/^\$2[aby]\$/)) {
          console.log(`✅ ${user.email} - Ya tiene bcrypt`);
          alreadyBcrypt++;
          continue;
        }

        // Si no es bcrypt, hashear
        console.log(`🔐 Migrando ${user.email}...`);
        const hashedPassword = await bcrypt.hash(user.password_hash, 10);

        // Actualizar en Supabase
        const { error: updateError } = await supabase
          .from('admin_users')
          .update({ password_hash: hashedPassword })
          .eq('id', user.id);

        if (updateError) {
          console.error(`❌ Error actualizando ${user.email}:`, updateError);
          errors++;
        } else {
          console.log(`✅ ${user.email} - Migrado correctamente`);
          migrated++;
        }
      } catch (error) {
        console.error(`❌ Error procesando ${user.email}:`, error);
        errors++;
      }
    }

    console.log('\n📈 REPORTE DE MIGRACIÓN:');
    console.log(`  ✅ Migrados: ${migrated}`);
    console.log(`  ✓ Ya bcrypt: ${alreadyBcrypt}`);
    console.log(`  ❌ Errores: ${errors}`);
    console.log(`\n✨ Migración completada`);
  } catch (error) {
    console.error('❌ Error fatal:', error);
    process.exit(1);
  }
}

migratePasswordsToBcrypt();

