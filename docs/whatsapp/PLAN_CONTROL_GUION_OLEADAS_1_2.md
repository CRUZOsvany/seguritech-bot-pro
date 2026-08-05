# PLAN MAESTRO — Oleadas 1 y 2 (Control del Guion del Bot)

> **Versión:** 1.1 — Agosto 2026
> **Autor:** Cris + Claude (chat de arquitectura)
> **Consumidor:** Claude Code (IntelliJ, Claude Max/Opus, WSL2)
> **Regla:** 1 prompt = 1 rama = 1 PR = merge a `main` antes de apilar el siguiente.
> **Estado del repo al momento de escribir (v1.0):** rama activa `chore/sync-repo-y-runbook`, HEAD `b14da3e`.

---

## 0. Cómo usar este documento

Este archivo NO se pega en Claude Code. Es el índice y la especificación. De aquí salen los
prompts individuales (`P0_*.md`, `P1_*.md`, …), que sí se pegan, uno a la vez.

Antes de generar cada prompt, se relee la sección 2 (hechos verificados) para no reintroducir
suposiciones. Si el código de `main` contradice algo de la sección 2, **gana el código** y se
actualiza este documento.

---

## 1. Decisiones congeladas

| ID | Decisión | Estado |
|---|---|---|
| **D1** | `mensaje_fuera_horario` se OCULTA de la UI de Mensajes hasta que exista lógica de horarios. No se deshabilita: se quita del formulario. La columna en BD se queda (no se borra dato). | **ASUMIDA** — confirmar con Cris |
| **D2** | `mensaje_confirmacion_pedido` se OCULTA igual. Se reactivará cuando llegue papelería/ferretería con un nodo `config_bound`. | **ASUMIDA** — confirmar con Cris |
| **D3** | TTL del handoff = **48 h** (`HANDOFF_PAUSE_MINUTES = 2880`). El TTL deja de ser el mecanismo primario de recuperación y pasa a ser red de seguridad para conversaciones abandonadas; la recuperación primaria es la reanudación manual (P4). Se alinean los 4 lugares que hoy se contradicen. | **CONGELADA** |
| **D4** | Reanudación por WhatsApp del dueño: **conservadora**. El gate solo intercepta si el mensaje del `ownerPhone` hace match EXACTO con un comando conocido (`#listo`, `#reanudar`). Cualquier otro mensaje del dueño sigue al `FlowInterpreter` normal, para que pueda auto-probarse el bot. Simétrico a `isEscapeWord`. | **CONGELADA** |
| **D5** | `admin_operator` **NO** puede publicar flows. `publish` pasa de `requireTenantScope` a `requireRole('super_admin')`, quedando simétrico con `rollback`. | **CONGELADA** |
| **D6** | El Guion **solo guarda draft**. Nunca publica. Publicar sigue siendo acto explícito desde el Designer, exclusivo de `super_admin` por D5. | **CONGELADA** |

### Corolario de D5 + D6
No se necesita un rol nuevo ni una tabla de permisos. El comercial usa el Guion → guarda draft →
Cris revisa en el Designer → publica. Un solo carril de escritura, un solo candado.

---

## 2. Hechos verificados contra el código (anti-alucinación)

Todo lo de abajo fue confirmado leyendo el repo (v1.0 contra el ZIP; v1.1 releído contra `main` en
vivo, ver §2.6). **Estos son los datos que los prompts deben citar como verdad, en vez de dejar que
Claude Code los infiera.**

### 2.1. Lo que YA EXISTE y NO hay que construir

