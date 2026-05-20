-- ============================================================================
-- Migration 011: POS Module Bootstrap (Sprint 5.1a)
--
-- Agrega el módulo Punto de Venta como segundo producto del monorepo. Coexiste
-- con el módulo Bot sin tocar tablas existentes salvo:
--   - tenants.enabled_modules (TEXT[]) — controla qué módulos están activos
--     por tenant. Default ARRAY['bot'] para no romper a los tenants existentes.
--
-- Modelo de seguridad (igual que el resto del esquema):
--   El backend usa service_role → BYPASEA RLS. El aislamiento real lo dan los
--   WHERE tenant_id = ? en los repositorios. Las policies RLS son DEFENSA EN
--   PROFUNDIDAD para el día en que algún path use anon key con JWT custom.
--
-- 12 tablas nuevas: 11 del POS canónico + pos_users (cajeros, separados de
-- admin_users porque la auth es PIN bcrypt, no email/password).
-- ============================================================================

-- ============================================================================
-- 0. Extender tenants con módulos habilitados
-- ============================================================================
alter table public.tenants
  add column if not exists enabled_modules text[] not null default array['bot']::text[];

comment on column public.tenants.enabled_modules is
  'Módulos activos del tenant. Valores válidos: bot, pos. Ej: ARRAY[''bot'',''pos''].';

-- ============================================================================
-- 1. POS_USERS — operadores del POS (cajeros). Tabla aparte de admin_users.
--    Auth por PIN bcrypt + lockout on-row (failed_attempts, locked_until).
-- ============================================================================
create table if not exists public.pos_users (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  name            text not null,
  pin_hash        text not null,
  role            text not null default 'pos_cashier'
                  check (role in ('pos_cashier','pos_manager')),
  is_active       boolean not null default true,
  failed_attempts int not null default 0,
  locked_until    timestamptz,
  last_login_at   timestamptz,
  created_at      timestamptz not null default now(),
  unique(tenant_id, name)
);

create index if not exists idx_pos_users_tenant on public.pos_users(tenant_id);
create index if not exists idx_pos_users_active
  on public.pos_users(tenant_id, is_active);

comment on table public.pos_users is
  'Cajeros del POS. PIN bcrypt + lockout on-row. NO son admins del panel.';

-- ============================================================================
-- 2. POS_CATEGORIES — categorías de productos por tenant
-- ============================================================================
create table if not exists public.pos_categories (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  name          text not null,
  parent_id     uuid references public.pos_categories(id),
  display_order int not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  unique(tenant_id, name)
);

create index if not exists idx_pos_categories_tenant on public.pos_categories(tenant_id);

-- ============================================================================
-- 3. POS_PRODUCTS — catálogo de productos
-- ============================================================================
create table if not exists public.pos_products (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  sku          text not null,
  barcode      text,
  name         text not null,
  description  text,
  category_id  uuid references public.pos_categories(id),
  unit_type    text not null default 'piece'
               check (unit_type in ('piece','package','box','kg','liter','service')),
  unit_price   numeric(10,2) not null check (unit_price >= 0),
  cost_price   numeric(10,2) check (cost_price >= 0),
  tax_rate     numeric(5,2) not null default 0
               check (tax_rate >= 0 and tax_rate <= 100),
  stock_qty    numeric(10,3) not null default 0,
  stock_min    numeric(10,3) not null default 0,
  track_stock  boolean not null default true,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique(tenant_id, sku)
);

-- Barcode opcional pero único por tenant cuando está presente
create unique index if not exists idx_pos_products_tenant_barcode_unique
  on public.pos_products(tenant_id, barcode) where barcode is not null;
create index if not exists idx_pos_products_tenant_active
  on public.pos_products(tenant_id, is_active);
create index if not exists idx_pos_products_tenant_name_lower
  on public.pos_products(tenant_id, lower(name));
create index if not exists idx_pos_products_category
  on public.pos_products(category_id);
create index if not exists idx_pos_products_low_stock
  on public.pos_products(tenant_id) where track_stock = true and stock_qty < stock_min;

drop trigger if exists trg_pos_products_updated_at on public.pos_products;
create trigger trg_pos_products_updated_at
  before update on public.pos_products
  for each row execute function public.set_updated_at();

