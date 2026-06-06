-- ============================================================================
-- Migration 016: Tabla whatsapp_flows
--
-- Almacena los WhatsApp Flows (formularios multipantalla) publicados en Meta
-- Business Manager, referenciados desde nodos `send_whatsapp_flow` en bot_flows.
--
-- Relación con el sistema de flows del bot:
--   bot_flows.json_definition → SendWhatsappFlowNode.content.whatsapp_flow_id
--   → whatsapp_flows.id (UUID interno)
--   → whatsapp_flows.flow_id_meta (ID externo de Meta, obtenido de Business Manager)
--
-- El campo flow_id_meta lo gestiona el equipo SegurITech manualmente
-- desde el panel admin. NO hay publicación automática a Meta en V1.
--
-- Modelo de seguridad: service_role bypasea RLS (backend exclusivo).
-- RLS policies son defensa en profundidad.
-- ============================================================================

create table if not exists public.whatsapp_flows (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,

  -- Nombre descriptivo para el panel admin (no visible al usuario final)
  name            text not null check (char_length(name) between 1 and 120),

  -- ID externo de Meta Business Manager (obtenido manualmente del panel de Meta)
  -- Nullable: puede crearse el registro antes de publicar el Flow en Meta
  flow_id_meta    text check (flow_id_meta is null or char_length(flow_id_meta) between 1 and 100),

  -- JSON del formulario (estructura de pantallas, campos, etc.)
  -- Nullable: el equipo puede añadir la estructura después de crear el registro
  flow_json       jsonb,

  -- Estado del ciclo de vida en Meta
  -- draft    → en desarrollo en Meta Business Manager (modo prueba)
  -- active   → publicado y listo para producción
  -- archived → fuera de uso, no se puede usar en nuevos nodos
  status          text not null default 'draft'
                  check (status in ('draft', 'active', 'archived')),

  -- Metadatos de auditoría
  created_by      uuid references public.admin_users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Índice de lookup principal: por tenant
create index if not exists idx_whatsapp_flows_tenant
  on public.whatsapp_flows(tenant_id);

-- Índice para lookup rápido por flow_id_meta (webhook de nfm_reply)
create index if not exists idx_whatsapp_flows_meta_id
  on public.whatsapp_flows(flow_id_meta)
  where flow_id_meta is not null;

-- Índice de status por tenant (para filtrar activos desde el panel)
create index if not exists idx_whatsapp_flows_tenant_status
  on public.whatsapp_flows(tenant_id, status);

-- Trigger de updated_at (reusa la función set_updated_at de migration 001)
drop trigger if exists trg_whatsapp_flows_updated_at on public.whatsapp_flows;
create trigger trg_whatsapp_flows_updated_at
  before update on public.whatsapp_flows
  for each row execute function public.set_updated_at();

comment on table public.whatsapp_flows is
  'WhatsApp Flows (formularios multipantalla) de Meta. Referenciados desde nodos send_whatsapp_flow en bot_flows.json_definition.';

comment on column public.whatsapp_flows.flow_id_meta is
  'ID del Flow en Meta Business Manager. Gestionado manualmente desde el panel SegurITech. NULL = aún no publicado en Meta.';

comment on column public.whatsapp_flows.flow_json is
  'Estructura JSON del formulario (pantallas, campos, validaciones). Nullable en V1 — el equipo puede añadirla después.';

comment on column public.whatsapp_flows.status is
  'Ciclo de vida: draft (en desarrollo) | active (publicado en Meta) | archived (fuera de uso).';

-- ============================================================================
-- RLS — defensa en profundidad (el backend usa service_role, bypasea RLS)
--
-- Mismo patrón que bot_flows (migration 002): helpers is_super_admin() /
-- jwt_tenant_id() + drop-then-create (CREATE POLICY no admite IF NOT EXISTS).
-- ============================================================================

alter table public.whatsapp_flows enable row level security;

-- super_admin: acceso completo a todos los tenants
drop policy if exists whatsapp_flows_super_all on public.whatsapp_flows;
create policy whatsapp_flows_super_all on public.whatsapp_flows
  for all
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- admin_operator: solo su tenant
drop policy if exists whatsapp_flows_admin_tenant on public.whatsapp_flows;
create policy whatsapp_flows_admin_tenant on public.whatsapp_flows
  for all
  using (tenant_id = public.jwt_tenant_id())
  with check (tenant_id = public.jwt_tenant_id());
