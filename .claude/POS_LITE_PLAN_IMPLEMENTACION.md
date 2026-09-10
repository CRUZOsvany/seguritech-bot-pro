# POS Lite — Plan de implementación para Claude Code

> **[DOCUMENTO DE DISEÑO — para ejecutar, no para reinterpretar]**
> Complementa `.claude/POS_LITE_PLAN_DISENO.md` (producto/UX) y vive junto a `.claude/SEGURITECH_ROADMAP_OPERATIVO.md` (Fase 3 — POS) y `.claude/SEGURITECH_ESTADO_ACTUAL.md`.
>
> **Verificación previa a guardar (2026-09-10):** cada tabla, archivo, ruta y patrón citado abajo fue confirmado contra el código real del repo `seguritech-bot-proprueba`, no contra suposiciones. Donde se dice "no existe", se verificó con `find`/`grep`, no se infirió. Si al momento de ejecutar un ticket algo de esto ya cambió, **el código manda sobre este documento** — actualiza este archivo, no lo ignores en silencio.
>
> **Regla para quien ejecute esto:** no inventes columnas, tablas, endpoints ni archivos que no estén listados en la sección 1. Si necesitas algo que no está aquí, es una pregunta para el humano, no una suposición para rellenar.

## Estado de ejecución

| Ticket | Estado | Rama |
|---|---|---|
| T-01 Migración | Hecho — **es la 022, no la 021** (ver §11) · sin aplicar en Cloud | `feat/pos-lite-backend` |
| T-02 Entidades | Hecho | `feat/pos-lite-backend` |
| T-03 Puertos + repos Supabase | Hecho | `feat/pos-lite-backend` |
| T-04 Casos de uso | Hecho | `feat/pos-lite-backend` |
| T-05 Endpoints | Hecho, probado con supertest | `feat/pos-lite-backend` |
| T-06 Frontend cajero | Pendiente — tiene decisiones abiertas, ver §11.3 | — |

§11 registra todo lo que cambió respecto al texto original al ejecutar T-01…T-05. Las secciones de abajo ya están corregidas.

---

## 0. Arquitectura — lo que NO cambia

- Backend: Express + TypeScript, arquitectura hexagonal (`domain/` no importa de `infrastructure/`).
- Base de datos: Supabase Postgres, multi-tenant con RLS. Nada de SQLite.
- Routers usan **patrón factory con inyección de dependencias por parámetros** (ver `createPosRouter` en `src/infrastructure/server/PosRouter.ts`) — no instanciar repos dentro del router.
- Aislamiento de tenant: `tenantId` **siempre** se lee de `req.posUser.tenantId` (viene de la cookie de sesión POS ya validada por `requirePosSession`). Nunca se acepta por body/query/header. Mismo criterio para `cashierId` → `req.posUser.sub`.
- Validación de entrada con Zod, mismo patrón que el resto del admin API.
- Entidades de dominio: interfaces TS planas (no clases), con un tipo `New*` separado para el shape de creación — ver `src/domain/entities/pos/Product.ts` como referencia exacta a imitar.

---

## 1. Estado real verificado — punto de partida exacto

### 1.1 Ya existe en la base de datos (migración `011_pos_module_bootstrap.sql`) — no crear de nuevo

| Tabla | Campos relevantes | Nota |
|---|---|---|
| `pos_sales` | `id, tenant_id, cash_session_id (not null, FK), cashier_id (FK), ticket_number (not null), subtotal, tax_total, discount_total, total, payment_method (cash/card/transfer/mixed), amount_paid, change_given, customer_phone, customer_id, status, notes, created_at, client_id (not null), synced_at, unique(tenant_id, client_id)` | Offline-first ya resuelto aquí |
| `pos_sale_items` | `id, sale_id (FK, on delete cascade), product_id (FK), quantity, unit_price, discount, tax_amount, subtotal, product_name, product_sku` | `product_name`/`product_sku` son snapshot al momento de la venta — no se leen de `pos_products` después |
| `pos_cash_sessions` | `id, tenant_id, cashier_id (FK), opened_at, closed_at, opening_amount (not null), closing_amount, expected_amount, difference, notes, status (open/closed)` | Sin `created_at`/`updated_at`. `client_id`/`synced_at` llegan con la 022 (§3) |
| `pos_inventory_movements` | `id, tenant_id, product_id, movement_type (purchase/sale/adjustment/return/transfer/damage), quantity, unit_cost, reference_type, reference_id, reason, created_by, created_at` | Se llena solo, ver trigger abajo |

