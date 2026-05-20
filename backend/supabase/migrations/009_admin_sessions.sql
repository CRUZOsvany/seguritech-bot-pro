-- ============================================================================
-- Migration 009: denylist de sesiones (logout server-side) + login attempts
--
-- admin_sessions_revoked: jtis revocados explícitamente en /logout.
-- admin_login_attempts:   intentos de login (lockout 5 fallos en 15min).
-- ============================================================================

create table if not exists public.admin_sessions_revoked (
  jti          text primary key,        -- JWT ID (hex, generado por JwtService)
  admin_id     uuid references public.admin_users(id) on delete cascade,
  revoked_at   timestamptz default now(),
  expires_at   timestamptz not null     -- cuando el JWT exp pasa, podemos borrar la fila
);

create index if not exists idx_revoked_expires on public.admin_sessions_revoked(expires_at);

-- Cron diario para limpiar (requires pg_cron):
-- select cron.schedule('cleanup-revoked-sessions','0 4 * * *',
--   $$delete from public.admin_sessions_revoked where expires_at < now()$$);

comment on table public.admin_sessions_revoked is
  'JWTs revocados por logout. Sin esta tabla un JWT robado seguiría válido hasta su exp.';

-- ----------------------------------------------------------------------------
-- Intentos de login (lockout por cuenta o IP)
-- ----------------------------------------------------------------------------

create table if not exists public.admin_login_attempts (
  id           bigserial primary key,
  email        text not null,
  ip           inet,
  success      boolean not null,
  created_at   timestamptz default now()
);

create index if not exists idx_login_attempts_email on public.admin_login_attempts(email, created_at desc);
create index if not exists idx_login_attempts_ip    on public.admin_login_attempts(ip, created_at desc);

comment on table public.admin_login_attempts is
  'Histórico de intentos de login. Usado para lockout (5 fallos en 15min).';

-- RLS: solo super_admin lee. Service_role inserta siempre.
alter table public.admin_sessions_revoked enable row level security;
alter table public.admin_login_attempts   enable row level security;

drop policy if exists sessions_revoked_super on public.admin_sessions_revoked;
create policy sessions_revoked_super on public.admin_sessions_revoked
  for select to authenticated
  using (exists (
    select 1 from public.admin_users a
    where a.user_id = auth.uid() and a.role = 'super_admin'
  ));

drop policy if exists login_attempts_super on public.admin_login_attempts;
create policy login_attempts_super on public.admin_login_attempts
  for select to authenticated
  using (exists (
    select 1 from public.admin_users a
    where a.user_id = auth.uid() and a.role = 'super_admin'
  ));
