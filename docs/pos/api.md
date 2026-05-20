# API POS — Endpoints Sprint 5.1a

Base URL: `/api/pos` y `/api/auth/pos-*`.

## Autenticación

Cookie HTTPOnly `seguritech_pos_session` (configurable vía `ADMIN_POS_COOKIE_NAME`)
firmada por el JwtService propio con `scope: 'pos'`. La cookie es **separada** de
la cookie admin (`seguritech_session`) para que cajero y admin puedan coexistir
en el mismo navegador sin pisarse.

El middleware `requirePosSession`:
- Lee la cookie.
- Verifica firma + exp con `jwt.verify(token, 'pos')` (overload con scope esperado).
- Verifica que `jti` no esté en denylist (compartida con admin).
- Adjunta `req.posUser: PosJwtPayload` al request.

El middleware `requireModule('pos')`:
- Lee `tenantId` de `req.posUser` o `req.admin`.
- Llama `tenantRepository.isModuleEnabled(tenantId, 'pos')`.
- 403 si el módulo no está habilitado para ese tenant.

## Endpoints de auth

### `POST /api/auth/pos-login`

Login PIN del cajero. Rate-limited 5/15min (separado del admin).

**Body:**
```json
{
  "tenantId": "uuid",
  "name": "Demo Cajera",
  "pin": "1234"
}
```

**Respuestas:**
- `200` → setea cookie + `{ ok: true, user: { id, displayName, role, tenantId } }`
- `400` → payload inválido
- `401` → `code: 'not_found' | 'invalid_pin' | 'inactive'`
- `403` → `code: 'module_disabled'`
- `429` → `code: 'locked'` (5° intento fallido o ya estaba bloqueado)

### `POST /api/auth/pos-logout`

Requiere cookie POS. Revoca el `jti` en `admin_sessions_revoked` y limpia la cookie.

**Respuesta:** `200 { ok: true }`

## Endpoints del catálogo

Todos bajo `/api/pos/*`. Todos requieren cookie POS válida + módulo `pos`
habilitado en el tenant. **Excepción**: `/api/pos/health` es público.

### `GET /api/pos/health`

Público. Readiness probe.

```json
{ "ok": true, "module": "pos", "version": "0.1.0" }
```

### `GET /api/pos/products`

Lista paginada de productos del tenant. Query params:
- `limit` (1-500, default 100)
- `offset` (default 0)
- `categoryId` (opcional, filtra por categoría)

**Respuesta:** `{ products: PosProduct[], limit, offset }`

### `GET /api/pos/products/lookup`

Búsqueda por nombre/sku o por código de barras exacto.

Query (uno de los dos):
- `q` (1-100 chars) — ILIKE sobre name/sku, eq sobre barcode
- `barcode` (1-100 chars) — eq exacto

Opcional: `limit` (1-50, default 20).

**Respuesta:** `{ products: PosProduct[] }`

### `GET /api/pos/products/:id`

Detalle de producto.

**Respuesta:** `{ product: PosProduct }` o `404`.

### `GET /api/pos/categories`

Lista de categorías del tenant ordenadas por `display_order, name`.

**Respuesta:** `{ categories: PosCategory[] }`

### `GET /api/pos/config`

Config POS del tenant (mould, business_name, printer, loyalty, etc.).

**Respuesta:** `{ config: PosTenantConfig }` o `404` si el tenant no tiene una fila en `pos_tenant_config`.

## Modelo de entidad — PosProduct

```typescript
{
  id: string;
  tenantId: string;
  sku: string;
  barcode: string | null;
  name: string;
  description: string | null;
  categoryId: string | null;
  unitType: 'piece' | 'package' | 'box' | 'kg' | 'liter' | 'service';
  unitPrice: number;
  costPrice: number | null;
  taxRate: number;
  stockQty: number;
  stockMin: number;
  trackStock: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
```

## Pendiente (próximos sprints)

- `POST/PUT/PATCH /api/pos/products` — CRUD (Sprint 5.2).
- `POST /api/pos/products/import-csv` (Sprint 5.2).
- `POST /api/pos/cash-sessions/open` y `/close` (Sprint 5.4).
- `POST /api/pos/sales` con items + offline-first sync (Sprint 5.3).
- `GET /api/pos/reports/day` y `/historical` (Sprint 5.4).
- `GET /api/pos/products/lookup` consumido desde el bot Webhook (Sprint 5.5).
