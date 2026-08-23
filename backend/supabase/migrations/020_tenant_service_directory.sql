-- Migration 020: tenant_service_directory
-- Directorio data-driven de servicios heterogéneos por tenant (Capa 2).
-- Distinta de tenant_services (migración 012, activación de módulos SaaS).

create table if not exists public.tenant_service_directory (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  nombre text not null check (char_length(nombre) > 0),
  keywords text[] not null default '{}',
  respuesta text not null check (char_length(respuesta) > 0),
  precio numeric(10,2),
  activo boolean not null default true,
  orden integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_service_directory_tenant
  on public.tenant_service_directory(tenant_id);

create index if not exists idx_service_directory_tenant_activo
  on public.tenant_service_directory(tenant_id, activo);

drop trigger if exists trg_service_directory_updated_at on public.tenant_service_directory;
create trigger trg_service_directory_updated_at
before update on public.tenant_service_directory
for each row execute function public.set_updated_at();

comment on table public.tenant_service_directory is
  'Directorio data-driven de servicios heterogéneos por tenant (Capa 2 de la '
  'arquitectura híbrida). El operador agrega filas desde el panel sin tocar '
  'código ni el JSON del bot_flow. Ver condición service_directory_match en '
  'flowSchema.ts.';

alter table public.tenant_service_directory enable row level security;

drop policy if exists service_directory_super_all on public.tenant_service_directory;
create policy service_directory_super_all on public.tenant_service_directory
  for all using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists service_directory_admin_tenant on public.tenant_service_directory;
create policy service_directory_admin_tenant on public.tenant_service_directory
  for all using (tenant_id = public.jwt_tenant_id())
  with check (tenant_id = public.jwt_tenant_id());
