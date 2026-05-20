# Schema POS — Migración 011

Documenta las 12 tablas `pos_*` creadas por
`backend/supabase/migrations/011_pos_module_bootstrap.sql`.

Todas las tablas son multi-tenant con `tenant_id` FK a `tenants(id) ON DELETE CASCADE`.
RLS habilitada en todas; ver [`security.md`](./security.md).

## Tablas

### `pos_users` — Cajeros del POS

Separada de `admin_users` porque la auth es PIN bcrypt, no email/password,
y los cajeros NO deben acceder al panel admin.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `tenant_id` | uuid FK | |
| `name` | text | único por tenant |
| `pin_hash` | text | bcrypt cost=12 |
| `role` | text | `'pos_cashier' \| 'pos_manager'` |
| `is_active` | boolean | default true |
| `failed_attempts` | int | lockout on-row (no en `login_attempts`) |
| `locked_until` | timestamptz | si > now → bloqueado |
| `last_login_at` | timestamptz | |
| `created_at` | timestamptz | |

### `pos_categories` — Categorías de productos

Soporta jerarquía vía `parent_id` (el Molde Papelería V1 solo usa 1 nivel).

### `pos_products` — Catálogo

Campos clave:
- `sku` (único por tenant), `barcode` (único parcial WHERE NOT NULL)
- `unit_type`: `piece | package | box | kg | liter | service`
- `unit_price`, `cost_price`, `tax_rate`
- `stock_qty`, `stock_min`, `track_stock` (false para servicios)
- Trigger `trg_pos_products_updated_at` mantiene `updated_at`.

Índices:
- `(tenant_id, barcode)` único parcial.
- `(tenant_id, is_active)` para listados.
- `(tenant_id, lower(name))` para búsqueda case-insensitive.
- `(category_id)` para filtros por categoría.
- `(tenant_id) WHERE track_stock AND stock_qty < stock_min` — productos por agotarse.

### `pos_cash_sessions` — Apertura/cierre de caja

Estado: `'open' | 'closed'`. Diferencia esperado vs contado en `difference`.

### `pos_customers` — Clientes frecuentes (lealtad + ticket digital)

`phone` único por tenant; clave de enlace con bot WhatsApp.

### `pos_sales` — Encabezado de venta

Campos críticos:
- `cash_session_id` — vinculado a la sesión activa del cajero.
- `ticket_number` — correlativo legible.
- `payment_method`: `cash | card | transfer | mixed`.
- `client_id` (TEXT) — UUID generado en el cliente para offline-first;
  `UNIQUE(tenant_id, client_id)` evita duplicados al sincronizar.
- `synced_at` — timestamp del backend cuando llegó del cliente offline.

### `pos_sale_items` — Líneas de venta

Snapshot del producto al momento (`product_name`, `product_sku`) para auditoría
inmutable aunque el producto cambie de precio después.

**Triggers automáticos**:
- `trg_pos_decrement_stock_on_sale_item` — descuenta `stock_qty` (respeta `track_stock=false`).
- `trg_pos_log_inv_on_sale_item` — registra entrada en `pos_inventory_movements`.

### `pos_inventory_movements` — Libro mayor de stock

Tipos: `purchase | sale | adjustment | return | transfer | damage`. Cantidad
positiva = entrada; negativa = salida. `reference_type` + `reference_id`
apuntan a la venta/compra/ajuste origen.

### `pos_suppliers`, `pos_purchases`, `pos_purchase_items`

Para compras a proveedor. Esquema espejo de ventas (en menor escala). Status
de compra: `received | partial | pending`.

### `pos_tenant_config` — Config POS por tenant

Una fila por tenant con POS habilitado. Campos:
- `mould` — slug del Molde de industria activo.
- `business_name`, `business_address`, `business_phone`.
- `ticket_header`, `ticket_footer`.
- `printer_model`, `printer_connection` (`usb|network|bluetooth`), `printer_address`.
- `default_tax_rate`, `currency` (default `'MXN'`).
- `loyalty_enabled`, `loyalty_points_per_peso`.
- `whatsapp_ticket_enabled` (requiere bot conectado al tenant).
- Trigger `trg_pos_tenant_config_updated_at`.

## Tabla extendida

- `tenants.enabled_modules TEXT[]` (default `ARRAY['bot']`). Controla qué módulos
  están activos por tenant. Cuando incluye `'pos'`, el moduleGuard middleware
  permite acceso a `/api/pos/*`.
