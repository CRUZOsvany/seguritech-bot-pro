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
| T-01 Migración | Hecho — **es la 022, no la 021** (ver §11) · **sin aplicar en Cloud** | `feat/pos-lite-backend` |
| T-02 Entidades | Hecho | `feat/pos-lite-backend` |
| T-03 Puertos + repos Supabase | Hecho | `feat/pos-lite-backend` |
| T-04 Casos de uso | Hecho | `feat/pos-lite-backend` |
| T-05 Endpoints | Hecho, probado con supertest | `feat/pos-lite-backend` |
| T-06 Frontend cajero | Hecho — PWA en `/caja/<tenantId>/`, probada de punta a punta contra los routers reales (§11.2) | `feat/pos-lite-backend` |

§11 registra todo lo que cambió respecto al texto original al ejecutar T-01…T-06, y las decisiones que tomó el humano a mitad de la ejecución. Las secciones de abajo ya están corregidas.

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

### 1.2 Lo que faltaba al empezar (2026-09-10) — ya construido en T-01…T-06

| Capa | Antes | Ahora |
|---|---|---|
| `domain/entities/pos/` | Sin `Sale.ts` ni `CashSession.ts` | Ambos creados |
| `domain/ports/pos/` | Sin puerto de ventas ni de caja | `PosSaleRepository.ts`, `PosCashSessionRepository.ts` |
| `application/pos/` | Solo `PosAuthService.ts, PosAuthError.ts` | + 4 casos de uso y `PosOperationError.ts` |
| `infrastructure/repositories/pos/` | Sin repos de ventas ni caja | `SupabasePosSaleRepository.ts`, `SupabasePosCashSessionRepository.ts` |
| `PosRouter.ts` | Solo GET de catálogo | + 5 rutas de caja y ventas (§7) |
| Frontend | Solo panel admin (`tenants.$id.pos.tsx`) y `shared/api/pos.ts`. Sin app de cajero. `dexie` no instalado | PWA del cajero en `frontend/src/apps/pos-cajero/` (§8), con `dexie` y tests en Vitest |
| Migraciones | **La última era `021_carousel_fallback_image.sql`** (el texto original decía 020) | `022_pos_lite_offline.sql` |

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

## 3. Ticket T-01 — Migración 022: POS Lite offline-first ✅

**Archivo:** `backend/supabase/migrations/022_pos_lite_offline.sql`

1. `pos_cash_sessions`: `client_id text not null` + `synced_at timestamptz` + `unique(tenant_id, client_id)`. Backfill `client_id = id::text` para filas previas, y el constraint va en un bloque `do $$` que revisa `pg_constraint` antes de crearlo (un `add constraint` suelto falla la segunda vez).
2. `pos_sales`: `needs_review boolean not null default false` + `review_reason text` + índice parcial `(tenant_id, created_at desc) where needs_review` para listarlas. Decisión del humano del 2026-09-10 (§11.3).

Idempotente de punta a punta: se puede correr dos veces sin error.

**Pendiente humano:** aplicarla en Supabase Cloud (SQL Editor, el CLI no está enlazado) y verificar el mismo día del merge — regla 8.

```sql
-- Verificación post-aplicación
select table_name, column_name, is_nullable from information_schema.columns
 where (table_name = 'pos_cash_sessions' and column_name in ('client_id','synced_at'))
    or (table_name = 'pos_sales' and column_name in ('needs_review','review_reason'));
select conname from pg_constraint where conname = 'pos_cash_sessions_tenant_client_unique';
select indexname from pg_indexes where indexname = 'idx_pos_sales_needs_review';
```

---

## 4. Ticket T-02 — Entidades de dominio ✅

