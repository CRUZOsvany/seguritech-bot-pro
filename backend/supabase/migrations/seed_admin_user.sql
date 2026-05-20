-- ============================================================================
-- Seed manual: primer super_admin.
--
-- INSTRUCCIONES:
--   1. Generá el hash bcrypt con:
--        npx ts-node backend/scripts/generate-admin-hash.ts 'TuPasswordAquí'
--      (cost=12, mismo que ADMIN_BCRYPT_COST).
--   2. Pegá el hash en la línea password_hash de abajo.
--   3. Ejecutá este SQL una sola vez en Supabase SQL Editor.
--
-- En primer login, must_change_password=true te redirige a /panel/change-password.html
-- para que cambies la contraseña antes de emitir cookie de sesión.
-- ============================================================================

insert into public.admin_users (email, password_hash, name, role, must_change_password)
values (
  'micho@seguritech.com',
  '$2a$12$REEMPLAZAR_CON_HASH_REAL_GENERADO_POR_SCRIPT',
  'Cris (Micho)',
  'super_admin',
  true
) on conflict (email) do nothing;
