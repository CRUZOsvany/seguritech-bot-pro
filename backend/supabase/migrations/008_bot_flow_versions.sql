-- ============================================================================
-- Migration 008: versionado de flows + rollback (Sprint H)
--
-- Cada upsert sobre bot_flows debe crear una fila en bot_flow_versions
-- (responsabilidad del repo, no de un trigger). Permite rollback explícito.
-- ============================================================================

create table if not exists public.bot_flow_versions (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  flow_id         uuid not null references public.bot_flows(id) on delete cascade,
  version_number  int  not null,
  flow_json       jsonb not null,
  created_by      uuid references public.admin_users(id) on delete set null,
  created_at      timestamptz default now(),
  note            text,
  unique (flow_id, version_number)
);

create index if not exists idx_flow_versions_flow   on public.bot_flow_versions(flow_id, version_number desc);
create index if not exists idx_flow_versions_tenant on public.bot_flow_versions(tenant_id, created_at desc);

alter table public.bot_flow_versions enable row level security;

drop policy if exists flow_versions_super on public.bot_flow_versions;
create policy flow_versions_super on public.bot_flow_versions
  for all to authenticated
  using (exists (select 1 from public.admin_users a where a.user_id = auth.uid() and a.role = 'super_admin'))
  with check (exists (select 1 from public.admin_users a where a.user_id = auth.uid() and a.role = 'super_admin'));

comment on table public.bot_flow_versions is
  'Histórico de versiones de flows por tenant. version_number monótono ascendente por flow_id.';