-- ============================================================================
-- 4. POS_CASH_SESSIONS — apertura/cierre de caja por cajero
-- ============================================================================
create table if not exists public.pos_cash_sessions (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  cashier_id      uuid not null references public.pos_users(id),
  opened_at       timestamptz not null default now(),
  closed_at       timestamptz,
  opening_amount  numeric(10,2) not null check (opening_amount >= 0),
  closing_amount  numeric(10,2),
  expected_amount numeric(10,2),
  difference      numeric(10,2),
  notes           text,
  status          text not null default 'open' check (status in ('open','closed'))
);

create index if not exists idx_pos_cash_sessions_tenant_status
  on public.pos_cash_sessions(tenant_id, status);

-- ============================================================================
-- 5. POS_CUSTOMERS — clientes frecuentes (lealtad + ticket digital WhatsApp)
-- ============================================================================
create table if not exists public.pos_customers (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  phone          text,
  name           text,
  loyalty_points int not null default 0,
  total_spent    numeric(12,2) not null default 0,
  last_visit_at  timestamptz,
  created_at     timestamptz not null default now(),
  unique(tenant_id, phone)
);

-- ============================================================================
-- 6. POS_SALES — encabezado de venta. client_id soporta offline-first.
-- ============================================================================
create table if not exists public.pos_sales (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  cash_session_id  uuid not null references public.pos_cash_sessions(id),
  cashier_id       uuid not null references public.pos_users(id),
  ticket_number    text not null,
  subtotal         numeric(10,2) not null,
  tax_total        numeric(10,2) not null default 0,
  discount_total   numeric(10,2) not null default 0,
  total            numeric(10,2) not null,
  payment_method   text not null check (payment_method in ('cash','card','transfer','mixed')),
  amount_paid      numeric(10,2) not null,
  change_given     numeric(10,2) not null default 0,
  customer_phone   text,
  customer_id      uuid references public.pos_customers(id),
  status           text not null default 'completed'
                   check (status in ('completed','cancelled','refunded')),
  notes            text,
  created_at       timestamptz not null default now(),
  -- offline-first: cliente genera UUID, evita duplicados al sincronizar
  client_id        text not null,
  synced_at        timestamptz,
  unique(tenant_id, client_id)
);

create index if not exists idx_pos_sales_tenant_created
  on public.pos_sales(tenant_id, created_at desc);
create index if not exists idx_pos_sales_session on public.pos_sales(cash_session_id);

-- ============================================================================
-- 7. POS_SALE_ITEMS — líneas de venta. Snapshot del producto al momento.
-- ============================================================================
create table if not exists public.pos_sale_items (
  id            uuid primary key default gen_random_uuid(),
  sale_id       uuid not null references public.pos_sales(id) on delete cascade,
  product_id    uuid not null references public.pos_products(id),
  quantity      numeric(10,3) not null check (quantity > 0),
  unit_price    numeric(10,2) not null,
  discount      numeric(10,2) not null default 0,
  tax_amount    numeric(10,2) not null default 0,
  subtotal      numeric(10,2) not null,
  -- snapshot al momento de la venta (auditoría)
  product_name  text not null,
  product_sku   text not null
);

create index if not exists idx_pos_sale_items_sale on public.pos_sale_items(sale_id);

-- ============================================================================
-- 8. POS_INVENTORY_MOVEMENTS — historial de cambios de stock (libro mayor)
-- ============================================================================
create table if not exists public.pos_inventory_movements (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  product_id     uuid not null references public.pos_products(id),
  movement_type  text not null
                 check (movement_type in ('purchase','sale','adjustment','return','transfer','damage')),
  quantity       numeric(10,3) not null,  -- positivo entrada, negativo salida
  unit_cost      numeric(10,2),
  reference_type text,
  reference_id   uuid,
  reason         text,
  created_by     uuid references public.pos_users(id),
  created_at     timestamptz not null default now()
);

create index if not exists idx_pos_inv_mov_product
  on public.pos_inventory_movements(product_id, created_at desc);

