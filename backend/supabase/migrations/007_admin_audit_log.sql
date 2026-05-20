-- ============================================================================
-- Migration 007: audit log para toda acción del panel admin
--
-- Append-only. NUNCA delete ni update. Inmutable por diseño.
-- ============================================================================

create table if not exists public.admin_audit_log (
  id           bigserial primary key,
  admin_id     uuid references public.admin_users(id) on delete set null,
  admin_email  text not null,           -- desnormalizado por si se borra el admin
  action       text not null,           -- 'tenant.create', 'tenant.status.change', 'meta.rotate', etc.
  target_type  text,                    -- 'tenant', 'flow', 'meta_credentials'
  target_id    text,                    -- uuid o slug
  ip           inet,
  user_agent   text,
  metadata     jsonb default '{}'::jsonb,
  created_at   timestamptz default now()
);

create index if not exists idx_audit_admin  on public.admin_audit_log(admin_id, created_at desc);
create index if not exists idx_audit_target on public.admin_audit_log(target_type, target_id, created_at desc);
create index if not exists idx_audit_action on public.admin_audit_log(action, created_at desc);

alter table public.admin_audit_log enable row level security;

-- Solo super_admin lee; el insertar lo hace el service_role siempre (bypasea RLS).
drop policy if exists audit_super_select on public.admin_audit_log;
create policy audit_super_select on public.admin_audit_log
  for select to authenticated
  using (exists (
    select 1 from public.admin_users a
    where a.user_id = auth.uid() and a.role = 'super_admin'
  ));

comment on table public.admin_audit_log is
  'Append-only. NUNCA delete ni update. Inmutable por diseño.';
