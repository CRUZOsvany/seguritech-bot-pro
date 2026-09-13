# Contratos reales de `/api/admin/*` — descubiertos por prueba y error

> **[REFERENCIA VIGENTE]**
> Contratos reales de `/api/admin/*`. Se consulta antes de integrar contra un endpoint admin. Si contradice al router, gana el router.

---

> **Por qué existe este documento.** Durante el stress test del tenant demo
> "Papelería DEMO" (2026-08-25, `.claude/PROMPT_DEMO_PAPELERIA_STRESS_TEST.md`)
> varios prompts anteriores asumieron shapes de request/response que **no
> coinciden con el código real** de los routers en
> `backend/src/infrastructure/server/admin/`. El costo de descubrirlo fue
> tiempo real de sesión (varias vueltas de prueba y error contra un backend
> vivo). Este documento existe para que ese costo no se vuelva a pagar.
>
> **Regla:** si algo aquí contradice el código real de `backend/src/infrastructure/server/admin/*.ts`, el código gana — este documento puede quedarse atrás. Verificar contra el router antes de confiar ciegamente, igual que con `SEGURITECH_ESTADO_ACTUAL.md`.
>
> **Fecha de verificación:** 2026-08-25, contra `main` (post PR #59/#60).

---

## 1. Import de catálogo POS

`POST /api/admin/tenants/:id/pos/products/import`

- `dryRun` va en el **body** del `multipart/form-data` (campo `dryRun`, valor
  string `"true"`/`"false"` o boolean `true`), **NO en el query string**.
  `?dryRun=true` en la URL se ignora silenciosamente — el import corre real.
  Fuente: `posCatalogRouter.ts` — `const dryRun = req.body?.dryRun === 'true' || req.body?.dryRun === true;`.
- Archivo va en el campo `file` (`multipart/form-data`), no JSON — el
  body-parser global limita JSON a 64kb.
- Con ~110 filas, el import puede tardar **~60 segundos** (upserts
  secuenciales a Supabase, uno por fila) y el cliente puede recibir
  "Empty reply from server" (curl error 52) aunque el import haya terminado
  bien del lado del servidor — verificar el resultado real vía
  `GET /api/admin/audit-log?action=pos.products.import&targetId=<tenantId>`
  (trae `metadata.created/updated/errorCount`) antes de asumir que falló.

## 2. Activar servicios de un tenant

`POST /api/admin/tenants/:id/services`

- El campo es `serviceType` (camelCase), **no** `service_type`.
- Body: `{"serviceType": "whatsapp_bot" | "messenger_bot" | "pos"}`. No acepta
  `active: true` — solo crea el registro (queda en `draft` o `configuring`
  según el tipo).
- Para dejarlo operativo hay que avanzar el FSM explícitamente vía
  `PATCH /api/admin/tenants/:id/services/:serviceType` con `{"status": "..."}`.
  Transiciones válidas (`domain/services/serviceFsm.ts`):
  `draft → configuring → active ⇄ paused`, cualquiera `→ archived`,
  `archived → configuring`. Normalmente son **2 PATCH** (`draft→configuring`,
  `configuring→active`) para dejar un servicio recién creado en `active`.

## 3. Directorio de servicios

`POST /api/admin/tenants/:id/service-directory`

- Crea **una entrada a la vez** — no existe un endpoint bulk
  `{"entries": [...]}`.
- Body requerido: `{"nombre": string, "keywords": string[], "respuesta": string}`.
  `respuesta` es **obligatorio** (no `descripcion` — ese campo no existe en
  el schema). Opcionales: `precio`, `activo` (default `true`), `orden`
  (default `0`).
- Requiere la tabla `tenant_service_directory` (migración 020) aplicada en
  el Supabase del entorno — ver §5 de este documento si el `GET` regresa
  `PGRST205`.

## 4. Simulador de conversaciones

`POST /api/admin/simulate` y `POST /api/admin/simulate/reset` **ya no
existen**: se borraron el 2026-09-11 junto con el simulador suelto de
`/simulator/<uuid>`, que era lo único que los llamaba.

El simulador vive en el Studio:
`POST /api/admin/tenants/:id/studio/flows/:flowId/simulate`
(`studioRouter.ts`). Corre el motor de producción (`ConversationEngine`) con
sesiones, reloj y envío falsos, así que no escribe en la base.

## 5. Borrar un tenant

`DELETE /api/admin/tenants/:id`

- Es **soft-delete** (`status = 'archived'`, `deleted_at` seteado) — no
  cascade hard-delete. El registro y sus filas relacionadas siguen en la
  base de datos. En el panel se llama **Archivar**. Audita `tenant.delete`.
- Tras archivar, el tenant desaparece de **todas** las lecturas
  (`GET /tenants`, `/tenants/:id`, `/detail` → 404): todas filtran
  `deleted_at IS NULL`.

`DELETE /api/admin/tenants/:id/permanent` (desde 2026-09-12)

- **Hard-delete irreversible**: `DELETE FROM tenants` y las FKs
  `on delete cascade` se llevan flows, versiones, mensajes, configuración,
  credenciales Meta, servicios, POS y directorio. `admin_users.tenant_id`
  queda en `null` (el operador no se borra).
- Solo `super_admin`. Body: `{"confirmNombreNegocio": string}` — tiene que ser
  **idéntico** a `nombre_negocio` (mayúsculas y acentos incluidos).
- Solo con status `draft`, `sandbox` o `archived`; `live`/`paused` → 400.
  **Sí encuentra tenants ya archivados con soft-delete**: es la única vía para
  purgarlos (lee con `findIncludingDeleted`, sin filtro de `deleted_at`).
- Respuestas: `200 {ok:true}` · `400 {error:'El nombre no coincide'}` ·
  `400 {error:'Solo se pueden eliminar clientes en draft, sandbox o archivados. …'}` ·
  `400` sin `confirmNombreNegocio` · `404` si no existe · `403` para `admin_operator`.
- Audita `tenant.delete.permanent` (distinta de `tenant.delete`) con
  `metadata: {nombre_negocio, status}` — la fila del tenant ya no existe, el
  nombre solo queda ahí.
- Fuente: `tenantsRouter.ts` + `domain/use-cases/HardDeleteTenantUseCase.ts`.

---

## Nota de infraestructura: migraciones mergeadas ≠ aplicadas

La migración `020_tenant_service_directory.sql` (PR #59) estaba mergeada a
`main` pero **nunca se había corrido** contra el Supabase remoto de este
proyecto (`aakbliewttiuqhyfyqwn.supabase.co`) — `GET .../service-directory`
fallaba con `PGRST205: Could not find the table 'public.tenant_service_directory'
in the schema cache`. Se aplicó manualmente vía SQL Editor de Supabase en
esta misma sesión (2026-08-25).

**Auditoría hecha el mismo día** (2026-08-25): se listaron todas las tablas
creadas por cada migración en `backend/supabase/migrations/` (`grep -inE
"create table" supabase/migrations/*.sql`) y se verificó cada una contra el
Supabase remoto vía REST (`GET /rest/v1/<tabla>?select=id&limit=1` con la
`service_role` key — `200` = existe, `PGRST205` = falta). Resultado: **020
era la única migración mergeada y no aplicada.** Las 19 restantes (001–019)
sí están aplicadas — confirmado incluyendo las menos usadas en el día a día
(`whatsapp_flows`, `tenant_knowledge_chunks`).

No hay `supabase` CLI enlazado a este proyecto (`supabase link` pendiente,
ver `SEGURITECH_ESTADO_ACTUAL.md` §3 deuda #7) — mientras eso no se resuelva,
toda migración nueva se aplica a mano en el SQL Editor del Dashboard, y
conviene repetir esta auditoría (o dejarla scriptada) después de cada PR que
agregue una migración, para no volver a descubrir el gap por accidente en
medio de una prueba.
