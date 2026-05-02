-- ============================================================================
-- SegurITech Bot Pro — Schema completo multi-tenant con RLS
-- Migration 002: Reemplaza la persistencia SQLite por Supabase Postgres
--
-- IMPORTANTE — modelo de seguridad:
-- El backend usa la service_role key, que BYPASEA RLS por diseño de Supabase.
-- Las políticas RLS de este schema son DEFENSA EN PROFUNDIDAD para cuando:
--   (a) Migres autenticación a Supabase Auth con anon key + JWT custom claims
--   (b) Algún path del frontend exponga la anon key sin querer
-- Por ahora la seguridad multi-tenant la garantiza el filtrado por tenant_id
-- en /api/clients/route.ts y en el dominio del backend.
-- ============================================================================

-- Extensiones
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ============================================================================
-- TRIGGER REUSABLE: actualizar updated_at automáticamente
-- ============================================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================================
-- 1. TENANTS — los negocios cliente del SaaS
-- ============================================================================
create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  nombre_negocio text not null,
  giro text not null check (giro in (
    'ferreteria','papeleria','cerrajeria','pizzeria','salon',
    'medico','refaccionaria','farmacia','otro'
  )),
  direccion text,
  horario_semana text,
  horario_sabado text,
  abre_domingo boolean default false,
  status text not null default 'unconfigured'
    check (status in ('active','paused','unconfigured')),
  webhook_verified boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_tenants_status on public.tenants(status);

drop trigger if exists trg_tenants_updated_at on public.tenants;
create trigger trg_tenants_updated_at
before update on public.tenants
for each row execute function public.set_updated_at();

comment on table public.tenants is 'Negocios cliente del SaaS. Cada uno con su propia config de bot.';