| Capacidad | Dónde | Detalle |
|---|---|---|
| Simulación contra draft | `backend/src/infrastructure/server/admin/tenantsRouter.ts` (`POST /simulate`) | Acepta `source: 'active' \| 'draft' \| 'version'`, más `flowId` y `versionId`. Valida y responde. **El frontend no lo usa.** |
| Historial de versiones | `flowsRouter.ts` — `GET /tenants/:id/flows/:flowId/versions` | Existe. **Frontend no lo consume.** |
| Rollback | `flowsRouter.ts` — `POST /tenants/:id/flows/:flowId/rollback`, con `requireRole('super_admin')` | Existe. **Frontend no lo consume.** |
| Draft persistido | migración `015_bot_flows_draft.sql` | Columnas `bot_flows.draft_json (jsonb)` y `bot_flows.draft_updated_at (timestamptz)` |
| Versionado | migración `008_bot_flow_versions.sql` | Tabla `bot_flow_versions`, `unique (flow_id, version_number)`, `created_by → admin_users` |
| Pausa por handoff | migración `017_human_handoff_pause.sql` + `BotController` | Columna `bot_users.human_paused_until`. Gate activo en `processMessage` |
| Despausar (capa de datos) | `domain/ports/index.ts` línea 14 | `setHumanHandoff(tenantId, phoneNumber, pausedUntil: Date \| null)`. **Pasar `null` reactiva el bot.** Solo falta la ruta HTTP |
| Lectura de mensajes | `tenantsRouter.ts` — `GET /tenants/:id/messages?limit=N` | Devuelve `{ messages: MessageRow[] }`, vía `MessagesRepository.tailByTenant()` — **tail plano** ordenado desc por `timestamp`, sin agrupar por `from_phone`. **Frontend no lo consume.** |
| Aviso al dueño | `BotController.ts` ~línea 258 | Envía `output.ownerAlert` a `config.ownerPhone` (viene de `owner_data.whatsapp_dueno`) |
| Palabra de escape global | `FlowInterpreter.ts` línea 87 y 623 | `const ESCAPE_WORDS = ['menu','salir','cancelar','inicio']` + método privado `isEscapeWord()` |
| Validación de grafo (front) | `frontend/src/apps/panel/designer/validation/graphValidator.ts` | Función pura `validateGraph(flow)`. 9 códigos de issue. `canPublish` |
| Validación Meta (back) | `backend/src/domain/validators/flowSchema.ts` (488 líneas) | `FlowSchema` + `FlowNodeSchema` (discriminated union de 13 tipos). Lanza `FlowValidationError` con `issues[]` |

### 2.2. Lo que NO existe (y algún prompt debe crear)

- Ruta HTTP para despausar un `bot_user`.
- Método `listPaused()` en `UserRepository` (para la bandeja de escalaciones).
- Cualquier intercepción de mensajes ENTRANTES del `ownerPhone`. Hoy `ownerPhone` solo se usa de
  salida. Si el dueño le escribe al número del negocio, el bot lo trata como cliente nuevo.
- Agrupación de mensajes por hilo. `MessagesRepository.tailByTenant()` devuelve un **tail plano**
  ordenado desc, no hilos. Agrupar por `fromPhone` es trabajo de frontend.
- Campo `config_bound` en ningún lado.
- Cualquier lógica de horarios. Cero `if` sobre horario en `FlowInterpreter` o `BotController`.
- Funciones `listVersions` / `rollback` en `frontend/src/shared/api/flows.ts`.

### 2.3. Trampas confirmadas

**T1 — Zod hace `strip` por defecto.**
Los schemas de nodo en `flowSchema.ts` (`SendTextNodeSchema` línea 94, `SendButtonsNodeSchema`
línea 106, `SendListNodeSchema` línea 132) son `z.object({...})` **sin** `.strict()` ni
`.passthrough()` (esos dos modificadores sí aparecen en otros nodos del archivo, p.ej. línea 210 y
252, pero no en estos tres). Un campo `config_bound` agregado al JSON sin declararlo en el schema
**sobrevive en `draft_json` (que no se valida) y desaparece silenciosamente al publicar**. Por eso
P3 es un solo PR back+front.

**T2 — El resolver es de una sola pasada.**
`VariableResolver.resolve()` sustituye `{{var}}` una vez. Si `bot_configurations.mensaje_bienvenida`
contiene `{{nombre_negocio}}`, el cliente final ve las llaves literales en su WhatsApp. Por eso P3
prohíbe `{{ }}` dentro de los valores de `bot_configurations`.

**T3 — TTL contradictorio en 4 lugares.**

| Archivo | Línea | Dice |
|---|---|---|
| `backend/src/config/env.ts` | 63 | `.default(120)` ← **el código hace esto** |
| `backend/src/app/controllers/BotController.ts` | 5 | comentario: "Default global 120 min" |
| `backend/src/app/controllers/BotController.ts` | 122 | log: `'Handoff humano activado — bot silenciado 48 h'` ← miente |
| `backend/supabase/migrations/017_human_handoff_pause.sql` | comentario final | "TTL 48h default" ← miente |
| `backend/src/tests/unit/humanHandoff.test.ts` | 7 | docblock: "timestamp 48h futuro" ← miente |

