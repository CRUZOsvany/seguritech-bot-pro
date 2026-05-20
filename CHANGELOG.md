# CHANGELOG

## [Unreleased] — feature/sprint-5-1a-pos-backend

### Sprint 5.1a — POS Module Bootstrap (backend)

Agregado el módulo Punto de Venta como segundo producto del monorepo. Coexiste
con el módulo Bot existente sin tocar tablas/código previos salvo:

- `tenants.enabled_modules TEXT[]` — columna nueva controla qué módulos están
  activos por tenant. Default `ARRAY['bot']` (no rompe tenants existentes).
- `JwtService` extendido con `scope: 'pos'` (retrocompat: tokens admin pre-
  Sprint 5.1a sin scope siguen siendo válidos).
- `AuthMiddleware` rechaza tokens scope='pos' en el camino admin.

#### Nuevo

**Dominio + ports** (`backend/src/domain/pos/*`, `backend/src/domain/ports/pos/*`):
- Entidades: `PosProduct`, `PosCategory`, `PosTenantConfig`, `PosUser`, `PosMould`.
- Ports: `PosProductRepository`, `PosCategoryRepository`,
  `PosTenantConfigRepository`, `PosUserRepository`, `InvoicingPort` (extension
  point CFDI).
- Servicios de dominio: `NoOpInvoicing` (impl no-op del `InvoicingPort`).
- Molde Papelería: 8 categorías + 31 productos de muestra.

**Migración SQL** (`backend/supabase/migrations/011_pos_module_bootstrap.sql`):
- 12 tablas `pos_*`: users, categories, products, cash_sessions, customers,
  sales, sale_items, inventory_movements, suppliers, purchases, purchase_items,
  tenant_config.
- 2 triggers atómicos al insertar `pos_sale_items`: decremento de stock
  (respeta `track_stock=false`) y log de movimiento de inventario.
- 1 trigger `updated_at` en `pos_products` y `pos_tenant_config`.
- RLS habilitada en las 12 tablas + policies `super_all` + `tenant_isolation`
  vía `DO` block. `pos_sale_items` y `pos_purchase_items` heredan vía padre.

**Seed** (`backend/supabase/migrations/seed_pos_papeleria_pilot.sql`):
- Tenant nuevo "Papelería Piloto Chilpancingo" con `status='sandbox'`,
  `enabled_modules=['pos']` (sin bot todavía).
- 8 categorías + 31 productos + 1 fila `pos_tenant_config` + 1 cajero demo
  con placeholder de `pin_hash`.
- Idempotente: rerun seguro vía `DO` block + `ON CONFLICT DO NOTHING`.

**Utilidad** (`backend/scripts/generate-pos-pin-hash.ts`):
- Genera hash bcrypt cost=12 de un PIN 4-8 dígitos. Análoga al
  `generate-admin-hash.ts`.

**Repos Supabase** (`backend/src/infrastructure/repositories/pos/*`):
- `SupabasePosProductRepository` con `search()` que escapa metacaracteres
  `%/_` para evitar inyección en ILIKE.
- `SupabasePosCategoryRepository`, `SupabasePosTenantConfigRepository`,
  `SupabasePosUserRepository` (con lockout on-row).

**Auth POS**:
- `PosAuthError` con codes (`not_found | locked | invalid_pin | inactive
  | module_disabled`).
- `PosAuthService` con flujo: module check → user lookup (timing-safe) →
  lockout check → active check → bcrypt → JWT sign. Audita TODAS las ramas
  en `admin_audit_log` con `adminId=null` + `metadata.posUserId`.
- `PosAuthMiddleware` (`requirePosSession`) cookie-only, scope=`'pos'`.
- `ModuleGuard` (`createRequireModule`) strict, sin bypass super_admin.
- `POST /api/auth/pos-login` y `/pos-logout` en `AuthRouter` con rate
  limiter dedicado.

**Rutas POS** (`backend/src/infrastructure/server/PosRouter.ts`):
- `GET /api/pos/health` (público)
- `GET /api/pos/products` (paginado)
- `GET /api/pos/products/lookup?q=...&barcode=...`
- `GET /api/pos/products/:id`
- `GET /api/pos/categories`
- `GET /api/pos/config`

**Bootstrap**: cableado de POS fuera del `ApplicationContainer` (preserva
regla de los 7 args). Mount order: auth → admin → pos → static.

**Tests**:
- 5 nuevos tests en `JwtService.test.ts` (scope POS, retrocompat legacy).
- 7 tests unit en `PosAuthService.test.ts` (todos los caminos del flujo).
- 7 tests integration en `posIntegration.test.ts` (Express real + supertest
  + mocks de repos).
- Suite total: 36 passed, 3 skipped, 0 failed (vs 17 passed baseline).

**Documentación** (`docs/pos/`):
- `README.md`, `schema.md`, `api.md`, `security.md`.

#### Modificado

- `TenantRepository` port + `SupabaseTenantRepository`: `+ isModuleEnabled()`.
- `config/env.ts`: `+ ADMIN_POS_COOKIE_NAME` (default `seguritech_pos_session`).
- `AuthRouter`: factory acepta `posAuthService`, `requirePosSession`,
  `posCookieName`.
- `ExpressServer`: `+ setupPosRoutes()`.

#### Notas operativas

Para aplicar 5.1a a Supabase Cloud:

1. Correr `011_pos_module_bootstrap.sql` (SQL Editor o `supabase db push`).
2. Generar PIN del cajero con
   `npx ts-node backend/scripts/generate-pos-pin-hash.ts '1234'`.
3. Editar `seed_pos_papeleria_pilot.sql` reemplazando el placeholder
   `pin_hash` con el hash generado.
4. Correr el seed. Anotar el `tenant_id` del `RAISE NOTICE`.

#### Fuera de alcance

- PWA Next.js 15 (Sprint 5.1b).
- CRUD productos/categorías (Sprint 5.2).
- Venta + cobro + ticket ESC/POS + print-agent (Sprint 5.3).
- Caja + reportes + offline-first Dexie (Sprint 5.4).
- Integración bot↔POS (Sprint 5.5).
- Despliegue piloto (Sprint 5.6).

---

## Pre-5.1a

Ver historia de commits en `git log`. Sprints 0–4 + C + D + E + F (Operación
Búnker v2) ya están en `main`.
