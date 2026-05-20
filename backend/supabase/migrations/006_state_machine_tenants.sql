-- ============================================================================
-- Migration 006: state machine real para tenants (Operación Búnker v2 — Sprint G)
--
-- Reemplaza el CHECK ('active','paused','unconfigured') por la FSM completa
-- draft → sandbox → live ⇄ paused → archived.
-- Aplica backfill defensivo y agrega columnas de auditoría operativa.
-- ============================================================================

-- Drop del CHECK viejo y crear el nuevo
alter table public.tenants drop constraint if exists tenants_status_check;

-- Backfill antes de aplicar el nuevo constraint:
--   unconfigured → draft
--   active       → live
--   paused queda igual
update public.tenants set status = 'draft' where status = 'unconfigured';
update public.tenants set status = 'live'  where status = 'active';

alter table public.tenants
  add constraint tenants_status_check
  check (status in ('draft','sandbox','live','paused','archived'));

-- Cambiar default a 'draft'
alter table public.tenants alter column status set default 'draft';

-- Razón de pausa/archive (auditoría operativa)
alter table public.tenants
  add column if not exists status_reason text,
  add column if not exists status_changed_at timestamptz default now(),
  add column if not exists status_changed_by uuid references public.admin_users(id) on delete set null;

-- Índice parcial sobre tenants live: aceleramos la query "qué bots están en producción".
drop index if exists public.idx_tenants_status;
create index if not exists idx_tenants_status_live on public.tenants(status) where status = 'live';

comment on column public.tenants.status is
  'FSM: draft → sandbox → live ⇄ paused → archived. Transiciones validadas en use case.';
comment on column public.tenants.status_reason is
  'Texto libre con la razón de la última transición (pausa, archivo, etc).';