-- ============================================================================
-- 2. ADMIN_USERS — usuarios del panel (NextAuth + bcrypt)
-- ============================================================================
create table if not exists public.admin_users (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  name text not null,
  role text not null check (role in ('super_admin','admin_operator')),
  tenant_id uuid references public.tenants(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_admin_users_email on public.admin_users(email);
create index if not exists idx_admin_users_tenant on public.admin_users(tenant_id);
create index if not exists idx_admin_users_role on public.admin_users(role);

drop trigger if exists trg_admin_users_updated_at on public.admin_users;
create trigger trg_admin_users_updated_at
before update on public.admin_users
for each row execute function public.set_updated_at();

comment on table public.admin_users is 'Usuarios del panel admin. Autenticados via NextAuth + bcrypt.';

-- ============================================================================
-- 3. OWNER_DATA — datos de cobranza por tenant (1:1)
-- ============================================================================
create table if not exists public.owner_data (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null unique references public.tenants(id) on delete cascade,
  nombre_dueno text not null,
  whatsapp_dueno text not null,
  monto_mensual numeric(10,2) not null default 0 check (monto_mensual >= 0),
  fecha_proximo_pago date,
  notas_internas text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_owner_data_payment_date on public.owner_data(fecha_proximo_pago);

drop trigger if exists trg_owner_data_updated_at on public.owner_data;
create trigger trg_owner_data_updated_at
before update on public.owner_data
for each row execute function public.set_updated_at();

-- ============================================================================
-- 4. BOT_CONFIGURATIONS — configuración del bot por tenant (1:1)
-- ============================================================================
create table if not exists public.bot_configurations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null unique references public.tenants(id) on delete cascade,
  numero_whatsapp_asignado text not null,
  nombre_bot text not null default 'Asistente',
  tono_bot text not null default 'amigable'
    check (tono_bot in ('formal','amigable','directo')),
  mensaje_bienvenida text default '¡Hola! ¿En qué puedo ayudarte?',
  mensaje_menu_principal text,
  mensaje_fuera_horario text,
  mensaje_no_entendio text default 'Disculpa, no entendí. ¿Puedes reformular?',
  mensaje_confirmacion_pedido text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_bot_config_whatsapp on public.bot_configurations(numero_whatsapp_asignado);

drop trigger if exists trg_bot_configurations_updated_at on public.bot_configurations;
create trigger trg_bot_configurations_updated_at
before update on public.bot_configurations
for each row execute function public.set_updated_at();

-- ============================================================================
-- 5. URGENT_SERVICE_CONFIG — alertas urgentes por tenant (1:1)
-- ============================================================================
create table if not exists public.urgent_service_config (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null unique references public.tenants(id) on delete cascade,
  tiene_servicio_urgente boolean default false,
  whatsapp_alertas_urgentes text,
  mensaje_alerta_admin text,
  tiempo_respuesta_prometido text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

drop trigger if exists trg_urgent_service_updated_at on public.urgent_service_config;
create trigger trg_urgent_service_updated_at
before update on public.urgent_service_config
for each row execute function public.set_updated_at();

-- ============================================================================
-- 6. CATALOG_ITEMS — catálogo de productos por tenant (1:N)
-- ============================================================================
create table if not exists public.catalog_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  nombre_producto text not null,
  descripcion text,
  precio numeric(10,2) not null default 0 check (precio >= 0),
  categoria text,
  disponible boolean default true,
  imagen_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_catalog_tenant on public.catalog_items(tenant_id);
create index if not exists idx_catalog_disponible on public.catalog_items(tenant_id, disponible);

drop trigger if exists trg_catalog_items_updated_at on public.catalog_items;
create trigger trg_catalog_items_updated_at
before update on public.catalog_items
for each row execute function public.set_updated_at();

-- ============================================================================
-- 7. BOT_USERS — usuarios finales de WhatsApp con su estado FSM
-- (Reemplaza la tabla `users` del SqliteUserRepository)
-- ============================================================================
create table if not exists public.bot_users (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  phone_number text not null,
  current_state text not null default 'initial'
    check (current_state in (
      'initial','menu','viewing_products','making_order','confirming_order'
    )),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (tenant_id, phone_number)
);

create index if not exists idx_bot_users_tenant_phone on public.bot_users(tenant_id, phone_number);

drop trigger if exists trg_bot_users_updated_at on public.bot_users;
create trigger trg_bot_users_updated_at
before update on public.bot_users
for each row execute function public.set_updated_at();

comment on table public.bot_users is 'Usuarios finales de WhatsApp que conversan con el bot. Mantienen estado FSM por tenant.';

-- ============================================================================
-- 8. MESSAGES — log de mensajes con idempotencia de webhook
-- ============================================================================
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  from_phone text not null,
  content text not null,
  response text,
  direction text not null check (direction in ('inbound','outbound')),
  meta_message_id text,
  timestamp timestamptz default now()
);

create index if not exists idx_messages_tenant_ts on public.messages(tenant_id, timestamp desc);
create unique index if not exists idx_messages_meta_id
  on public.messages(meta_message_id)
  where meta_message_id is not null;

comment on column public.messages.meta_message_id is 'ID del mensaje en Meta. Permite deduplicar reintentos de webhook.';

-- ============================================================================
-- 9. PHONE_TENANT_MAP — lookup phone -> tenant para webhook sin :tenantId
-- ============================================================================
create table if not exists public.phone_tenant_map (
  phone_number text primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_phone_tenant_map_tenant_id on public.phone_tenant_map(tenant_id);
create index if not exists idx_phone_tenant_map_is_active on public.phone_tenant_map(is_active);

drop trigger if exists trg_phone_tenant_map_updated_at on public.phone_tenant_map;
create trigger trg_phone_tenant_map_updated_at
before update on public.phone_tenant_map
for each row execute function public.set_updated_at();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
alter table public.tenants               enable row level security;
alter table public.admin_users           enable row level security;
alter table public.owner_data            enable row level security;
alter table public.bot_configurations    enable row level security;
alter table public.urgent_service_config enable row level security;
alter table public.catalog_items         enable row level security;
alter table public.bot_users             enable row level security;
alter table public.messages              enable row level security;
alter table public.phone_tenant_map      enable row level security;

-- ----------------------------------------------------------------------------
-- Helper functions: leen claims del JWT (compatibles con Supabase Auth y con
-- JWTs custom firmados por NextAuth con el mismo secret de Supabase)
-- ----------------------------------------------------------------------------
create or replace function public.jwt_role()
returns text
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    ''
  );
$$;

create or replace function public.jwt_tenant_id()
returns uuid
language sql stable
as $$
  select nullif(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'tenantId',
    ''
  )::uuid;
$$;

create or replace function public.is_super_admin()
returns boolean
language sql stable
as $$
  select public.jwt_role() = 'super_admin';
$$;

-- ----------------------------------------------------------------------------
-- POLÍTICAS RLS
-- Patrón: super_admin ve todo. admin_operator solo su tenant_id.
-- (service_role bypasea TODO esto.)
-- ----------------------------------------------------------------------------

-- TENANTS
drop policy if exists tenants_super_all on public.tenants;
create policy tenants_super_all on public.tenants
  for all
  using (public.is_super_admin())
  with check (public.is_super_admin());

drop policy if exists tenants_admin_select on public.tenants;
create policy tenants_admin_select on public.tenants
  for select
  using (id = public.jwt_tenant_id());

-- ADMIN_USERS
drop policy if exists admin_users_super_all on public.admin_users;
create policy admin_users_super_all on public.admin_users
  for all
  using (public.is_super_admin())
  with check (public.is_super_admin());

drop policy if exists admin_users_self_select on public.admin_users;
create policy admin_users_self_select on public.admin_users
  for select
  using (
    user_id::text = (
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
    )
  );

-- OWNER_DATA — info de cobranza, solo super_admin
drop policy if exists owner_data_super_all on public.owner_data;
create policy owner_data_super_all on public.owner_data
  for all
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- BOT_CONFIGURATIONS
drop policy if exists bot_config_super_all on public.bot_configurations;
create policy bot_config_super_all on public.bot_configurations
  for all
  using (public.is_super_admin())
  with check (public.is_super_admin());

drop policy if exists bot_config_admin_tenant on public.bot_configurations;
create policy bot_config_admin_tenant on public.bot_configurations
  for all
  using (tenant_id = public.jwt_tenant_id())
  with check (tenant_id = public.jwt_tenant_id());

-- URGENT_SERVICE_CONFIG
drop policy if exists urgent_super_all on public.urgent_service_config;
create policy urgent_super_all on public.urgent_service_config
  for all
  using (public.is_super_admin())
  with check (public.is_super_admin());

drop policy if exists urgent_admin_tenant on public.urgent_service_config;
create policy urgent_admin_tenant on public.urgent_service_config
  for all
  using (tenant_id = public.jwt_tenant_id())
  with check (tenant_id = public.jwt_tenant_id());

-- CATALOG_ITEMS
drop policy if exists catalog_super_all on public.catalog_items;
create policy catalog_super_all on public.catalog_items
  for all
  using (public.is_super_admin())
  with check (public.is_super_admin());

drop policy if exists catalog_admin_tenant on public.catalog_items;
create policy catalog_admin_tenant on public.catalog_items
  for all
  using (tenant_id = public.jwt_tenant_id())
  with check (tenant_id = public.jwt_tenant_id());

-- BOT_USERS — solo lectura desde el panel
drop policy if exists bot_users_super_all on public.bot_users;
create policy bot_users_super_all on public.bot_users
  for all
  using (public.is_super_admin())
  with check (public.is_super_admin());

drop policy if exists bot_users_admin_select on public.bot_users;
create policy bot_users_admin_select on public.bot_users
  for select
  using (tenant_id = public.jwt_tenant_id());

-- MESSAGES — solo lectura desde el panel
drop policy if exists messages_super_all on public.messages;
create policy messages_super_all on public.messages
  for all
  using (public.is_super_admin())
  with check (public.is_super_admin());

drop policy if exists messages_admin_select on public.messages;
create policy messages_admin_select on public.messages
  for select
  using (tenant_id = public.jwt_tenant_id());

-- PHONE_TENANT_MAP — solo super_admin
drop policy if exists phone_map_super_all on public.phone_tenant_map;
create policy phone_map_super_all on public.phone_tenant_map
  for all
  using (public.is_super_admin())
  with check (public.is_super_admin());