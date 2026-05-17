-- ============================================================================
-- Migration 004: tenant_meta_credentials
--
-- Permite que cada tenant tenga su propio phone_number_id, waba_id y
-- access_token de Meta WhatsApp Cloud API. Indispensable para multi-bot.
--
-- Decisiones:
--   - access_token se guarda CIFRADO (AES-256-GCM) por la capa de aplicación.
--     Esta tabla almacena el ciphertext en base64 (text).
--   - meta_app_secret y meta_verify_token siguen siendo GLOBALES de SegurITech
--     (vars de entorno del proceso), porque pertenecen a la App de Meta y no
--     al tenant.
--   - display_phone_number duplica info de phone_tenant_map para auditoría y
--     debugging rápido; la fuente de verdad sigue siendo phone_tenant_map.
-- ============================================================================

create table if not exists public.tenant_meta_credentials (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null unique references public.tenants(id) on delete cascade,
  phone_number_id text not null unique,
  waba_id text not null,
  display_phone_number text not null,
  access_token_ciphertext text not null,
  is_active boolean default true,
  rotated_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_tenant_meta_creds_tenant
  on public.tenant_meta_credentials(tenant_id);
create index if not exists idx_tenant_meta_creds_phone_number_id
  on public.tenant_meta_credentials(phone_number_id);
create index if not exists idx_tenant_meta_creds_active
  on public.tenant_meta_credentials(is_active);

drop trigger if exists trg_tenant_meta_creds_updated_at
  on public.tenant_meta_credentials;
create trigger trg_tenant_meta_creds_updated_at
  before update on public.tenant_meta_credentials
  for each row execute function public.set_updated_at();

comment on table public.tenant_meta_credentials is
  'Credenciales Meta por tenant. access_token cifrado AES-256-GCM en app.';
comment on column public.tenant_meta_credentials.access_token_ciphertext is
  'Base64 de: IV (12 bytes) || authTag (16 bytes) || ciphertext';

-- RLS: defensa en profundidad (backend usa service_role, bypasea RLS)
alter table public.tenant_meta_credentials enable row level security;

drop policy if exists "service_role full access" on public.tenant_meta_credentials;
create policy "service_role full access"
  on public.tenant_meta_credentials
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');