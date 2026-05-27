-- ============================================================================
-- Seed manual: tenant piloto "Papelería Piloto Chilpancingo" — Sprint 5.1a
--
-- INSTRUCCIONES:
--   1. Generá el hash bcrypt del PIN del cajero con:
--        npx ts-node backend/scripts/generate-pos-pin-hash.ts '1234'
--      (cost=12). Te aconsejo usar un PIN distinto a '1234' aunque sea piloto.
--   2. Pegá el hash en la línea pin_hash del bloque pos_users (al final).
--   3. Ejecutá este SQL una sola vez en Supabase SQL Editor.
--   4. Anota el tenant_id que imprime el RAISE NOTICE al final — lo vas a
--      necesitar para curl-tests y para el login del cajero.
--
-- Idempotente: si el tenant ya existe (por nombre_negocio + giro), reusa su
-- id y aplica los inserts con ON CONFLICT DO NOTHING. Rerun seguro.
--
-- Pre-requisito: migración 011_pos_module_bootstrap.sql aplicada.
-- ============================================================================

do $$
declare
  v_tenant_id uuid;
  v_existed   boolean;
begin
  -- 0. Localizar o crear el tenant piloto
  select id into v_tenant_id
    from public.tenants
   where nombre_negocio = 'Papelería Piloto Chilpancingo'
     and giro = 'papeleria'
   limit 1;

  v_existed := v_tenant_id is not null;

  if not v_existed then
    insert into public.tenants
      (nombre_negocio, giro, status, enabled_modules,
       direccion, horario_semana, horario_sabado, abre_domingo)
    values
      ('Papelería Piloto Chilpancingo',
       'papeleria',
       'sandbox',                          -- piloto, NO live
       array['pos']::text[],               -- POS llega primero; bot después
       'Av. Reforma 123, Centro, Chilpancingo, Gro.',
       'Lun-Vie 9:00-19:00',
       'Sáb 10:00-15:00',
       false)
    returning id into v_tenant_id;

    raise notice 'Tenant piloto CREADO con id: %', v_tenant_id;
  else
    -- Asegurar que tenga 'pos' en enabled_modules incluso si ya existía
    update public.tenants
       set enabled_modules = (
         case when 'pos' = any(enabled_modules) then enabled_modules
              else array_append(enabled_modules, 'pos')
         end
       )
     where id = v_tenant_id;
    raise notice 'Tenant piloto YA EXISTÍA, reusando id: %', v_tenant_id;
  end if;

  -- 1. Configuración POS del tenant
  insert into public.pos_tenant_config
    (tenant_id, mould, business_name, business_address, business_phone,
     ticket_header, ticket_footer,
     default_tax_rate, currency,
     loyalty_enabled, loyalty_points_per_peso, whatsapp_ticket_enabled)
  values
    (v_tenant_id, 'papeleria',
     'Papelería Piloto Chilpancingo',
     'Av. Reforma 123, Centro, Chilpancingo, Gro.',
     '7471234567',
     'PAPELERÍA PILOTO',
     '¡Gracias por su compra!',
     0, 'MXN',
     true, 1.0, false)
  on conflict (tenant_id) do nothing;

  -- 2. Categorías Molde Papelería (8)
  insert into public.pos_categories (tenant_id, name, display_order) values
    (v_tenant_id, 'Escritura',             1),
    (v_tenant_id, 'Cuadernos y libretas',  2),
    (v_tenant_id, 'Útiles escolares',      3),
    (v_tenant_id, 'Papel y hojas',         4),
    (v_tenant_id, 'Oficina',               5),
    (v_tenant_id, 'Arte y manualidades',   6),
    (v_tenant_id, 'Tecnología',            7),
    (v_tenant_id, 'Servicios',             8)
  on conflict (tenant_id, name) do nothing;

  -- 3. Productos de muestra (31). category_id se resuelve via JOIN.
  -- Coincide 1:1 con domain/moulds/papeleria.config.ts (sampleProducts).
  insert into public.pos_products
    (tenant_id, sku, barcode, name, category_id, unit_type,
     unit_price, cost_price, stock_qty, stock_min, track_stock)
  select v_tenant_id,
         v.sku,
         v.barcode,
         v.name,
         (select id from public.pos_categories
           where tenant_id = v_tenant_id and name = v.cat_name),
         v.unit_type,
         v.unit_price, v.cost_price, v.stock_qty, v.stock_min, v.track_stock
  from (values
    -- Escritura
    ('LAP-001', '7501031234567'::text, 'Lápiz Mirado #2',                'Escritura',           'piece'::text,    5.00, 2.50, 100.000, 20.000, true),
    ('LAP-002', '7501031234568',       'Lápiz adhesivo Pritt grande',    'Escritura',           'piece',         35.00,22.00,  15.000,  5.000, true),
    ('PLU-001', '7501031234569',       'Pluma Bic punto fino azul',      'Escritura',           'piece',          8.00, 4.00,  80.000, 20.000, true),
    ('PLU-002', '7501031234570',       'Pluma Bic punto fino negro',     'Escritura',           'piece',          8.00, 4.00,  80.000, 20.000, true),
    ('PLU-003', '7501031234571',       'Pluma Bic punto fino rojo',      'Escritura',           'piece',          8.00, 4.00,  40.000, 10.000, true),
    ('MAR-001', '7501031234572',       'Marcador Sharpie negro',         'Escritura',           'piece',         35.00,20.00,  20.000,  5.000, true),
    ('BOR-001', '7501031234573',       'Borrador Pelikan blanco',        'Escritura',           'piece',          6.00, 3.00,  50.000, 15.000, true),
    -- Cuadernos y libretas
    ('CUA-001', '7501031234574',       'Cuaderno Norma profesional 100h','Cuadernos y libretas','piece',         35.00,22.00,  30.000,  8.000, true),
    ('CUA-002', '7501031234575',       'Cuaderno Scribe italiano 100h',  'Cuadernos y libretas','piece',         42.00,28.00,  25.000,  8.000, true),
    ('CUA-003', '7501031234576',       'Libreta forma francesa raya',    'Cuadernos y libretas','piece',         18.00,11.00,  40.000, 10.000, true),
    ('CUA-004', '7501031234577',       'Cuaderno cuadriculado 100h',     'Cuadernos y libretas','piece',         32.00,20.00,  35.000, 10.000, true),
    -- Útiles escolares
    ('REG-001', '7501031234578',       'Regla 30cm plástica',            'Útiles escolares',    'piece',         12.00, 6.00,  40.000, 10.000, true),
    ('TIJ-001', '7501031234579',       'Tijera escolar punta roma',      'Útiles escolares',    'piece',         25.00,15.00,  20.000,  5.000, true),
    ('JUE-001', '7501031234580',       'Juego de geometría escolar',     'Útiles escolares',    'piece',         45.00,28.00,  15.000,  5.000, true),
    ('SAC-001', '7501031234581',       'Sacapuntas metálico',            'Útiles escolares',    'piece',          8.00, 4.00,  60.000, 15.000, true),
    ('COL-001', '7501031234582',       'Caja colores Prismacolor 12pz',  'Útiles escolares',    'package',       75.00,48.00,  18.000,  5.000, true),
    -- Papel y hojas
    ('HOJ-001', null,                  'Hoja blanca tamaño carta (unidad)','Papel y hojas',     'piece',          1.50, 0.40, 500.000,100.000, true),
    ('HOJ-002', '7501031234583',       'Paquete hojas blancas 100 piezas','Papel y hojas',      'package',       75.00,45.00,  20.000,  5.000, true),
    ('PAP-001', '7501031234584',       'Pliego papel china amarillo',    'Papel y hojas',       'piece',          3.00, 1.50, 100.000, 20.000, true),
    ('CAR-001', '7501031234585',       'Cartulina blanca tamaño 1/2',    'Papel y hojas',       'piece',          6.00, 3.00,  80.000, 20.000, true),
    -- Oficina
    ('CLI-001', '7501031234586',       'Caja de clips estándar',         'Oficina',             'package',       18.00,10.00,  20.000,  5.000, true),
    ('GRA-001', '7501031234587',       'Grapadora media plus',           'Oficina',             'piece',         85.00,55.00,   8.000,  3.000, true),
    ('GRA-002', '7501031234588',       'Caja grapas estándar 5000',      'Oficina',             'package',       22.00,13.00,  15.000,  5.000, true),
    ('CIN-001', '7501031234589',       'Cinta adhesiva transparente',    'Oficina',             'piece',         12.00, 6.00,  40.000, 10.000, true),
    -- Arte y manualidades
    ('PIN-001', '7501031234590',       'Pinceles set escolar 6pz',       'Arte y manualidades', 'package',       45.00,28.00,  12.000,  4.000, true),
    ('PIN-002', '7501031234591',       'Pintura acrílica 30ml roja',     'Arte y manualidades', 'piece',         22.00,13.00,  20.000,  5.000, true),
    ('FOM-001', '7501031234592',       'Foamy carta colores varios',     'Arte y manualidades', 'piece',          8.00, 4.00,  60.000, 15.000, true),
    -- Tecnología
    ('USB-001', '7501031234593',       'USB 16GB Kingston',              'Tecnología',          'piece',        120.00,78.00,  10.000,  3.000, true),
    ('AUD-001', '7501031234594',       'Audífonos básicos con cable',    'Tecnología',          'piece',         85.00,55.00,  10.000,  3.000, true),
    -- Servicios (track_stock=false)
    ('SRV-001', null,                  'Impresión B/N por hoja',         'Servicios',           'service',        2.00, 0.00,   0.000,  0.000, false),
    ('SRV-002', null,                  'Fotocopia B/N',                  'Servicios',           'service',        1.50, 0.00,   0.000,  0.000, false),
    ('SRV-003', null,                  'Engargolado tamaño carta',       'Servicios',           'service',       25.00, 5.00,   0.000,  0.000, false)
  ) as v(sku, barcode, name, cat_name, unit_type,
         unit_price, cost_price, stock_qty, stock_min, track_stock)
  on conflict (tenant_id, sku) do nothing;

  -- 4. Cajero demo. REEMPLAZA EL pin_hash con uno real generado por
  --    backend/scripts/generate-pos-pin-hash.ts ANTES de ejecutar este SQL.
  insert into public.pos_users
    (tenant_id, name, pin_hash, role, is_active)
  values
    (v_tenant_id,
     'Demo Cajera',
     '$2a$12$REEMPLAZAR_CON_HASH_REAL_GENERADO_POR_SCRIPT',
     'pos_cashier',
     true)
  on conflict (tenant_id, name) do nothing;

  -- Reporte final
  raise notice '======================================';
  raise notice 'Seed POS Papelería piloto OK';
  raise notice 'tenant_id  : %', v_tenant_id;
  raise notice 'cajera     : Demo Cajera (PIN bcrypt — revisa pin_hash)';
  raise notice 'categorías : 8';
  raise notice 'productos  : 31';
  raise notice '======================================';
  raise notice 'Para curl-tests usa este tenant_id en x-tenant-id header.';
end $$;