-- ============================================================================
-- 9. POS_SUPPLIERS — proveedores
-- ============================================================================
create table if not exists public.pos_suppliers (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  name         text not null,
  contact_name text,
  phone        text,
  email        text,
  rfc          text,
  notes        text,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);

-- ============================================================================
-- 10. POS_PURCHASES — compras a proveedor
-- ============================================================================
create table if not exists public.pos_purchases (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  supplier_id    uuid references public.pos_suppliers(id),
  invoice_number text,
  total          numeric(10,2) not null,
  status         text not null default 'received'
                 check (status in ('received','partial','pending')),
  notes          text,
  created_by     uuid references public.pos_users(id),
  created_at     timestamptz not null default now()
);

create table if not exists public.pos_purchase_items (
  id          uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.pos_purchases(id) on delete cascade,
  product_id  uuid not null references public.pos_products(id),
  quantity    numeric(10,3) not null check (quantity > 0),
  unit_cost   numeric(10,2) not null,
  subtotal    numeric(10,2) not null
);

-- ============================================================================
-- 11. POS_TENANT_CONFIG — configuración POS por tenant
-- ============================================================================
create table if not exists public.pos_tenant_config (
  tenant_id               uuid primary key references public.tenants(id) on delete cascade,
  mould                   text not null default 'papeleria',
  business_name           text not null,
  business_address        text,
  business_phone          text,
  ticket_header           text,
  ticket_footer           text,
  printer_model           text,
  printer_connection      text check (printer_connection in ('usb','network','bluetooth')),
  printer_address         text,
  default_tax_rate        numeric(5,2) not null default 0,
  currency                text not null default 'MXN',
  loyalty_enabled         boolean not null default false,
  loyalty_points_per_peso numeric(5,2) not null default 1.0,
  whatsapp_ticket_enabled boolean not null default false,
  updated_at              timestamptz not null default now()
);

drop trigger if exists trg_pos_tenant_config_updated_at on public.pos_tenant_config;
create trigger trg_pos_tenant_config_updated_at
  before update on public.pos_tenant_config
  for each row execute function public.set_updated_at();

-- ============================================================================
-- 12. TRIGGERS de inventario al vender (atomicidad de la venta)
-- ============================================================================

-- Decrementa stock cuando se inserta un sale_item, salvo servicios (track_stock=false).
create or replace function public.pos_decrement_stock_on_sale_item()
returns trigger
language plpgsql
as $$
begin
  update public.pos_products
     set stock_qty = stock_qty - new.quantity,
         updated_at = now()
   where id = new.product_id
     and track_stock = true;
  return new;
end;
$$;

drop trigger if exists trg_pos_decrement_stock_on_sale_item on public.pos_sale_items;
create trigger trg_pos_decrement_stock_on_sale_item
  after insert on public.pos_sale_items
  for each row execute function public.pos_decrement_stock_on_sale_item();

-- Registra movimiento en pos_inventory_movements por cada item vendido.
-- tenant_id se hereda del pos_sales padre (consulta dentro del trigger).
create or replace function public.pos_log_inventory_on_sale_item()
returns trigger
language plpgsql
as $$
declare
  v_tenant_id uuid;
begin
  select s.tenant_id into v_tenant_id
    from public.pos_sales s where s.id = new.sale_id;

  insert into public.pos_inventory_movements
    (tenant_id, product_id, movement_type, quantity, reference_type, reference_id, reason)
  values
    (v_tenant_id, new.product_id, 'sale', -new.quantity, 'sale', new.sale_id, 'Venta automática');

  return new;
end;
$$;

drop trigger if exists trg_pos_log_inv_on_sale_item on public.pos_sale_items;
create trigger trg_pos_log_inv_on_sale_item
  after insert on public.pos_sale_items
  for each row execute function public.pos_log_inventory_on_sale_item();

-- ============================================================================
-- 13. RLS — habilitar en todas las tablas pos_*
--
-- Política: super_admin puede todo; el resto se filtra por tenant_id del JWT.
-- Estas policies son defensa en profundidad — el backend con service_role
-- las bypasea y filtra explícitamente en repositorios (WHERE tenant_id = ?).
-- ============================================================================