**Triggers que ya funcionan solos, no tocar:**
- `pos_decrement_stock_on_sale_item` — descuenta `pos_products.stock_qty` al insertar en `pos_sale_items` (solo si `track_stock = true`).
- `pos_log_inventory_on_sale_item` — escribe en `pos_inventory_movements` automáticamente.

**Consecuencia práctica:** el código de aplicación **nunca** debe restar `stock_qty` a mano ni escribir en `pos_inventory_movements` directamente — insertar la fila en `pos_sale_items` ya dispara todo eso. Si el código nuevo intenta hacerlo manualmente, es un bug (doble descuento).

Ningún trigger ni constraint impide `stock_qty < 0`: dos cajeros vendiendo la última pieza al mismo tiempo pueden dejarlo negativo. Aceptado para v1.

### 1.2 Lo que faltaba al empezar (2026-09-10) — ya construido en T-01…T-05

| Capa | Antes | Ahora |
|---|---|---|
| `domain/entities/pos/` | Sin `Sale.ts` ni `CashSession.ts` | Ambos creados |
| `domain/ports/pos/` | Sin puerto de ventas ni de caja | `PosSaleRepository.ts`, `PosCashSessionRepository.ts` |
| `application/pos/` | Solo `PosAuthService.ts, PosAuthError.ts` | + 4 casos de uso y `PosOperationError.ts` |
| `infrastructure/repositories/pos/` | Sin repos de ventas ni caja | `SupabasePosSaleRepository.ts`, `SupabasePosCashSessionRepository.ts` |
| `PosRouter.ts` | Solo GET de catálogo | + 5 rutas de caja y ventas (§7) |
| Frontend | Solo panel admin (`tenants.$id.pos.tsx`) y `shared/api/pos.ts`. Sin app de cajero. `dexie` no instalado | Sin cambios — es T-06 |
| Migraciones | **La última era `021_carousel_fallback_image.sql`** (el texto original decía 020) | `022_pos_cash_sessions_offline.sql` |

No hay filas en `pos_cash_sessions` ni `pos_sales` en los seeds (`seed_pos_papeleria_pilot.sql` no las toca); la 022 igual trae backfill idempotente por si producción tuviera alguna.

---

## 2. Decisiones de producto ya tomadas (no reabrir sin avisar al humano)

Ver `POS_LITE_PLAN_DISENO.md` para el detalle completo. Resumen operativo:

- Dispositivo: laptop en mostrador. Internet no confiable — todo offline-first.
- Alcance v1: vender + inventario (solo lectura) + caja con resumen. **Fuera de alcance:** clientes/fiado, reportes avanzados, impresión de ticket, proveedores/compras, router de IA (ADR-015 sigue pausado).
- Abrir/cerrar caja debe funcionar sin internet, igual que las ventas.
- Varios cajeros simultáneos: ya soportado por el esquema (`cashier_id` en `pos_cash_sessions`), no requiere cambio de diseño.
- Login único (nombre + PIN), sin selector de rol — ya resuelto por `PosAuthService`.
- Regla de negocio dura, ya reforzada por el esquema: `pos_sales.cash_session_id` es `not null` — **no se puede insertar una venta sin una sesión de caja abierta primero.**

---

## 3. Ticket T-01 — Migración 022: offline-first en `pos_cash_sessions` ✅

**Archivo:** `backend/supabase/migrations/022_pos_cash_sessions_offline.sql`

Agrega `client_id text not null` + `synced_at timestamptz` y `unique(tenant_id, client_id)`. Es idempotente de verdad: backfill `client_id = id::text` para filas previas y el constraint va en un bloque `do $$` que revisa `pg_constraint` antes de crearlo (un `add constraint` suelto falla la segunda vez).

**Pendiente humano:** aplicarla en Supabase Cloud (SQL Editor, el CLI no está enlazado) y verificar el mismo día del merge — regla 8.

```sql
-- Verificación post-aplicación
select column_name, is_nullable from information_schema.columns
 where table_name = 'pos_cash_sessions' and column_name in ('client_id','synced_at');
select conname from pg_constraint where conname = 'pos_cash_sessions_tenant_client_unique';
```

---

## 4. Ticket T-02 — Entidades de dominio ✅

