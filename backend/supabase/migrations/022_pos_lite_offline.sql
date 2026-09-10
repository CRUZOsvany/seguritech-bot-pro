-- ============================================================================
-- Migration 022: POS Lite offline-first — caja y revisión de stock (T-01)
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

-- ============================================================================
-- Ventas marcadas para revisión de inventario
-- ============================================================================
--
-- Una venta hecha sin internet ya ocurrió cuando llega al servidor: el
-- producto salió y el dinero está en el cajón. Si el stock registrado no
-- alcanza (catálogo desactualizado en la laptop, otro cajero vendió la última
-- pieza), el servidor NO la rechaza — la registra, el trigger deja stock_qty
-- negativo y la venta queda marcada para que alguien revise el inventario.
--
-- Idempotente: add column if not exists + create index if not exists.
-- ============================================================================

alter table public.pos_sales
  add column if not exists needs_review boolean not null default false,
  add column if not exists review_reason text;

create index if not exists idx_pos_sales_needs_review
  on public.pos_sales(tenant_id, created_at desc)
  where needs_review;

comment on column public.pos_sales.needs_review is
  'true = se registró con stock insuficiente (stock_qty pudo quedar negativo). Pendiente de revisar inventario.';
comment on column public.pos_sales.review_reason is
  'Detalle legible de por qué needs_review=true (productos, pedido vs disponible al registrar).';