alter table public.pos_users               enable row level security;
alter table public.pos_categories          enable row level security;
alter table public.pos_products            enable row level security;
alter table public.pos_cash_sessions       enable row level security;
alter table public.pos_customers           enable row level security;
alter table public.pos_sales               enable row level security;
alter table public.pos_sale_items          enable row level security;
alter table public.pos_inventory_movements enable row level security;
alter table public.pos_suppliers           enable row level security;
alter table public.pos_purchases           enable row level security;
alter table public.pos_purchase_items      enable row level security;
alter table public.pos_tenant_config       enable row level security;

-- Macro local: super_admin all + tenant_isolation por tenant_id en JWT.
-- Aplicado a todas las tablas pos_* que tienen columna tenant_id directa.
-- pos_sale_items y pos_purchase_items se manejan abajo (heredan vía padre).
do $$
declare
  t            text;
  policy_super text;
  policy_iso   text;
  tables       text[] := array[
    'pos_users', 'pos_categories', 'pos_products', 'pos_cash_sessions',
    'pos_customers', 'pos_sales', 'pos_inventory_movements',
    'pos_suppliers', 'pos_purchases', 'pos_tenant_config'
  ];
begin
  foreach t in array tables loop
    policy_super := t || '_super_all';
    policy_iso   := t || '_tenant_isolation';

    execute format('drop policy if exists %I on public.%I', policy_super, t);
    execute format($q$
      create policy %I on public.%I
        for all
        using (public.is_super_admin())
        with check (public.is_super_admin())
    $q$, policy_super, t);

    execute format('drop policy if exists %I on public.%I', policy_iso, t);
    execute format($q$
      create policy %I on public.%I
        for all
        using (tenant_id = public.jwt_tenant_id())
        with check (tenant_id = public.jwt_tenant_id())
    $q$, policy_iso, t);
  end loop;
end $$;

-- pos_sale_items y pos_purchase_items no tienen tenant_id directo: heredan vía
-- sale_id / purchase_id. Policies separadas que consultan el padre.
drop policy if exists pos_sale_items_super_all on public.pos_sale_items;
create policy pos_sale_items_super_all on public.pos_sale_items
  for all
  using (public.is_super_admin())
  with check (public.is_super_admin());

drop policy if exists pos_sale_items_via_sale on public.pos_sale_items;
create policy pos_sale_items_via_sale on public.pos_sale_items
  for all
  using (exists (
    select 1 from public.pos_sales s
     where s.id = pos_sale_items.sale_id
       and s.tenant_id = public.jwt_tenant_id()
  ))
  with check (exists (
    select 1 from public.pos_sales s
     where s.id = pos_sale_items.sale_id
       and s.tenant_id = public.jwt_tenant_id()
  ));

drop policy if exists pos_purchase_items_super_all on public.pos_purchase_items;
create policy pos_purchase_items_super_all on public.pos_purchase_items
  for all
  using (public.is_super_admin())
  with check (public.is_super_admin());

drop policy if exists pos_purchase_items_via_purchase on public.pos_purchase_items;
create policy pos_purchase_items_via_purchase on public.pos_purchase_items
  for all
  using (exists (
    select 1 from public.pos_purchases p
     where p.id = pos_purchase_items.purchase_id
       and p.tenant_id = public.jwt_tenant_id()
  ))
  with check (exists (
    select 1 from public.pos_purchases p
     where p.id = pos_purchase_items.purchase_id
       and p.tenant_id = public.jwt_tenant_id()
  ));

-- ============================================================================
-- 14. Comentarios documentales en columnas críticas
-- ============================================================================
comment on column public.pos_products.track_stock is
  'Si false, las ventas no descuentan stock (ej: servicios como impresión).';
comment on column public.pos_products.barcode is
  'EAN13/Code128. Único por tenant cuando NOT NULL (índice parcial).';
comment on column public.pos_sales.client_id is
  'UUID generado en el cliente para offline-first. UNIQUE(tenant_id, client_id) evita duplicados al sincronizar.';
comment on column public.pos_users.pin_hash is
  'PIN bcrypt cost=12. Lockout (failed_attempts, locked_until) on-row, NO en login_attempts.';
comment on column public.pos_tenant_config.mould is
  'Slug del Molde de industria activo (papeleria, ferreteria, etc). Definido en código (domain/moulds/).';