Con D3 (48 h), el fix es: `env.ts` default → `2880`, y corregir el comentario de `BotController.ts:5`.
Los otros tres dejan de mentir solos.

> **Ver hallazgo H1 en la Bitácora (§6):** ya existía una rama que atacaba T3 en la dirección
> contraria a D3 (documentar 120 min en vez de subir a 48h). Se cerró sin mergear. P4 es ahora la
> única fuente de la corrección de T3 — no reabrir ese enfoque alterno.

**T4 — Asimetría de permisos publish/rollback.**
`flowsRouter.ts` línea ~86: `publish` usa `requireTenantScope`.
`flowsRouter.ts` línea ~139: `rollback` usa `requireRole('super_admin')`.
Hoy un `admin_operator` puede empujar a producción pero no deshacerlo. D5 cierra esto.

**T5 — Conflicto de merge previsible.**
`frontend/src/apps/panel/routes/tenants.$id.designer.tsx` tiene **1292 líneas**.
P1 toca el bloque del simulador (línea 466, `<WhatsAppSimulator tenantId={tenantId} compact />`).
P3 toca `NodeInspectorForm` (línea 688). Zonas distintas, pero **P1 debe estar mergeado a `main`
antes de arrancar P3.**

**T6 — La ruta del BotController no es la del doc maestro.**
El archivo real es `backend/src/app/controllers/BotController.ts` (con `/controllers/`).
El documento maestro dice `src/app/`. Los prompts deben usar la ruta real.

### 2.4. Estado de ramas

```
* chore/sync-repo-y-runbook   ← HEAD (v1.0), b14da3e
  feature/sprint-6-new-tenant ← remoto: gone (ya descartada/limpiada, no auto-mergear)
  main
  test/local-validacion       ← sin contraparte remota
  remotes/origin/main
  remotes/origin/chore/sync-repo-y-runbook
```

`fix/migration-017-ttl-comment` existía al escribir v1.0 (local + remota, sin mergear) y se borró
el 2026-08-05 — ver H1 en la Bitácora.

Hay ramas locales sin contraparte remota (`test/local-validacion`).
P0 debe reportar su estado antes de que se apile nada encima.

### 2.5. Campos de `bot_configurations` (migración 001, líneas 112–126)

`numero_whatsapp_asignado`, `nombre_bot`, `tono_bot`, `mensaje_bienvenida`,
`mensaje_menu_principal`, `mensaje_fuera_horario`, `mensaje_no_entendio`,
`mensaje_confirmacion_pedido`.

Variables que el `VariableResolver` mapea a estos campos: `{{welcome_message}}`, `{{menu_message}}`,
`{{out_of_hours_message}}`, `{{not_understood_message}}`, `{{order_confirmation_message}}`,
más `{{nombre_bot}}` y `{{nombre_negocio}}`.

**Uso real en `backend/scripts/cerrajeria-flow.json` (15 nodos):** `{{welcome_message}}` ×1,
`{{menu_message}}` ×1, `{{not_understood_message}}` ×1, `{{nombre_negocio}}` ×4.
Los ~12 textos restantes son literales dentro del JSON.

### 2.6. Nota de releído (v1.1, 2026-08-05)

Se releyó §2 completo contra `main` en vivo (no el ZIP) antes de arrancar P0. Todo coincidió
exacto, incluyendo números de línea, con una sola novedad: la rama `fix/migration-017-ttl-comment`
descrita en H1. Las migraciones viven en `backend/supabase/migrations/` (confirmado vía
`git ls-files`); no hay una copia paralela real en `supabase/migrations/` de la raíz — ese
directorio raíz solo contiene metadata del CLI (`.branches`, `.temp`), sin `.sql`.

---

## 3. Los 9 prompts

### Grafo de dependencias

```
P0 ──┬──→ P1 ──────────────→ P3 ──→ P7
     ├──→ P2                        ↑
     ├──→ P5                        │
     ├──→ P6                        │
     └──→ P4 ──→ P8                 │
                                  (P3 obligatorio)
```

- **P1 antes que P3** (T5, conflicto en `designer.tsx`).
- **P3 antes que P7** (el Guion necesita `config_bound` para la columna de procedencia).
- **P4 antes que P8** (la bandeja necesita el endpoint de despausa).
- **P2, P5, P6** son independientes: se pueden intercalar cuando convenga.

---

### OLEADA 0

