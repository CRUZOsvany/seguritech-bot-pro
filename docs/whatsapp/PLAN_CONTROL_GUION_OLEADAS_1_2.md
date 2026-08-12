# PLAN MAESTRO — Oleadas 1 y 2 (Control del Guion del Bot)

> **Versión:** 1.4 — Agosto 2026
> **Autor:** Cris + Claude (chat de arquitectura)
> **Consumidor:** Claude Code (IntelliJ, Claude Max/Opus, WSL2)
> **Regla:** 1 prompt = 1 rama = 1 PR = merge a `main` antes de apilar el siguiente.
> **Estado del repo al momento de escribir (v1.0):** rama activa `chore/sync-repo-y-runbook`, HEAD `b14da3e`.
> **Estado de ejecución (v1.4):** P0 cubierto ad-hoc en la misma conversación (sin branch propia —
> ver Bitácora). **P1, P2, P3 y P4 mergeados a `main`.** **P5 implementado y pusheado
> (`feat/vista-conversaciones`), PR abierto, pendiente de merge.** P6–P8 sin empezar.

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

#### P0 · `chore/diagnostico-oleada-1` — ✅ cubierto (sin branch propia, ver Bitácora)
**Objetivo:** foto exacta del repo y de Cloud. Cero código de producción.
**Toca:** nada (solo lectura + reporte).
**Entrega:** reporte con estado de ramas, confirmación de migración 017 en Cloud, valor real de
`HANDOFF_PAUSE_MINUTES` en `.env` local, cuerpo completo de `FlowNodeBase`, de los 13 schemas de
nodo, del response de `GET /tenants/:id/messages`, y de la firma de `WhatsAppSimulator`.
**Criterio:** el reporte permite escribir P1–P8 sin volver a abrir el repo.

---

### OLEADA 1 — que la UI deje de mentir y el ciclo de edición cierre

#### P1 · `feat/simulador-draft` — ✅ MERGEADO (PR #43)
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

#### P2 · `fix/campos-fantasma` — ✅ MERGEADO (PR #44)
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

#### P3 · `feat/config-bound-gate` — el corazón del plan — ✅ MERGEADO (PR #45)
**Objetivo:** que "quién gobierna cada texto" sea una regla del sistema, no una convención.
**PR único back+front por T1, como estaba previsto.**

> **Ver H2 en la Bitácora:** la especificación original de esta sección (config_bound como enum de
> valor único, "3 nodos") no sobrevivió el contacto con los datos reales y se corrigió durante la
> implementación. El texto de abajo YA refleja lo implementado, no el plan original.

**Backend:**
- `domain/entities/flow.ts`: `CONFIG_BOUND_VALUES` (fuente única) + `config_bound?: ConfigBoundKey[]`
  en `FlowNodeBase`. **Es ARRAY, no un enum de valor único** — el nodo real `bienvenida` combina DOS
  variables en un solo mensaje (`"{{welcome_message}}\n\n{{menu_message}}"`), algo que un valor único
  no puede expresar.
- `domain/validators/flowSchema.ts`: `config_bound` agregado a `SendTextNodeSchema`,
  `SendButtonsNodeSchema`, `SendListNodeSchema` (importando `CONFIG_BOUND_VALUES` de `entities/flow.ts`).
  **Sin esto Zod lo borra al publicar (T1) — confirmado con test.**
- `FlowSchema.superRefine`: si un nodo declara `config_bound`, su `content.text` debe consistir
  **EXCLUSIVAMENTE** en los placeholders `{{key}}` de las claves declaradas (más espacios en blanco) —
  ni texto literal mezclado, ni variables no declaradas, ni faltantes. `ctx.addIssue` con mensaje que
  detalla exactamente qué falta/sobra.
- Enum permitido: `welcome_message`, `menu_message`, `not_understood_message`.
  (`out_of_hours_message` y `order_confirmation_message` quedan fuera por D1/D2.)
- 7 tests nuevos en `flowSchema.configBound.test.ts` (positivos, negativos, el caso real combinado).

