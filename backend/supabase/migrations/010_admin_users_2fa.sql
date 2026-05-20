-- ============================================================================
-- Migration 010: 2FA TOTP opcional + must_change_password
--
-- La verificación TOTP se aplaza al backlog V2.1 (totp_enabled queda en false).
-- must_change_password=true se setea en el seed inicial para forzar rotación
-- en primer login.
-- ============================================================================

alter table public.admin_users
  add column if not exists totp_secret text,           -- base32, cifrado con META_TOKEN_ENCRYPTION_KEY
  add column if not exists totp_enabled boolean default false,
  add column if not exists must_change_password boolean default true;

comment on column public.admin_users.totp_secret is
  'Secreto base32 cifrado con AES-256-GCM (misma key que tokens Meta). NULL si totp_enabled=false.';
comment on column public.admin_users.must_change_password is
  'Si true, el siguiente login redirige a /panel/change-password.html antes de emitir cookie de sesión.';