#### P0 · `chore/diagnostico-oleada-1`
**Objetivo:** foto exacta del repo y de Cloud. Cero código de producción.
**Toca:** nada (solo lectura + reporte).
**Entrega:** reporte con estado de ramas, confirmación de migración 017 en Cloud, valor real de
`HANDOFF_PAUSE_MINUTES` en `.env` local, cuerpo completo de `FlowNodeBase`, de los 13 schemas de
nodo, del response de `GET /tenants/:id/messages`, y de la firma de `WhatsAppSimulator`.
**Criterio:** el reporte permite escribir P1–P8 sin volver a abrir el repo.

---

### OLEADA 1 — que la UI deje de mentir y el ciclo de edición cierre

#### P1 · `feat/simulador-draft`
**Objetivo:** poder probar el draft sin publicarlo a producción.
**Backend:** CERO cambios. `source: 'draft'` ya está soportado.
**Toca:**
- `frontend/src/shared/api/tenants.ts` — agregar `source?` y `flowId?` a la firma de `simulate()`.
- `frontend/src/shared/simulator/WhatsAppSimulator.tsx` — props nuevas; corregir el docblock que hoy
  afirma que solo simula el activo.
- `frontend/src/apps/panel/routes/tenants.$id.designer.tsx` (línea 466) — pasar `source='draft'` y
  `flowId`; toggle visible **Draft / Publicado**; guardar draft automáticamente antes del primer
  turno si el canvas está sucio.

**Criterios de aceptación:**
1. El simulador del Designer muestra un indicador inequívoco de qué está probando.
2. Editar un texto → guardar draft → simular → se ve el texto nuevo, sin publicar.
3. El simulador standalone (`/simulator/:id`) sigue simulando el ACTIVO (no regresiona).
4. `npm run type-check` y `npm run lint` limpios.

**Por qué primero:** es el prompt más barato del plan y sin él P7 nace inútil.

---

#### P2 · `fix/campos-fantasma`
**Objetivo:** que ningún control de la UI mienta.
**Toca:** `frontend/src/apps/panel/routes/tenants.$id.whatsapp.tsx` (`messagesSchema` y
`BotMessagesCard`).
**Acción (D1 + D2):** quitar `mensaje_fuera_horario` y `mensaje_confirmacion_pedido` del formulario
y del schema Zod del form. **No borrar columnas de BD. No borrarlos del `BotConfigPatch`** — solo
dejan de ser editables desde la UI.
**Criterios:**
1. La pestaña Mensajes solo muestra campos con consumidor real.
2. Guardar mensajes no borra los valores existentes de los campos removidos (verificar el PATCH
   parcial).
3. Comentario en el código explicando por qué se ocultaron y en qué prompt vuelven.

---

#### P3 · `feat/config-bound-gate` — el corazón del plan
**Objetivo:** que "quién gobierna cada texto" sea una regla del sistema, no una convención.
**PR único back+front por T1.**

**Backend:**
- `domain/validators/flowSchema.ts`: agregar `config_bound: z.enum([...]).optional()` a los schemas
  de nodo que tienen texto (`SendTextNodeSchema`, `SendButtonsNodeSchema`, `SendListNodeSchema`).
  **Sin esto Zod lo borra al publicar (T1).**
- `FlowSchema.superRefine`: si un nodo declara `config_bound: 'welcome_message'`, su texto principal
  debe ser exactamente `{{welcome_message}}`. Si no, `ctx.addIssue` → sale como `publishIssues`.
- Enum permitido inicial: `welcome_message`, `menu_message`, `not_understood_message`.
  (`out_of_hours_message` y `order_confirmation_message` quedan fuera por D1/D2.)

**Frontend:**
- `designer/flow-types.ts`: `config_bound?: ConfigBoundKey` en `FlowNodeBase` (línea 37).
- `designer/mapping/to-bot-flow.ts` y `to-react-flow.ts`: preservar el campo en el round-trip.
- `NodeInspectorForm`: si hay `config_bound`, el campo de texto va read-only con candado + link a
  la pestaña Mensajes.
- `validation/graphValidator.ts`: código de issue nuevo `config_bound_mismatch` para verlo antes
  del round-trip.
- `routes/tenants.$id.whatsapp.tsx`: el `messagesSchema` rechaza `{{` en los valores (T2).