**`backend/src/domain/entities/pos/Sale.ts`**
- `PosSale` (1:1 con `pos_sales`, con `items: PosSaleItem[]`), `PosSaleItem` (1:1 con `pos_sale_items`).
- `PosSaleItemInput` — `productId, quantity`. Nada más viene del cliente.
- `NewPosSale` — `clientId, cashSessionId, items, paymentMethod, amountPaid`.
- `needsReview` / `reviewReason` en `PosSale` y `ResolvedPosSale` — la venta se registró con stock insuficiente, producto desactivado o pago que no cuadra (§6).
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
  - Primero busca por `clientId`: si la venta ya existe y está completa, la devuelve sin volver a resolverla.
  - Precio, nombre, sku e impuesto salen de `pos_products`; lo que mande el cliente se ignora.
  - **La venta ya ocurrió cuando llega al servidor** (la PWA registra local primero), así que lo que delata un catálogo desactualizado en la laptop **no se rechaza**: se registra con `needs_review = true` y el motivo en `review_reason`, varios unidos con « · »:
    - stock insuficiente sobre la cantidad agregada por producto (el trigger deja `stock_qty` negativo);
    - producto desactivado después de que la laptop bajó el catálogo;
    - efectivo menor al total del servidor, o tarjeta/transferencia distinta al total (el precio cambió).
  - Solo se rechaza lo que no se puede registrar: caja inexistente, ajena o cerrada; carrito vacío; producto que no existe en el tenant.
  - Impuesto **aditivo**: `total = Σ(unit_price × qty) + Σ(subtotal × tax_rate/100)`. Con `tax_rate = 0` (el default y el caso del piloto) da igual; si algún tenant maneja precios con IVA incluido, esto hay que revisarlo.
  - `changeGiven = max(0, amountPaid − total)` en efectivo; tarjeta y transferencia nunca registran cambio.
  - **`ticketNumber` lo asigna el servidor**: `count(ventas de la sesión) + 1`, con relleno a 3 dígitos (`001`, `002`…). El contrato de `POST /sales` no trae ese campo y la columna es `not null`. La PWA muestra un número provisional mientras la venta no sube.
- **`OpenCashSessionUseCase`** — primero busca por `clientId` (un reintento de la misma apertura devuelve su sesión, no "ya tienes una caja abierta"); después rechaza una segunda caja abierta del mismo cajero, devolviendo el `sessionId` de la que ya existe.
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
| `POST` | `/sales` | `{ clientId, cashSessionId, items: [{productId, quantity}], paymentMethod, amountPaid }` | `201 { sale }` nueva · `200` reintento. `sale.needsReview` / `sale.reviewReason` |

- `clientId`, `cashSessionId`, `productId` y `:id` deben ser UUID (un id malformado da 400 en vez de un 500 de Postgres).
- `paymentMethod` acepta `cash | card | transfer`. **`mixed` no**: existe en el CHECK de `pos_sales`, pero no hay columnas para el desglose efectivo/tarjeta, así que el arqueo no podría cuadrarlo. La pantalla de §3.2 del diseño tampoco lo ofrece.
- Errores de dominio → `{ error, code, details? }`: `404` session_not_found, product_not_found · `403` session_not_owned · `409` session_closed, session_already_open (con `details.sessionId`) · `400` empty_cart. Infraestructura → `500 { error: 'Error interno del POS' }`.
- Nadie lista todavía las ventas con `needs_review`: quedan en BD, marcadas y con índice. La pantalla para revisarlas (panel del operador o del dueño) es trabajo siguiente.

---

## 8. Ticket T-06 — Frontend: app de cajero ✅

**Ubicación:** `frontend/src/apps/pos-cajero/`, app hermana del panel con build propio (`vite.caja.config.ts` → `backend/public/caja/`). Comparte stack y componentes (`@/shared/ui`), pero no el router, la URL ni el cliente HTTP del panel — el `apiFetch` del panel redirige a `/app/login` en un 401 y la caja tiene que seguir funcionando con su cola.

**Una URL por negocio** (decisión del humano): `/caja/<tenantId>/`. El `tenantId` que exige `pos-login` sale de la ruta. Express (`infrastructure/server/cajaStatic.ts`) sirve el build y un manifest por negocio en `/caja/<tenantId>/manifest.webmanifest`, con `start_url` y `scope` relativos: cada negocio se instala como su propia app. El manifest no consulta la BD — la ruta es pública y un UUID no debe revelar el nombre del negocio. El panel muestra el enlace en *Punto de venta* del negocio.

**Pantallas** (diseño §3, sin rediseñar): login con nombre + PIN; abrir caja (sin caja no se vende); venta con catálogo Todo / Productos / Servicios + buscador, agregar rápido por código de barras, SKU o nombre (Enter, flechas, F2 regresa al campo), carrito, tres métodos de pago, recibido y cambio; cerrar caja con resumen, efectivo esperado, arqueo y lista de ventas con su estado (pendiente, sincronizada, revisar, rechazada).

**Offline** — todo en `lib/`, con tests en Vitest sobre IndexedDB en memoria (`fake-indexeddb`):
- `db.ts` — Dexie, una base por negocio: `catalog`, `sessions`, `sales`, `outbox`, `meta`.
- `actions.ts` — abrir, vender y cerrar escriben local y encolan en una sola transacción, sin tocar la red. Vender descuenta el stock *local* para que el cajero vea un número aproximado sin internet.
- `sync.ts` — la cola:
  - **FIFO estricto**: apertura → ventas → cierre. El `id` de servidor de la caja se resuelve al subir la apertura y se usa en ventas y cierre.
  - Red caída, `5xx`, `408` o `429` (el rate limit global es de 100 req/min por IP) → **se detiene** y reintenta sin saltarse nada.
  - `401` → se detiene y pide volver a entrar; nada se pierde.
  - Otro `4xx` → definitivo: la operación se marca fallida, se le muestra al cajero y la cola sigue.
  - `409 session_already_open` al abrir → adopta la caja que el servidor ya tenía abierta, para no dejar las ventas sin dónde registrarse.
  - Cada cajero sincroniza **solo sus** operaciones: con la cookie de otro, el servidor respondería `session_not_owned` y se perderían.
