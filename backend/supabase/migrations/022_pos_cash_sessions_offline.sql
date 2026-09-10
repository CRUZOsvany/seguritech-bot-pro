-- ============================================================================
-- Migration 022: offline-first en pos_cash_sessions (POS Lite, T-01)
-- ============================================================================
--
-- Abrir y cerrar caja tiene que funcionar sin internet, igual que las ventas.
-- La PWA del cajero genera un UUID por apertura (client_id) antes de tocar la
-- red y reintenta hasta recibir 2xx; UNIQUE(tenant_id, client_id) hace que un
-- reintento devuelva la misma sesión en vez de abrir una segunda.
--
-- Mismo patrón que pos_sales.client_id / synced_at (migración 011).
--
-- Idempotente: se puede correr dos veces sin error.
--   - El backfill `client_id = id::text` cubre filas previas si las hubiera
--     (al 2026-09-10 no hay: el seed del piloto no toca pos_cash_sessions).
--     Verificación previa recomendada: select count(*) from public.pos_cash_sessions;
--   - El constraint se crea solo si no existe.
-- ============================================================================

alter table public.pos_cash_sessions
  add column if not exists client_id text,
  add column if not exists synced_at timestamptz;

update public.pos_cash_sessions
   set client_id = id::text
 where client_id is null;

alter table public.pos_cash_sessions
  alter column client_id set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'pos_cash_sessions_tenant_client_unique'
       and conrelid = 'public.pos_cash_sessions'::regclass
  ) then
    alter table public.pos_cash_sessions
      add constraint pos_cash_sessions_tenant_client_unique unique (tenant_id, client_id);
  end if;
end
$$;

comment on column public.pos_cash_sessions.client_id is
  'UUID generado en el cliente para offline-first. UNIQUE(tenant_id, client_id) evita abrir dos veces la misma caja al sincronizar.';
comment on column public.pos_cash_sessions.synced_at is
  'Momento en que el servidor recibió la apertura desde el cliente offline.';