**Datos:**
- Marcar los 3 nodos correspondientes en `backend/scripts/cerrajeria-flow.json`.
- Re-sembrar con `backend/scripts/persist-flow.ts` o `seed-cerrajerias.ts`.

**Criterios:**
1. Publicar un flow con `config_bound` y texto literal → **falla** con issue legible en el panel.
2. Publicar el mismo flow con la variable correcta → pasa, y `config_bound` **sobrevive** en el JSON
   publicado (verificar leyendo la fila de `bot_flow_versions`).
3. Escribir `{{nombre_negocio}}` en el mensaje de bienvenida desde el panel → error de validación.
4. El inspector muestra candado en los 3 nodos marcados de CerraCruz.

---

### OLEADA 2 — control operativo

#### P4 · `feat/handoff-control`
**Objetivo:** que el handoff se pueda cerrar sin esperar 48 h y sin panel.
**Toca:**
- `backend/src/config/env.ts` línea 63: default `120` → `2880` (D3).
- `backend/src/app/controllers/BotController.ts` línea 5: corregir comentario a 48 h.
- `backend/supabase/migrations/017_human_handoff_pause.sql`: corregir el comentario final de la
  columna a la versión definitiva post-D3 (**este PR es la única corrección de T3 — ver H1**, no
  hay rama previa que resolver ni con la que hacer merge).
- `BotController.processMessage`: gate del `ownerPhone` **antes** de `findActiveByTenant`. Match
  exacto contra `['#listo','#reanudar']`, simétrico a `isEscapeWord` (`FlowInterpreter.ts:623`).
  Cualquier otro mensaje del dueño sigue al flow normal (D4).
- Ruta nueva en `tenantsRouter.ts` (o sub-router) para despausar: llama a
  `setHumanHandoff(tenantId, phone, null)`. Registrar en `audit_log` (regla operativa 14).
- `escape_to_human`: enriquecer `owner_alert` — link `wa.me` clickeable con el teléfono del cliente,
  lo capturado en el `wait_input` previo, y la hora.

**Punto abierto a resolver DENTRO de este prompt:** si hay más de una conversación pausada a la vez,
`#listo` a secas es ambiguo. Opciones a evaluar en Fase 0 del prompt: (a) `#listo` despausa la más
reciente; (b) el `owner_alert` incluye un código corto y el comando es `#listo AB12`. Claude Code
debe reportar cuál conviene antes de implementar.

**Criterios:**
1. Un `bot_user` pausado se reactiva con `#listo` del `ownerPhone` en < 5 s.
2. El dueño escribiendo "hola" al número del negocio **sí** recibe el bot (no se rompe el
   auto-testeo).
3. La despausa queda en `admin_audit_log`.
4. Test unitario nuevo en `humanHandoff.test.ts` para el gate del owner.
5. Los 4 lugares del TTL dicen lo mismo (env.ts, comentario de BotController, log de BotController,
   comentario de la migración 017, docblock del test).

---

#### P5 · `feat/vista-conversaciones`
**Objetivo:** ver qué dijo el bot de verdad.
**Backend:** cero cambios (endpoint existe).
**Toca:** `frontend/src/shared/api/tenants.ts` (fn + tipo `MessageRow`), hook nuevo, ruta nueva bajo
el tenant o sub-pestaña de WhatsApp.
**Nota anti-alucinación:** `tailByTenant` devuelve un **tail plano** ordenado desc. Agrupar por
`fromPhone` para construir hilos es trabajo de frontend. No inventar un endpoint de hilos.
**Criterios:**
1. Lista de hilos por teléfono + detalle cronológico.
2. Marca visual en mensajes recibidos mientras el usuario estaba pausado.
3. Paginación por `limit` (clamp backend [1,200]).

---

#### P6 · `feat/versiones-rollback-ui`
**Objetivo:** deshacer. Sube de prioridad porque P7 le da edición de texto a más gente.
**Backend:** cero cambios.
**Toca:** `frontend/src/shared/api/flows.ts` (+`listVersions`, +`rollbackToVersion`), hooks, y un
dropdown en el Designer.
**Criterios:**
1. Lista de versiones con número, fecha, autor y nota.
2. "Restaurar como draft" carga la versión al canvas sin publicar.
3. El botón de rollback solo aparece para `super_admin` (el backend ya lo exige; la UI no debe
   ofrecer algo que va a dar 403).

---