**`backend/src/domain/entities/pos/Sale.ts`**
- `PosSale` (1:1 con `pos_sales`, con `items: PosSaleItem[]`), `PosSaleItem` (1:1 con `pos_sale_items`).
- `PosSaleItemInput` — `productId, quantity`. Nada más viene del cliente.
- `NewPosSale` — `clientId, cashSessionId, items, paymentMethod, amountPaid`.
- `ResolvedPosSale` / `ResolvedPosSaleLine` — **agregado**: la venta ya resuelta por el caso de uso (precios del catálogo, totales, ticket). Es lo que recibe el repositorio, que así no hace aritmética ni consulta precios.

**`backend/src/domain/entities/pos/CashSession.ts`**
- `PosCashSession` (1:1 con `pos_cash_sessions`, incluye `clientId`/`syncedAt`).
- `NewPosCashSession` — `clientId, openingAmount`.
- `CloseCashSessionInput` — `closingAmount` (lo que manda el cajero).
- `CloseCashSessionPatch` — **agregado**: `closingAmount, expectedAmount, difference` ya calculados, lo que persiste el repositorio.
- `PosCashSessionSummary` — `totalSales, saleCount, byPaymentMethod`.

---

## 5. Ticket T-03 — Puertos y repositorios ✅

Regla 9 del CLAUDE.md: `tenantId` siempre como **primer** argumento. El texto original tenía `open(session, tenantId, cashierId)` y `findOpenByCashier(cashierId, tenantId)`; se ajustaron.

**`PosSaleRepository`**
- `create(tenantId, cashierId, sale: ResolvedPosSale): Promise<PosSale>` — idempotente por `client_id`.
- `findByClientId(tenantId, clientId)`
- `listByCashSession(tenantId, cashSessionId)`
- `countByCashSession(tenantId, cashSessionId)` — base del ticket secuencial.

**`PosCashSessionRepository`**
- `open(tenantId, cashierId, session)` — idempotente por `client_id`.
- `findById(tenantId, id)`, `findByClientId(tenantId, clientId)` — **agregados**: el cierre y el resumen necesitan verificar que la sesión es del tenant y del cajero.
- `findOpenByCashier(tenantId, cashierId)`
- `close(tenantId, id, patch: CloseCashSessionPatch)`
- `getSummary(tenantId, id)` — solo ventas `completed`; pagina de 1000 en 1000 porque PostgREST corta ahí y un resumen truncado daría un arqueo falso.

**Implementaciones Supabase** (el texto original no las listaba; sin ellas T-05 no tiene nada real que cablear): `infrastructure/repositories/pos/SupabasePosSaleRepository.ts` y `SupabasePosCashSessionRepository.ts`, cableadas en `Bootstrap.ts`.

**Atomicidad de la venta sin transacciones:** supabase-js no expone transacciones, así que cabecera e items son dos INSERT. Los items van en un solo statement (entran todos o ninguno, y los triggers se disparan una vez por línea). Si el segundo INSERT falla, queda una cabecera sin líneas; el siguiente reintento del cliente la detecta (mismo `client_id`, cero líneas), la borra y reinserta. Una venta real siempre tiene al menos una línea, así que "cabecera sin líneas" solo puede ser un intento cortado. La alternativa limpia sería una función RPC `plpgsql` que haga todo en una transacción; no se hizo para no ampliar la 022 sin preguntar.

---

## 6. Ticket T-04 — Casos de uso (`application/pos/`) ✅

Errores de dominio tipados en `PosOperationError.ts` (mismo patrón que `PosAuthError`), con `code` que el router mapea a HTTP.

- **`RegisterSaleUseCase`**
  - Primero busca por `clientId`: si la venta ya existe y está completa, la devuelve **antes** de validar stock. Si no, el reintento de la venta de la última pieza fallaría por el stock que ella misma descontó.
  - Agrupa items del mismo producto y valida stock sobre la cantidad total (solo `trackStock`).
  - Precio, nombre, sku e impuesto salen de `pos_products`; lo que mande el cliente se ignora.
  - Impuesto **aditivo**: `total = Σ(unit_price × qty) + Σ(subtotal × tax_rate/100)`. Con `tax_rate = 0` (el default y el caso del piloto) da igual; si algún tenant maneja precios con IVA incluido, esto hay que revisarlo.
  - Efectivo: `amountPaid ≥ total`, `changeGiven = amountPaid − total`. Tarjeta/transferencia: pago exacto, porque el cambio saldría del cajón y descuadraría el arqueo.
  - **`ticketNumber` lo asigna el servidor**: `count(ventas de la sesión) + 1`, con relleno a 3 dígitos (`001`, `002`…). El texto original decía "formateado en el cliente offline", pero el contrato de `POST /sales` (§7) no trae ese campo y la columna es `not null`. Mismo esquema (secuencial por sesión), otro lugar. La PWA puede mostrar un número provisional mientras está offline.