**Frontend:**
- `designer/flow-types.ts`: espejo de `CONFIG_BOUND_VALUES`/`ConfigBoundKey` + `CONFIG_BOUND_LABELS`
  para la UI.
- `designer/mapping/to-bot-flow.ts` y `to-react-flow.ts`: **NO hizo falta tocarlos.** El round-trip ya
  preserva cualquier campo top-level del nodo vía spread (`{...original}` en `designer-store.ts` y en
  `graphToBotFlow`), así que `config_bound` sobrevive gratis sin cambio de código.
- `NodeInspectorForm`: si hay `config_bound`, el campo "Texto" va read-only (candado + link a
  Mensajes) en los 3 tipos de nodo que lo soportan. Requirió threadear `tenantId` a través de
  `Inspector` (antes no lo recibía).
- `validation/graphValidator.ts`: código de issue nuevo `config_bound_mismatch`, mismo chequeo que el
  backend, en vivo antes del round-trip.
- `routes/tenants.$id.whatsapp.tsx`: el `messagesSchema` rechaza `{{` en los 3 valores (T2) — y de
  paso se corrigió que `BotMessagesCard` ni siquiera desestructuraba `formState`, así que los errores
  de validación no se veían en ningún campo del formulario.

**Datos:**
- Marcados en `backend/scripts/cerrajeria-flow.json`: **`bienvenida`** →
  `config_bound: ["welcome_message", "menu_message"]`, **`no_entendi`** →
  `config_bound: ["not_understood_message"]`. **Son 2 nodos, no 3** — el flow real de CerraCruz solo
  tiene 2 nodos con variables canónicas (`welcome_message` y `menu_message` viven juntos en el nodo
  `bienvenida`).
- Verificado con `validateFlow()` corrido directo contra el JSON real: pasa en verde; y el caso
  negativo (texto literal mezclado) se rechaza con el mensaje esperado.
- **Re-seed contra Cloud (`seed-cerrajerias.ts`) queda PENDIENTE** — requiere
  `SUPABASE_SERVICE_ROLE_KEY` + PII (WhatsApp del dueño) que Claude no corre sin confirmación
  explícita de Cris, por ser una mutación de producción difícil de revertir.

**Criterios:**
1. Publicar un flow con `config_bound` y texto literal → **falla** con issue legible en el panel. ✅
   verificado (script ad-hoc + test).
2. Publicar el mismo flow con la variable correcta → pasa, y `config_bound` **sobrevive** en el JSON
   publicado. ✅ verificado a nivel `validateFlow()`; falta el verificado end-to-end contra
   `bot_flow_versions` en Cloud, que requiere el re-seed pendiente arriba.
3. Escribir `{{nombre_negocio}}` en el mensaje de bienvenida **desde la pestaña Mensajes** (no desde
   el Designer — ese campo queda read-only) → error de validación visible. ✅
