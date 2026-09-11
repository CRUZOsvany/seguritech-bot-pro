-- ============================================================================
-- 023 — Studio, Fase 4: publicación atómica, reportes por versión y casos de prueba
-- ============================================================================
--
-- 1. bot_flow_versions guarda con qué validación y qué pruebas se publicó
--    cada versión.
-- 2. publish_flow_version(): publicar en UNA transacción. Antes eran tres
--    escrituras sueltas desde supabase-js (insertar versión, desactivar
--    hermanos, activar), con una ventana sin flow activo en la que un
--    cliente recibía "en mantenimiento".
-- 3. flow_test_cases: conversaciones guardadas que tienen que pasar antes de
--    publicar. tenant_id + RLS (regla 9).
--
-- Idempotente: se puede correr dos veces.

-- 1 -------------------------------------------------------------------------
alter table public.bot_flow_versions
  add column if not exists validation_report jsonb,
  add column if not exists test_report jsonb;

comment on column public.bot_flow_versions.validation_report is
  'Reporte del validador de diseño del Studio al publicar esta versión.';
comment on column public.bot_flow_versions.test_report is
  'Resultado de los casos de prueba al publicar esta versión. NULL en rollbacks.';

-- 2 -------------------------------------------------------------------------
create or replace function public.publish_flow_version(
  p_tenant_id          uuid,
  p_flow_id            uuid,
  p_flow_json          jsonb,
  p_created_by         uuid,
  p_note               text,
  p_validation_report  jsonb,
  p_test_report        jsonb,
  p_clear_draft        boolean,
  -- Publicar un borrador: el draft_updated_at con el que se validó. Si el
  -- borrador cambió entre la validación y este momento, no se publica lo
  -- que nadie revisó. En un rollback va p_check_draft = false.
  p_check_draft        boolean,
  p_expected_draft_updated_at timestamptz
) returns integer
language plpgsql
set search_path = public
as $$
declare
  v_channel text;
  v_draft_updated_at timestamptz;
  v_version integer;
begin
  -- Bloquea la fila del flow: dos publicaciones del mismo flow se serializan.
  select channel, draft_updated_at into v_channel, v_draft_updated_at
    from public.bot_flows
   where id = p_flow_id and tenant_id = p_tenant_id
   for update;
  if not found then
    raise exception 'El flow % no existe para el tenant %', p_flow_id, p_tenant_id
      using errcode = 'P0002';
  end if;

  if p_check_draft and v_draft_updated_at is distinct from p_expected_draft_updated_at then
    raise exception 'draft_changed' using errcode = '40001';
  end if;

  select coalesce(max(version_number), 0) + 1 into v_version
    from public.bot_flow_versions
   where flow_id = p_flow_id;

  insert into public.bot_flow_versions
    (tenant_id, flow_id, version_number, flow_json, created_by, note, validation_report, test_report)
  values
    (p_tenant_id, p_flow_id, v_version, p_flow_json, p_created_by, p_note, p_validation_report, p_test_report);

  -- Un solo flow activo por (tenant, canal): primero se apagan los demás.
  update public.bot_flows
     set is_active = false
   where tenant_id = p_tenant_id and channel = v_channel and is_active and id <> p_flow_id;

  update public.bot_flows
     set json_definition  = p_flow_json,
         is_active        = true,
         draft_json       = case when p_clear_draft then null else draft_json end,
         draft_updated_at = case when p_clear_draft then null else draft_updated_at end
   where id = p_flow_id and tenant_id = p_tenant_id;

  return v_version;
end;
$$;

comment on function public.publish_flow_version is
  'Studio Fase 4: publica (o hace rollback de) un flow en una sola transacción.';

-- Postgres deja ejecutar funciones nuevas a PUBLIC y PostgREST las expone por
-- REST: sin esto, cualquiera con la anon key podría publicar un flow.
revoke all on function public.publish_flow_version(uuid, uuid, jsonb, uuid, text, jsonb, jsonb, boolean, boolean, timestamptz)
  from public, anon, authenticated;
grant execute on function public.publish_flow_version(uuid, uuid, jsonb, uuid, text, jsonb, jsonb, boolean, boolean, timestamptz)
  to service_role;

-- 3 -------------------------------------------------------------------------
create table if not exists public.flow_test_cases (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  flow_id     uuid not null references public.bot_flows(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 120),
  -- Eventos del cliente simulado, en el vocabulario del webhook de Meta
  -- (ver SimEventSchema en studioSimulation.ts).
  events      jsonb not null check (jsonb_typeof(events) = 'array'),
  -- Qué tiene que pasar al final: { node?, vars?, contains?, notContains?, maxMessages? }
  expect      jsonb not null check (jsonb_typeof(expect) = 'object'),
  -- Hora de arranque y teléfono del cliente simulado, opcionales.
  options     jsonb not null default '{}'::jsonb check (jsonb_typeof(options) = 'object'),
  created_by  uuid references public.admin_users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_flow_test_cases_flow on public.flow_test_cases(flow_id, created_at);
create index if not exists idx_flow_test_cases_tenant on public.flow_test_cases(tenant_id);

drop trigger if exists trg_flow_test_cases_updated_at on public.flow_test_cases;
create trigger trg_flow_test_cases_updated_at
before update on public.flow_test_cases
for each row execute function public.set_updated_at();

comment on table public.flow_test_cases is
  'Studio Fase 4: conversaciones guardadas que tienen que pasar para publicar el flow.';

alter table public.flow_test_cases enable row level security;

drop policy if exists flow_test_cases_super_all on public.flow_test_cases;
create policy flow_test_cases_super_all on public.flow_test_cases
  for all using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists flow_test_cases_admin_tenant on public.flow_test_cases;
create policy flow_test_cases_admin_tenant on public.flow_test_cases
  for all using (tenant_id = public.jwt_tenant_id())
  with check (tenant_id = public.jwt_tenant_id());