- **`OpenCashSessionUseCase`** — primero busca por `clientId` (un reintento de la misma apertura devuelve su sesión, no "ya tienes una caja abierta"); después rechaza una segunda caja abierta del mismo cajero.
- **`CloseCashSessionUseCase`** — `expectedAmount = openingAmount + Σ total (cash)`, `difference = closingAmount − expectedAmount`. Cerrar una sesión ya cerrada la devuelve tal cual (idempotente).
- **`GetCashSessionSummaryUseCase`** — solo el dueño de la sesión.

Una sesión solo la usa, cierra o consulta su propio cajero (`session_not_owned` → 403). La unicidad "una caja abierta por cajero" la hace el caso de uso, no un índice en BD; dos aperturas simultáneas con `clientId` distinto podrían colarse. Si se quiere blindar: índice parcial único `(tenant_id, cashier_id) where status = 'open'`.

---

## 7. Ticket T-05 — Endpoints en `PosRouter.ts` ✅

`createPosRouter` recibe `posSales` y `posCashSessions`; los casos de uso se construyen dentro del factory a partir de los repos inyectados.

| Método | Ruta | Body | Respuesta |
|---|---|---|---|
| `POST` | `/cash-sessions` | `{ clientId, openingAmount }` | `201 { session }` nueva · `200` reintento |
| `GET` | `/cash-sessions/current` | — | `200 { session \| null }` |
| `PATCH` | `/cash-sessions/:id/close` | `{ closingAmount }` | `200 { session, summary }` |
| `GET` | `/cash-sessions/:id/summary` | — | `200 { session, summary }` |
| `POST` | `/sales` | `{ clientId, cashSessionId, items: [{productId, quantity}], paymentMethod, amountPaid }` | `201 { sale }` nueva · `200` reintento |

- `clientId`, `cashSessionId`, `productId` y `:id` deben ser UUID (un id malformado da 400 en vez de un 500 de Postgres).
- `paymentMethod` acepta `cash | card | transfer`. **`mixed` no**: existe en el CHECK de `pos_sales`, pero no hay columnas para el desglose efectivo/tarjeta, así que el arqueo no podría cuadrarlo. La pantalla de §3.2 del diseño tampoco lo ofrece.
- Errores de dominio → `{ error, code, details? }`: `404` session/product_not_found · `403` session_not_owned · `409` session_closed, session_already_open, insufficient_stock · `400` empty_cart, insufficient_payment, invalid_payment. Infraestructura → `500 { error: 'Error interno del POS' }`.

---

## 8. Ticket T-06 — Frontend: app de cajero (pendiente)

**Ubicación propuesta:** `frontend/src/apps/pos-cajero/` (nueva app hermana de `frontend/src/apps/panel/`, no se mezcla con el panel admin).

3 pantallas, diseño ya validado en `POS_LITE_PLAN_DISENO.md` §3 — no rediseñar, implementar tal cual:
1. Login (nombre + PIN)
2. Pantalla principal: catálogo con pestañas Todo/Productos/Servicios + buscador, cuadro de "agregar por código o nombre" dentro del panel de venta actual, carrito, métodos de pago, cobrar.
3. Cerrar caja: arqueo + resumen (`GET /cash-sessions/:id/summary`).

**Cliente offline:** instalar `dexie` (no está en `package.json` hoy). Cada acción (abrir caja, venta, cerrar caja) se guarda local primero con `clientId` generado ahí (`crypto.randomUUID()`), se encola, y un proceso de sincronización la manda cuando hay conexión. El backend deduplica solo por `unique(tenant_id, client_id)` — el cliente no necesita lógica extra de deduplicación.