4. El inspector muestra candado en los 2 nodos marcados de CerraCruz. ✅ (criterio original decía "3
   nodos"; ver corrección arriba).

---

### OLEADA 2 — control operativo

#### P4 · `feat/handoff-control` — ✅ MERGEADO (PR #46)
**Objetivo:** que el handoff se pueda cerrar sin esperar 48 h y sin panel.

**Ambigüedad resuelta (ver Bitácora):** opción **(c)**, ninguna de las dos que planteaba el punto
abierto original. Hay dos casos, no uno:
- **0 o 1 conversación pausada:** `#listo` a secas resuelve sola, sin pedir nada — cubre el caso
  común de un negocio chico sin fricción.
- **2+ pausadas simultáneas:** `#listo` a secas lista las pausadas con los **últimos 4 dígitos** de
  cada teléfono (no un código random — no hay que inventar ni guardar nada nuevo) y pide
  `#listo <4 dígitos>` para desambiguar. Elegí esto sobre "reanuda la más reciente" (opción a del
  punto abierto) porque esa opción puede reanudar silenciosamente al cliente equivocado mientras el
  urgente sigue pausado — riesgo real para un negocio de cerrajería con emergencias.

**Implementado:**
- `env.ts` línea 63: default `120` → `2880` (D3). ⚠️ **Ver H3 en la Bitácora — esto NO cambia el
  comportamiento en ningún entorno que ya tenga `HANDOFF_PAUSE_MINUTES` seteado explícito** (como
  esta máquina de desarrollo).
- `BotController.ts` línea 5 y comentario de la migración 017: alineados al estado final (T3 cerrado
  en los 4 lugares que quedaban vivos en código/docs — Cloud es aparte, ver H3).
- `BotController.processMessage`: gate del `ownerPhone` antes de cargar el flow (`findActiveByTenant`
  ni se llama cuando el comando se resuelve). Match exacto case-insensitive contra
  `#listo`/`#reanudar`, con o sin código de 4 dígitos. Cualquier otro mensaje del dueño sigue de
  largo al `FlowInterpreter` (D4 intacto, con test que lo prueba).
- `domain/ports`: `UserRepository.listPaused()` (P4 la necesitaba ya, P8 la reusa tal cual — sin
  cambios) + `AuditPort`, puerto mínimo para que `BotController` audite sin importar
  `AuditLogService` (infra) directo — mismo criterio de capas que `domain/`. `Bootstrap.ts` adapta
  `AuditLogService` a `AuditPort`.
- `escape_to_human`: `owner_alert` se enriquece en `BotController` (no en cada molde) con link
  `wa.me` al cliente, hora, y el código de 4 dígitos para el `#listo` correspondiente.
- Ruta nueva `POST /api/admin/tenants/:id/human-handoff/resume` (`requireTenantScope`, audita vía
  `ctx(req)`) — misma operación que el comando de WhatsApp, para cuando P8 tenga botón "Reanudar" en
  el panel.

**Criterios:**
1. Un `bot_user` pausado se reactiva con `#listo` del `ownerPhone` en < 5 s. ✅
2. El dueño escribiendo "hola" al número del negocio **sí** recibe el bot. ✅ (test dedicado)
3. La despausa queda auditada — vía `AuditPort` si es por WhatsApp, vía `admin_audit_log`/`ctx(req)`
   si es por el endpoint del panel. ✅
4. Test unitario nuevo en `humanHandoff.test.ts` para el gate del owner. ✅ — 8 tests nuevos (sin
   comando, 1 pausado, 2+ con/sin código, código sin match, case-insensitive).
5. Los lugares del TTL dicen lo mismo **en código** — env.ts, comentario de BotController, log de
   BotController, comentario de la migración 017. El docblock de `humanHandoff.test.ts` que decía
   "48h" ya no hace falta forzarlo: ahora es cierto por default. **No** incluí un test que assertara
   el valor `2880` literal — ver H3, se descartó a propósito porque rompe en cualquier entorno con
   override de `.env` (exactamente lo que tiene esta máquina).

---

#### P5 · `feat/vista-conversaciones` — ✅ IMPLEMENTADO, PR abierto (sin merge)
**Objetivo:** ver qué dijo el bot de verdad.

> **Ver H4 en la Bitácora:** "backend cero cambios" no sobrevivió el criterio 2 — hubo que agregar
> un endpoint mínimo de solo lectura. El texto de abajo ya refleja lo implementado.

**Backend:** un endpoint nuevo, no cero. `GET /tenants/:id/human-handoff/paused` (solo lectura,
`requireTenantScope`) expone `listPaused()` (ya construido en P4) para que el frontend sepa qué
teléfonos están pausados AHORA — sin este dato, el criterio 2 (marca visual de pausa) no tenía forma
honesta de implementarse, porque no existía ningún endpoint que expusiera ese estado.

**Toca:**
- `frontend/src/shared/api/tenants.ts` — `MessageRow`, `getMessages()`, `PausedPhone`,
  `getPausedPhones()`, `resumeHandoff()`.
- `hooks/use-messages.ts` (nuevo) y `hooks/use-paused-phones.ts` (nuevo).
- `routes/tenants.$id.messages.tsx` (nuevo) — ruta dedicada (no sub-pestaña de WhatsApp, para dejarle
  espacio propio a la vista de dos columnas), enlazada desde el botón "Ver conversaciones" en la
  pestaña Resumen de `tenants.$id.whatsapp.tsx`.
- `router.tsx` — registro de la ruta nueva.

**Nota anti-alucinación (confirmada en la implementación):** `tailByTenant` sí devuelve un **tail
plano** ordenado desc. Agrupar por `fromPhone` para construir hilos es trabajo de frontend
(`use-messages.ts`), tal como decía el plan. **No** se inventó ningún endpoint de hilos — eso sigue
siendo cierto.

**Criterios:**
1. Lista de hilos por teléfono + detalle cronológico. ✅ — hilos ordenados por mensaje más reciente,
   detalle interno ordenado cronológico ascendente, estilo burbujas de chat.
2. Marca visual en mensajes recibidos mientras el usuario estaba pausado. ✅ pero con un heurístico
   honesto, no histórico exacto: `human_paused_until` es un valor puntual (no hay bitácora de
   "cuándo empezó cada pausa"), así que un mensaje inbound se marca si el teléfono está pausado
   **ahora** y no hay ningún mensaje outbound después de él en el hilo — "el bot nunca contestó
   esto". Reconstruir el pasado exacto no es posible sin cambiar el schema de `messages` para
   registrar el estado de pausa en cada fila (fuera de alcance de P5).
3. Paginación por `limit` (clamp backend [1,200]). ⚠️ Interpretado como selector de cuánta historia
   traer (50/100/200), NO como paginación real con cursor/página. El endpoint no soporta
   offset/`before`/cursor — solo un `limit` sobre el tail completo del tenant. Dar "página 2" de
   forma honesta requeriría un cambio de backend fuera del alcance declarado ("backend cero
   cambios" — con la única excepción ya documentada arriba).

**Bono no pedido:** botón "Reanudar" en el detalle de un hilo pausado, que reusa el endpoint
`POST .../human-handoff/resume` de P4. No es la bandeja completa de P8 (no lista pausados
cross-tenant ni es la vista de supervisión), pero le da uso real al endpoint sin esperar esa oleada.

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
| 2026-08-05 | **P0 cubierto sin branch propia.** El diagnóstico de código (rutas, líneas, contratos) ya se había hecho a mano en la conversación antes de escribir este plan; solo faltaba salud de build (type-check/lint/test), que se corrió directo sobre `main` — 0 errores, 96 warnings preexistentes. Lo único de P0 que sigue **NO VERIFICADO** es Cloud (columnas de mig. 015/017, tabla `bot_flow_versions`) — requiere que Cris corra el SQL en Supabase; no se creó `docs/DIAGNOSTICO_OLEADA_1.md` formal. **P1 y P2 implementados, mergeados a `main`** (PR #43 y #44) sin desvíos del plan. |
| 2026-08-05 | **H2 — La especificación de P3 no sobrevivió el contacto con los datos reales.** Al implementar, dos supuestos del plan original resultaron falsos: (1) el plan asumía `config_bound` como enum de **valor único** por nodo ("si un nodo declara `config_bound: 'welcome_message'`, su texto debe ser exactamente `{{welcome_message}}`"), pero el nodo real `bienvenida` de CerraCruz combina **welcome_message + menu_message en un solo mensaje** (`"{{welcome_message}}\n\n{{menu_message}}"`) — un valor único no puede expresar eso. Se corrigió a `config_bound?: ConfigBoundKey[]` (array), con la regla de que el texto debe consistir EXCLUSIVAMENTE en los placeholders de las claves declaradas (verificado con test positivo y negativo, y con `validateFlow()` corrido contra el JSON real). (2) el plan decía "marcar los 3 nodos correspondientes", asumiendo 1 nodo por variable canónica — pero como welcome_message y menu_message viven en el MISMO nodo, en realidad son **2 nodos** (`bienvenida`, `no_entendi`), no 3. Corregido en la sección de P3 y en su criterio 4. Bono no previsto: `to-bot-flow.ts`/`to-react-flow.ts` no necesitaron ningún cambio — el round-trip ya preservaba campos top-level de nodo por spread, así que `config_bound` sobrevive gratis. Y se encontró que `BotMessagesCard` nunca desestructuraba `formState`, así que los errores de Zod (incluyendo el nuevo de T2) no se mostraban en ningún campo — se corrigió de paso. Re-seed contra Cloud (`seed-cerrajerias.ts`) queda pendiente de que Cris lo corra — requiere `SUPABASE_SERVICE_ROLE_KEY` y PII, mutación de producción que Claude no ejecuta sin confirmación explícita. |
| 2026-08-05 | **P3 mergeado a `main`** (PR #45), sin más novedad que H2. |
| 2026-08-05 | **H3 — Dos hallazgos al implementar P4.** (1) **`.env` local ya trae `HANDOFF_PAUSE_MINUTES=120` explícito.** El default del schema Zod en `env.ts` solo aplica cuando la env var está AUSENTE; subir el default a 2880 en el código **no cambia nada** en ningún entorno (esta máquina, y probablemente Cloud/producción si también lo tiene seteado) que ya defina la variable a mano. D3 solo toma efecto de verdad si Cris actualiza el valor real de `HANDOFF_PAUSE_MINUTES` donde esté desplegado — el cambio de código por sí solo es necesario pero no suficiente. Nadie leyó el contenido del `.env` para descubrir esto (prohibido por regla operativa 3): se infirió de que un test que esperaba `2880` recibió `120`. (2) **Se descartó un test propio por el mismo motivo** — había escrito `expect(config.bot.handoffPauseMinutes).toBe(2880)`, que falló exactamente por (1). El patrón ya establecido en `humanHandoff.test.ts` (comentario preexistente: "El timestamp debe ser approximately now + HANDOFF_TTL — leído del config, no hardcodeado") evita a propósito hardcodear ese número; se corrigió el test propio para seguir el mismo patrón, eliminando la aserción del literal. **Además:** la ambigüedad de `#listo` con 2+ pausados que el plan dejaba abierta para P4 se resolvió con últimos-4-dígitos del teléfono como código de desambiguación — ni "reanuda el más reciente" (arriesgado: puede reanudar al cliente equivocado) ni un código nuevo que hubiera requerido columna/estado adicional. Ver sección de P4 arriba para el detalle completo. |
| 2026-08-05 | **P4 mergeado a `main`** (PR #46), sin más novedad que H3. |
| 2026-08-05 | **H4 — "Backend cero cambios" de P5 no sobrevivió el criterio 2.** El plan asumía que la vista de conversaciones era 100% frontend porque el endpoint de mensajes ya existía — cierto para el criterio 1 (lista + detalle), pero el criterio 2 ("marca visual en mensajes recibidos mientras el usuario estaba pausado") necesita saber qué teléfonos están pausados AHORA, y ese dato nunca se expuso vía HTTP — el plan lo reservaba para el endpoint de listado de P8, que todavía no existía. En vez de fabricar una marca falsa o saltarme el criterio, se agregó un endpoint mínimo de solo lectura (`GET /tenants/:id/human-handoff/paused`) que envuelve `listPaused()` — cero lógica nueva, ese método ya se había construido en P4. P8 puede reusarlo tal cual para su bandeja completa; este endpoint no la reemplaza, solo expone el dato mínimo que P5 necesitaba. Con ese dato, el "marcado de pausa" usa un heurístico honesto (no una reconstrucción histórica exacta, que los datos no permiten): un inbound se marca si el teléfono está pausado ahora y ningún outbound le siguió en el hilo — "el bot nunca contestó esto". El criterio 3 (paginación) también se reinterpretó: el endpoint no soporta cursor/offset, así que se implementó como selector de cuánta historia traer (50/100/200) en vez de páginas reales — dar "página 2" de forma honesta requeriría otro cambio de backend. Bono no pedido: botón "Reanudar" en el hilo, reusando el POST de P4 sin esperar a P8. |

---
