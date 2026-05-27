# CHANGELOG

## [Unreleased] — feature/sprint-5-5-hardening

### Limpieza de calidad (2026-05-26)

- **[fix]** Verificado: `send_list` envía `interactive type=list` correcto en
  `MetaWhatsAppAdapter.sendList()` (con validación 1..10 sections / 1..10 rows)
  y renderiza con modal (`openListModal`) en `backend/public/simulator/index.html`.
  `BotController` enruta `kind='list'` a `notificationPort.sendList()` (no a
  `sendMessage`). **Deuda #2 marcada como RESUELTA** — no hubo código a tocar.
- **[chore]** Lint: warnings `any` en catch blocks de `AdminRouter.ts` y otros
  reemplazados por `unknown` + narrowing. Row mappers de Supabase con tipos
  inline. Ver detalle en commit.
- **[docs]** `docs/` reorganizado: históricos movidos a `docs/archive/`,
  `docs/INDEX.md` reescrito para apuntar a `SEGURITECH_PROYECTO_MAESTRO.md`
  como fuente única.
- **[chore]** `backend/supabase/seed.sql` marcado como **ACTIVO** (contiene
  los 5 flow_templates JSONB únicos, no duplicados con `migrations/seed_*.sql`).

### Sprint 5.5 — Hardening + Paused Tenant Gating

Cierra los siguientes items del Documento Maestro v2.0 sección 3.2:

- [x] #1 CI roto por referencias a `frontend/`
- [x] #2 `backend/bin/www` fósil del generador Express
- [x] #3 `.env.example` raíz con vars muertas (`NEXT_PUBLIC_*`, `NEXTAUTH_SECRET`)
- [x] #4 `ReadlineAdapter` sin gate de development
- [x] #5 `InMemoryUserRepository` fuera de su lugar (era infra, ahora `tests/utils/`)
- [x] #6 `tenants.status='paused'` NO bloqueaba webhook — RESUELTO
- [x] #7 `createAtomic` insertaba `status='unconfigured'` (valor inválido post-006) — RESUELTO con `status='draft'`

#### El item crítico (#6)

- Nuevo método `findStatusById()` en `TenantRepository` para gating sin cargar
  `TenantConfig` completo.
- Cache en memoria con TTL de 30s en `Bootstrap.ts` (evita query por mensaje).
- Gate aplicado en **ambas rutas** del webhook: `/webhook/:tenantId` y `/webhook`
  (esta última no estaba en el spec original pero su exclusión hubiera sido
  puerta trasera).
- Mapping explícito: `live + sandbox = active`;
  `paused + archived + draft + not_found = inactive` (response 200 +
  `{skipped: ...}`, sin reintentos de Meta).
- Definido el tipo `TenantStatus` que no existía + re-export desde el barrel
  `domain/ports/index.ts`.

#### Nuevo

- `backend/src/tests/integration/webhookStatusGating.test.ts` con 2 tests
  cubriendo los casos `inactive` y `not_found`.
- Path alias `@/tests/*` en `backend/tsconfig.json`.
- `TenantStatusChecker` exportado desde `ExpressServer.ts` y aceptado como
  4to argumento opcional del constructor.

#### Modificado

- `.github/workflows/ci.yml`: eliminados 3 steps `cd frontend && ...`;
  ahora usa `--workspace backend` para lint, type-check, test y build.
- `Bootstrap.ts`: `ReadlineAdapter.start()` ahora vive dentro de
  `if (config.isDevelopment)`; cableado del `tenantStatusChecker` con cache
  in-memory antes del `new ExpressServer(...)`.
- `TenantRepository.ts`: `+ TenantStatus` (FSM 5 estados) + `+ findStatusById()`.
- `SupabaseTenantRepository.ts`: implementación de `findStatusById()` con
  `maybeSingle()` + filtro `deleted_at IS NULL`.
- `PerformanceSecurityTest.ts`: stub de `TenantRepository` extendido con
  `findStatusById: async () => null`.
- 3 tests existentes con import actualizado a `@/tests/utils/InMemoryUserRepository`.

#### Eliminado

- `backend/bin/www` (Express generator fossil, requería `../app` inexistente).
- `.env.example` raíz (vars muertas de la época pre-Sprint-E).

#### Movido

- `backend/src/infrastructure/repositories/InMemoryUserRepository.ts`
  → `backend/src/tests/utils/InMemoryUserRepository.ts` (solo se usaba en
  tests, ubicación previa confundía sobre si era runtime adapter).

#### Tests

- Suite total: **38 passed / 3 skipped / 0 failed** (baseline 36 + 2 nuevos).
- Lint: 0 errors / 103 warnings preexistentes.
- Build: OK.

#### Deuda no abordada (fuera de scope)

- `TenantRepository.setStatus()` legacy sigue tipado con tupla
  `'active' | 'paused'` (de Sprint 3). Se limpia en Sprint 6 junto con la
  eliminación de `HandleMessageUseCase`.
- Deuda #3 (N+1 en `GET /api/admin/tenants`) diferida al backlog.
- Deuda #2 (send_list), #10 (docs/) y #11 (seed.sql) **cerradas** en la
  limpieza de 2026-05-26 (ver sección al inicio del Unreleased).

#### Próximo

Sprint 5.6 — Primer cliente piloto en producción (VPS Hetzner, Cloudflare
Access, onboarding de la papelería de Chilpancingo). Parte B del sprint
(Meta verification + Supabase Cloud + VPS + secretos) es trabajo manual
en paralelo.

---

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
