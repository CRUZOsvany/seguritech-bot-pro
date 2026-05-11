-- ============================================================================
-- 002_bot_flows_engine.sql
-- Motor de flujos configurable por tenant — Sprint A
--
-- Crea las tablas flow_templates y bot_flows, agrega columnas a bot_users
-- para soportar el intérprete del Sprint B, y aplica RLS.
--
-- IMPORTANTE: backwards-compatible. No modifica datos existentes ni el
-- runtime actual. La FSM hardcodeada sigue funcionando igual al aplicar.
-- ============================================================================

-- ============================================================================
-- 1. flow_templates — plantillas reutilizables por giro
-- Solo super_admin (es activo del operador interno, no del cliente final).
-- ============================================================================
create table if not exists public.flow_templates (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  giro text not null check (giro in (
    'all','ferreteria','papeleria','cerrajeria','pizzeria','salon',
    'medico','refaccionaria','farmacia','otro'
  )),
  nombre text not null,
  descripcion text,
  json_definition jsonb not null,
  es_default boolean default false,
  version text not null default '1.0',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  -- el JSON debe ser un objeto, no array u otro tipo
  constraint flow_templates_json_is_object
    check (jsonb_typeof(json_definition) = 'object'),
  -- el objeto debe tener las claves obligatorias del contrato
  constraint flow_templates_json_has_required_keys
    check (
      json_definition ? 'version' and
      json_definition ? 'start_node_id' and
      json_definition ? 'nodes'
    )
);

create index if not exists idx_flow_templates_giro
  on public.flow_templates(giro);

create index if not exists idx_flow_templates_default
  on public.flow_templates(giro, es_default)
  where es_default = true;

drop trigger if exists trg_flow_templates_updated_at on public.flow_templates;
create trigger trg_flow_templates_updated_at
before update on public.flow_templates
for each row execute function public.set_updated_at();

comment on table public.flow_templates is
  'Plantillas de flujos por giro. Activos del operador interno. Solo super_admin.';

-- ============================================================================
-- 2. bot_flows — flow activo por tenant
-- ============================================================================
create table if not exists public.bot_flows (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  nombre text not null default 'Flujo principal',
  json_definition jsonb not null,
  is_active boolean default true,
  source_template_id uuid references public.flow_templates(id) on delete set null,
  version text not null default '1.0',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint bot_flows_json_is_object
    check (jsonb_typeof(json_definition) = 'object'),
  constraint bot_flows_json_has_required_keys
    check (
      json_definition ? 'version' and
      json_definition ? 'start_node_id' and
      json_definition ? 'nodes'
    )
);

create index if not exists idx_bot_flows_tenant
  on public.bot_flows(tenant_id);

-- Solo un flow activo por tenant en V1.
-- Si V2 requiere A/B testing, removemos este índice.
create unique index if not exists idx_bot_flows_tenant_active
  on public.bot_flows(tenant_id)
  where is_active = true;

drop trigger if exists trg_bot_flows_updated_at on public.bot_flows;
create trigger trg_bot_flows_updated_at
before update on public.bot_flows
for each row execute function public.set_updated_at();

comment on table public.bot_flows is
  'Flujo conversacional activo del bot por tenant. Interpretado en runtime por el motor (Sprint B).';

-- ============================================================================
-- 3. bot_users — agregar columnas para el intérprete (sin tocar current_state)
-- Nullable, sin migración de datos. El Sprint B las pobla y eventualmente
-- deprecará current_state. Backwards-compatible.
-- ============================================================================
alter table public.bot_users
  add column if not exists current_node_id text,
  add column if not exists context jsonb default '{}'::jsonb;

comment on column public.bot_users.current_node_id is
  'Nodo actual en el flow del tenant. Reemplazará a current_state cuando el motor (Sprint B) esté en producción.';

comment on column public.bot_users.context is
  'Contexto conversacional libre. Variables capturadas vía wait_input.save_to_context o list_item_any.save_to_context.';

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
alter table public.flow_templates enable row level security;
alter table public.bot_flows      enable row level security;

-- flow_templates: solo super_admin
drop policy if exists flow_templates_super_all on public.flow_templates;
create policy flow_templates_super_all on public.flow_templates
  for all
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- bot_flows: super_admin todo, admin_operator solo su tenant
drop policy if exists bot_flows_super_all on public.bot_flows;
create policy bot_flows_super_all on public.bot_flows
  for all
  using (public.is_super_admin())
  with check (public.is_super_admin());

drop policy if exists bot_flows_admin_tenant on public.bot_flows;
create policy bot_flows_admin_tenant on public.bot_flows
  for all
  using (tenant_id = public.jwt_tenant_id())
  with check (tenant_id = public.jwt_tenant_id());