#### P7 · `feat/guion-textos` — depende de P3
**Objetivo:** editar todo lo que dice el bot desde una tabla, no desde un canvas.
**Toca:** ruta nueva bajo el tenant. Lee el draft vía `getDraft()`, escribe vía `saveDraft()`.
**Reglas duras:**
- Escribe **solo sobre el draft** (D6). Nunca llama a `publish`.
- Concurrencia optimista con `bot_flows.draft_updated_at` (ya existe, migración 015): si cambió
  desde que se cargó, error "este flujo cambió, recarga" en vez de last-write-wins.
- Columna de procedencia (config vs flow) derivada de `config_bound` — sin heurística.
- Buscador sobre todos los textos.
**Criterios:**
1. Editar 5 textos, guardar una vez, simular contra draft (P1) y verlos.
2. Dos pestañas abiertas: la segunda en guardar recibe el error de conflicto, no pisa.
3. Los textos con `config_bound` aparecen read-only con link a Mensajes.

---

#### P8 · `feat/bandeja-escalaciones` — depende de P4
**Objetivo:** supervisión interna de SegurITech. **No es una herramienta del dueño** (ADR-001).
**Toca:** `listPaused()` nuevo en `UserRepository` + implementación Supabase + endpoint + UI.
**Criterios:**
1. Lista de `bot_users` con `human_paused_until` futuro, con tenant, teléfono y desde cuándo.
2. Botón reanudar (reusa el endpoint de P4).
3. Respeta `requireTenantScope` — un `admin_operator` solo ve lo suyo.

---

## 4. Fuera de alcance de este plan (Oleada 3)

No se toca hasta que CerraCruz esté respondiendo en vivo:

- Horarios reales (`out_of_hours_message` vuelve a la UI aquí).
- CRUD de catálogo admin (`catalog_items`).
- Test cases del designer (ADR-013).
- Rediseño de densidad del panel: columnas WEBHOOK/MOLDE del dashboard, unificar los dos ejes de
  estado (tenant FSM vs bot status), eliminar la pestaña "Resumen" redundante, colapsar el card de
  Messenger "Próximamente".

---

## 5. Reglas que todo prompt debe repetir

Copiar textualmente en cada `.md`:

1. `domain/` NUNCA importa de `infrastructure/` ni de `application/`.
2. `npm install` SOLO desde la raíz del monorepo, con `--workspace`.
3. NO leer `.env`. Solo `.env.example` es seguro de leer.
4. NO correr `supabase db reset` contra Cloud. Migraciones en orden vía SQL Editor.
5. `CREATE POLICY IF NOT EXISTS` no existe en PostgreSQL → `DROP POLICY IF EXISTS` + `CREATE POLICY`.
6. Toda mutación admin nueva se registra en `admin_audit_log`.
7. Todas las llamadas del frontend van por `apiFetch`. Nunca directo a Supabase.
8. Solo tokens shadcn en componentes del panel. Sin utilidades Tailwind de color hardcodeadas.
9. TanStack Router con `.lazy()` para code splitting, no `React.lazy()`.
10. Meta API pinneada en **v23.0**.
11. Conventional commits por scope.
12. Presupuesto de bundle: chunk inicial bajo 90 KB gzip.

---

## 6. Bitácora

| Fecha | Cambio |
|---|---|
| 2026-08-05 | Plan creado (v1.0). D3–D6 congeladas por Cris; D1–D2 asumidas pendientes de confirmar. Sección 2 verificada contra ZIP `seguritech-bot-proprueba`. |
| 2026-08-05 | **H1 — Hallazgo de pre-vuelo (v1.1).** Antes de correr P0, se releyó §2 contra `main` en vivo. Todo coincidió exacto (incluidos números de línea de T3/T4/T5), con una excepción: existía la rama `fix/migration-017-ttl-comment` (local + `origin`, commit `d67dec1`, no mergeada a `main`), que atacaba la misma mentira de T3 pero en dirección **opuesta** a D3 — reescribía el comentario de la migración 017 para decir "120 min" (la verdad de hoy) en vez de subir el código a 48h (la decisión ya congelada). Mergearla tal cual habría producido un comentario correcto por horas y luego vuelto a mentir en cuanto P4 aterrizara, o un conflicto de merge en esa misma línea. **Resolución:** rama borrada (local + remota) sin mergear. P4 queda como la única corrección de T3, escribiendo directamente el estado final post-D3 en los 4 lugares. No reabrir el enfoque de esa rama. |

---
