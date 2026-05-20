-- ============================================================================
-- Migration 005: soft-delete en tenants
--
-- Permite "eliminar" un tenant desde el panel sin perder histórico de mensajes
-- ni romper FKs en cascada. Las queries productivas filtran por deleted_at IS NULL.
-- El histórico sigue consultable para auditoría.
-- ============================================================================

alter table public.tenants
  add column if not exists deleted_at timestamptz;

create index if not exists idx_tenants_active
  on public.tenants(id)
  where deleted_at is null;

comment on column public.tenants.deleted_at is
  'Si NOT NULL, el tenant está eliminado lógicamente. Las queries productivas filtran por NULL.';
