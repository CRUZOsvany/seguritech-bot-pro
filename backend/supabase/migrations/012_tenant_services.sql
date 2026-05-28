-- ============================================================================
-- 012 — Capa modular de servicios
-- Un tenant es un negocio que contrata N servicios independientes.
-- Cada servicio tiene su propio ciclo de vida (status FSM).
-- ============================================================================

create table if not exists public.tenant_services (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  service_type text not null check (service_type in
                 ('whatsapp_bot','messenger_bot','pos')),
  status       text not null default 'draft' check (status in
                 ('draft','configuring','active','paused','archived')),
  enabled_at   timestamptz,
  config       jsonb not null default '{}'::jsonb,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now(),
  -- Un servicio puede existir una sola vez por tenant.
  unique (tenant_id, service_type)
);

create index if not exists idx_tenant_services_tenant
  on public.tenant_services(tenant_id);

-- Índice parcial para el lookup caliente del webhook: servicios activos por tipo.
create index if not exists idx_tenant_services_active
  on public.tenant_services(tenant_id, service_type)
  where status = 'active';

-- Trigger updated_at (reusa la función set_updated_at de migration 001)
drop trigger if exists trg_tenant_services_updated_at on public.tenant_services;
create trigger trg_tenant_services_updated_at
before update on public.tenant_services
for each row execute function public.set_updated_at();

-- RLS defense-in-depth (backend usa service_role, bypasea RLS)
alter table public.tenant_services enable row level security;

drop policy if exists tenant_services_service_role on public.tenant_services;
create policy tenant_services_service_role on public.tenant_services
  for all to service_role using (true) with check (true);

comment on table public.tenant_services is
  'Servicios contratados por cada tenant. Modelo modular: whatsapp_bot, messenger_bot, pos.';
