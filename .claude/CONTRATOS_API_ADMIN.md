# Contratos reales de `/api/admin/*` — descubiertos por prueba y error

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

`POST /api/admin/simulate`

- El campo del mensaje es `content`, **no** `message`.
- **Sin `persist: true` en el body, cada llamada es un turno aislado desde
  cero** — no encadena con llamadas anteriores para el mismo
  `tenantId`+`phoneNumber`. Con `persist: true`, sí persiste el estado de la
  conversación (`currentNodeId`, `context`) entre llamadas, igual que un
  mensaje real de WhatsApp.
- El **primer mensaje** de una conversación nueva (sin `currentNodeId`
  previo) siempre solo **renderiza el nodo `start_node_id`** — no evalúa su
  contenido contra las transiciones de ese nodo. Para probar una transición
  keyword/condición del nodo de arranque hace falta un **segundo** mensaje en
  la misma conversación persistida.
- No hay forma de forzar la hora simulada — `BusinessHoursService` (gate de
  "fuera de horario") solo está cableado en `BotController` (webhook real),
  no en `SimulateMessageUseCase`. El simulador ignora horarios por completo.
- `POST /api/admin/simulate/reset` con `{tenantId, phoneNumber}` limpia el
  estado persistido para volver a probar desde cero.

## 5. Borrar un tenant

`DELETE /api/admin/tenants/:id`

- Es **soft-delete** (`status = 'archived'`, `deleted_at` seteado) — no
  cascade hard-delete. El registro y sus filas relacionadas siguen en la
  base de datos.

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