Lo que el backend ya fija para la cola (ver §11.3 para lo que falta decidir):
- **Reintentar solo ante red o 5xx.** Un 4xx es definitivo: reintentarlo no cambia nada.
- **FIFO estricto, sin saltarse elementos.** Una venta que se sincroniza después del cierre de su caja recibe `409 session_closed`; si la cola manda el cierre antes que una venta pendiente, esa venta se pierde y el arqueo se calcula sin ella.
- **El cierre depende del `id` de servidor de la sesión**, que no existe mientras la apertura no se haya sincronizado. La PWA tiene que resolver `clientId → id` al sincronizar la apertura antes de mandar ventas y cierre.

---

## 9. Explícitamente fuera de alcance — no construir sin pedirlo

Clientes y fiado · reportes avanzados más allá del resumen de cierre · impresión de ticket físico · proveedores y compras · cualquier pieza del router de IA (`AnthropicIntentRouter`, ya construido y pausado, no forma parte de este plan).

---

## 10. Orden de ejecución

T-01 (migración) → T-02 (entidades) → T-03 (puertos) → T-04 (casos de uso) → T-05 (endpoints) → T-06 (frontend). Cada ticket es una unidad de trabajo independiente — no arrancar T-06 sin que T-05 esté probado, la UI necesita los endpoints reales para no simular respuestas falsas.

---

## 11. Registro de ejecución — 2026-09-10

### 11.1 Qué difería del texto original

| Texto original | Código real | Qué se hizo |
|---|---|---|
| "La siguiente migración disponible es `021_*.sql`" | `021_carousel_fallback_image.sql` ya existe (PR #75) | Se usó la **022** |
| SQL de T-01 con `add constraint` suelto | No es idempotente: falla al correrlo dos veces | Bloque `do $$` que revisa `pg_constraint` + backfill idempotente |
| Firmas con `tenantId` en 2º/3º lugar | Regla 9 del CLAUDE.md: primer argumento | `tenantId` primero en todos los métodos |
| Los repositorios Supabase no estaban listados | Sin ellos T-05 no tiene implementación real | Creados y cableados en `Bootstrap.ts` |
| `ticketNumber` formateado en el cliente | El body de `POST /sales` no lo trae; la columna es `not null` | Lo asigna el servidor, mismo esquema secuencial |
| `pos_cash_sessions` sin mención de timestamps | No tiene `created_at` | El orden de sesiones usa `opened_at` |

### 11.2 Verificación

- `npm test`: 64 suites, 503/503 (antes de esta rama: 58 suites · 456 tests).
- `npm run type-check --workspace backend`: limpio.
- `npm run lint`: 0 errores (los warnings de `any` en el mock de Supabase siguen el patrón de los tests existentes).
- Tests nuevos: 5 suites unitarias en `tests/unit/pos/` (casos de uso + repos Supabase con mock fluent) y `tests/integration/pos/posSalesRouter.test.ts` (HTTP con el middleware POS real).
- **No verificado:** la 022 no se ha corrido contra Postgres real; los repos Supabase solo se probaron con mock. Se verifica al aplicar la migración en Cloud y hacer una venta de punta a punta.

### 11.3 Decisiones abiertas para el humano (bloquean T-06, no T-01…T-05)

1. **Venta offline sin stock en el servidor.** El plan pide rechazar con `insufficient_stock` si no hay stock suficiente, y así quedó. Pero en offline la venta ya ocurrió: el producto salió de la tienda y el dinero está en el cajón. Si al sincronizar el servidor dice que no había stock (catálogo desactualizado en la laptop, otro cajero vendió la última pieza), el `409` es definitivo y la venta no se registra — el arqueo va a salir con sobrante. Opciones: (a) dejarlo así y que la PWA le muestre la venta rechazada al cajero para resolverla a mano; (b) que las ventas sincronizadas acepten stock negativo y lo marquen para revisión. Afecta cómo la cola maneja el 409.
2. **El login necesita `tenantId`.** `POST /api/auth/pos-login` recibe `{ tenantId, name, pin }`. El diseño dice "campo único: nombre + PIN", así que el `tenantId` tiene que venir de la configuración de la laptop (se fija una vez al instalar la PWA). Hay que decidir cómo se configura: URL por tenant, pantalla de setup del operador, etc.
3. **Login offline.** El login es contra el servidor (bcrypt + cookie). Si el internet está caído cuando el cajero llega en la mañana, no hay sesión y no puede ni abrir caja offline. O la cookie se deja viva lo suficiente (hoy `jwtTtlSeconds`), o hace falta un mecanismo de desbloqueo local.
