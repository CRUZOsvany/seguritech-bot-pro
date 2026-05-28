-- ============================================================================
-- 014 — Backfill: tenants existentes a la capa de servicios
-- Idempotente (on conflict do nothing). Seguro re-ejecutar.
-- ============================================================================

-- Todo tenant existente tiene servicio whatsapp_bot (el modelo viejo asumía bot).
-- El status del servicio MAPEA el status del tenant:
--   tenant live/sandbox → servicio active
--   tenant paused       → servicio paused
--   tenant draft        → servicio draft
--   tenant archived     → servicio archived
insert into public.tenant_services (tenant_id, service_type, status, enabled_at)
select
  t.id,
  'whatsapp_bot',
  case
    when t.status in ('live','sandbox') then 'active'
    when t.status = 'paused'            then 'paused'
    when t.status = 'archived'          then 'archived'
    else 'draft'
  end,
  case when t.status in ('live','sandbox') then now() else null end
from public.tenants t
where t.deleted_at is null
on conflict (tenant_id, service_type) do nothing;

-- Tenants con config POS → servicio pos en estado configuring.
insert into public.tenant_services (tenant_id, service_type, status)
select distinct ptc.tenant_id, 'pos', 'configuring'
from public.pos_tenant_config ptc
on conflict (tenant_id, service_type) do nothing;