- `hooks/useSyncEngine.ts` — corre la cola al montar, al volver la red, cada 20 s y después de cada acción. `navigator.locks` evita que dos pestañas sincronicen a la vez. Con la cola vacía adopta una caja abierta en otro equipo (`GET /cash-sessions/current`) y refresca el catálogo cada 5 min o en cuanto suben ventas.
- `public/sw.js` — service worker que guarda solo el cascarón (HTML, JS, CSS, íconos) para que la app abra sin internet. `/api/*` nunca pasa por él.

**Login sin internet:** el primer login necesita red (bcrypt + cookie). Después, el cajero queda guardado en `localStorage` (id, nombre, rol; nada secreto) y la caja reabre sin internet. Si la cookie venció (8 h, `ADMIN_JWT_TTL_SECONDS`), la cola se detiene con 401 y un aviso pide volver a entrar, sin perder lo guardado.

**Build e integración:** `npm run build:caja --workspace frontend`, incluido en `npm run build` de la raíz, en el `Dockerfile` (stage 1 + `COPY public/caja`) y en CI, que además corre `npm test --workspace frontend`.

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
| Rechazar con `insufficient_stock` | La venta offline ya ocurrió; rechazarla la pierde | Se registra y se marca `needs_review` (decisión del humano, §11.3) |
| El frontend no tenía runner de tests | "Sin test en el mismo commit, no está hecho" | Vitest 4 (compatible con Node 20 de CI/Docker; Vitest 5 pide Node 22) + `fake-indexeddb` |

### 11.2 Verificación

- Backend `npm test`: 65 suites · 515/515 (antes de esta rama: 58 · 456).
- Frontend `npm test --workspace frontend`: 3 archivos · 31 tests (carrito, catálogo, acciones locales, cola de sincronización).
- `type-check` limpio en ambos workspaces; `lint` sin errores; `npm run build` de la raíz genera `backend/public/app/` y `backend/public/caja/`.
- **Prueba de punta a punta** (temporal, no commiteada): los routers reales de auth, POS y `/caja` sobre el store en memoria, y el código real de la caja hablándoles por HTTP. Login → catálogo → se cae la red → abrir caja y dos ventas → vuelve la red → suben en orden (tickets 001, 002; la segunda con `needs_review` y stock en −1) → reenvío de una venta sin duplicar → cierre sin red → el esperado y la diferencia del servidor (520, −5) coinciden con los de la laptop → cookie vencida detiene la cola con `unauthorized` sin perder la apertura. Además: `/caja/<uuid>` redirige a la barra final, el manifest del negocio sale con `start_url: "./"`, y `sw.js`, assets e íconos responden 200.
- **No verificado:**
  - La 022 no se ha corrido contra Postgres real; los repos Supabase solo se probaron con mock.
  - La UI no se ha visto en un navegador: no hubo herramienta de navegador en la sesión. Falta abrirla, instalarla como PWA y probarla con un lector de código de barras.
  - El comportamiento del service worker sin internet (abrir la app con la red caída) necesita navegador real.

### 11.3 Decisiones del humano (2026-09-10)

1. **Venta con stock insuficiente → se acepta y se marca para revisión**, en vez de rechazarse. Se aplicó el mismo criterio a los otros dos síntomas de catálogo desactualizado (producto desactivado, pago que no cuadra por cambio de precio), porque rechazarlos también perdía la venta. Si solo debe aplicar al stock, es revertir dos `push` en `RegisterSaleUseCase`.
2. **Una URL por negocio**: `/caja/<tenantId>/`.
3. **Login sin internet** — no se decidió explícitamente; quedó así: el primer login necesita red, después la caja reabre sin ella con el cajero guardado. Si se quiere entrar por primera vez en el día sin internet, hace falta un desbloqueo local por PIN (no construido).

### 11.4 Pendiente

- Aplicar y verificar la 022 en Cloud (regla 8). La 021 también sigue sin aplicar.
- Pantalla para revisar las ventas con `needs_review`.
- Probar la PWA en la laptop real del mostrador.
