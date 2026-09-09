# Catálogo de reglas del motor de flows

> **Fecha:** 2026-09-08 · **Derivado del código, no de un diseño previo.**
>
> Este catálogo no inventa reglas: **transcribe las que hoy se aplican de
> verdad**, con `archivo:línea`. Nace del hallazgo #4 de
> `AUDITORIA_DUPLICACION_PANEL.md` — hay validación repartida en cuatro capas
> que nadie había puesto una al lado de la otra, y **ninguna es superconjunto
> de las demás**.
>
> Si aparece un documento previo con una numeración `R-F1…R-F10` distinta, se
> reconcilia contra éste: aquí manda el código.

---

## Las cuatro capas

| # | Capa | Cuándo corre | Qué pasa si falla |
|---|---|---|---|
| **L1** | `graphValidator.ts` (frontend) | En vivo, mientras editas el canvas | Badge de problemas; bloquea el botón Publicar si hay `error` |
| **L2** | `FlowSchema` / Zod (backend) | Solo al **publicar** | 400 con el detalle |
| **L3** | Guardrails fuera de Zod (backend) | Solo al publicar | Error específico |
| **L4** | `CHECK` de Postgres | En cada escritura de la fila | Error de BD |

**Hueco importante:** `PUT .../draft` guarda **sin validar nada**
(`flowsRouter.ts:59`). Un draft puede quedar en cualquier estado; solo se
comprueba al publicar. Eso es deliberado (permite guardar trabajo a medias),
pero significa que L1 es la única red mientras diseñas, y L1 no sabe nada de
los límites de Meta.

---

## Estructura del grafo

| Regla | Qué exige | L1 | L2 | Severidad | Evidencia |
|---|---|---|---|---|---|
| **R-F01** | `start_node_id` no vacío | ✅ `start_missing` | ✅ `min(1)` | error | `graphValidator.ts:59-65` |
| **R-F02** | `start_node_id` resuelve a un nodo existente | ✅ `start_unresolved` | ✅ superRefine | error | `graphValidator.ts:66-71` |
| **R-F03** | Ids de nodo únicos en el flow | ❌ | ✅ | error | `flowSchema.ts` superRefine |
| **R-F04** | Toda transición tiene `next_node_id` no vacío | ✅ `dangling_transition` | ✅ `min(1)` | error | `graphValidator.ts:75-82` |
| **R-F05** | Toda transición apunta a un nodo existente | ✅ `transition_to_missing` | ✅ superRefine | error | `graphValidator.ts:83-90` |
| **R-F06** | Existe al menos un nodo `end` | ❌ (ver R-F07) | ✅ | error | `flowSchema.ts` superRefine |
| **R-F07** | Existe un `end` **alcanzable desde el inicio** | ✅ `no_end_reachable` | ❌ | error | `graphValidator.ts:167-176` |
| **R-F08** | El flow tiene al menos un nodo | ❌ | ✅ `nodes.min(1)` | error | `flowSchema.ts` |
| **R-F09** | `version` es exactamente `'1.0'` | ❌ | ✅ `z.literal` | error | `flowSchema.ts` |
| **R-F10** | Un nodo `end` no tiene transiciones | ❌ | ✅ `max(0)` | error | `flowSchema.ts:249` |
| **R-F11** | Ningún nodo inalcanzable desde el inicio | ✅ `unreachable_node` | ❌ | **warning** | `graphValidator.ts:157-165` |
| **R-F12** | Un nodo no-`end` alcanzable tiene salidas | ✅ `node_no_transitions` | ❌ | **warning** | `graphValidator.ts:179-189` |
| **R-F13** | Sin ciclos sin salida en el grafo | ✅ `cycle_detected` | ❌ | **warning** | `graphValidator.ts:192-236` |
| **R-F14** | Sin dos transiciones con la misma condición en un nodo | ✅ `duplicate_condition` | ❌ | **warning** | `graphValidator.ts:93-135` |

---

## Límites de Meta por tipo de nodo

**Ninguna de estas la comprueba el frontend.** Su propio docstring lo dice:
*"NO valida límites Meta (títulos, longitudes, conteos) — eso es del backend"*
(`graphValidator.ts:14`). Todas son **L2, error**.

| Regla | Nodo | Qué exige |
|---|---|---|
| **R-F15** | `send_text` | `text` 1..4096 chars (recomendado ≤1024) |
| **R-F16** | `send_buttons` | `text` ≤1024 · **1..3 botones** · `title` de botón ≤20 |
| **R-F17** | `send_list` | `text` ≤1024 · `button_label` ≤20 · **1..10 secciones** · título de sección ≤24 · título de item ≤24 · `description` ≤72 |
| **R-F18** | `send_list` | **≤10 items estáticos sumando todas las secciones** (cross-node, en `FlowSchema.superRefine`) |
| **R-F19** | `send_media` imagen | `caption` ≤1024 |
| **R-F20** | `send_media` ubicación | `latitude` −90..90 · `longitude` −180..180 · `name`/`address` ≤1000 |
| **R-F21** | `send_media` documento | `filename` 1..240 · `caption` ≤1024 |
| **R-F22** | `send_cta_url` | header text ≤60 · `body` ≤1024 · `footer` ≤60 · `display_text` ≤20 |
| **R-F23** | `send_location_request` | `body` ≤1024 y **`.strict()`**: Meta no permite header ni footer, se rechazan claves extra |
| **R-F24** | `send_media_carousel` | **1..10 cards** · `body` ≤1024 · **1..2 botones por card** · `quick_reply.id` ≤256, `title` ≤20 · `cta_url.display_text` ≤20 |
| **R-F25** | `send_media_carousel` | **Todas las cards usan el mismo tipo de botón** (cross-card, en `FlowNodeSchema.superRefine`) |
| **R-F26** | `send_reaction` | `emoji` ≤16 chars UTF-16 y cluster Unicode válido (o `''` para deshacer) · `target` literal |
| **R-F27** | `request_call_permission` | `body` ≤1024 · `footer` ≤60 |
| **R-F28** | `send_whatsapp_flow` | `header`/`footer` ≤60 · `body` ≤1024 · `flow_cta` ≤20 · `whatsapp_flow_id` UUID · `mode` ∈ {draft, published} |
| **R-F29** | `search_catalog` | `prompt` ≤4096 |
| **R-F30** | Todos los links | **`https://` obligatorio**, ≤2000 chars (`httpsUrlSchema`, `flowSchema.ts:27-31`) |

---

## Coherencia de contenido

| Regla | Qué exige | L1 | L2 | Severidad |
|---|---|---|---|---|
| **R-F31** | Un nodo con `config_bound` tiene texto **exclusivamente** los placeholders declarados: sin variables de más, sin faltar ninguna, sin texto literal suelto | ✅ `config_bound_mismatch` | ✅ | error |

Es la **única regla implementada dos veces con la misma semántica**, en dos
lenguajes. `graphValidator.ts:242-272` y `FlowSchema.superRefine` hacen el
mismo regex y el mismo cálculo de `missing`/`extra`/`hasLiteralText`. Es el
candidato número uno para el paquete compartido.

---

## Guardrails de publicación

| Regla | Qué exige | Capa | Evidencia |
|---|---|---|---|
| **R-F32** | Un tenant de giro restringido (`medico`, `farmacia`) no puede publicar un flow que exponga `catalog_items` si su catálogo tiene categorías de medicamento controlado o con receta | L3 | `SupabaseBotFlowRepository.enforceRestrictedGiroGuardrail` (DEC-12) |
| **R-F33** | No se puede publicar un flow sin draft guardado | L3 | `publishDraft` |
| **R-F34** | `json_definition` es un objeto JSON con las claves `version`, `start_node_id` y `nodes` | L4 | `002_bot_flows_engine.sql:70-77` |

---

## La brecha, que es el hallazgo #4

Ninguna capa contiene a la otra. En concreto:

**Se puede publicar lo que el canvas aprobó.** El canvas no mira ni un solo
límite de Meta (R-F15…R-F30). Un `send_buttons` con 5 botones o un título de
30 chars pasa el validador en vivo con 0 errores y revienta al publicar.

**Se puede aprobar en el canvas lo que el backend rechaza — y al revés.**
R-F06 (backend) pide que exista un `end`; R-F07 (frontend) pide que sea
**alcanzable**. Un flow con un `end` huérfano publica sin problema pero el
canvas lo marca en rojo. Y R-F03 (ids únicos) solo la ve el backend: el canvas
deja duplicar un id sin decir nada.

**Cuatro reglas son solo advertencia y solo en el frontend.** R-F11 a R-F14 no
existen en el backend, así que un flow con nodos huérfanos, callejones sin
salida, ciclos o condiciones duplicadas publica sin que nadie lo mencione. Y
como `PUT draft` no valida, tampoco hay registro de que ocurrió.

**Cinco reglas estructurales viven solo en el backend** (R-F03, R-F06, R-F08,
R-F09, R-F10) y solo se enteran al publicar, después del round-trip.

### Recuento

| | Solo L1 | Solo L2 | En ambas |
|---|---|---|---|
| Estructura | 4 (todas warning) | 5 | 4 |
| Límites Meta | 0 | 16 | 0 |
| Contenido | 0 | 0 | 1 (duplicada) |

---

## Qué hacer con esto

Tres cosas, en orden de valor:

1. **Un paquete compartido**, consumido por los dos workspaces. Hoy no hay
   ruta de tipos compartida entre `backend/` y `frontend/` — por eso
   `flow-types.ts` es un espejo copiado a mano (DEC-3) que ya está
   desincronizado. Resolver eso es requisito, no detalle.

2. **Subir R-F11…R-F14 a error, o bajarlas a nada.** Hoy son warnings que solo
   ve quien abre el canvas. Un nodo inalcanzable o un callejón sin salida son
   defectos reales de diseño; que publiquen en silencio contradice el §4.6 del
   plan ("publicar es un gate, no un botón").

3. **Llevar los límites de Meta al canvas** (R-F15…R-F30), que es el §4.5 del
   plan: validar al escribir, no al publicar. Con el paquete compartido sale
   gratis.

### Y lo que esto significa para los bloques compuestos (F1-a)

Un bloque "garantiza una regla por construcción" solo si la regla está en este
catálogo. Con el mapa a la vista:

- **Los bloques pueden garantizar R-F01, R-F02, R-F04, R-F05, R-F06, R-F07,
  R-F10, R-F12 y R-F16…R-F18** — son estructurales o de forma, y un generador
  las cumple por construcción.
- **No pueden garantizar R-F31** (depende del copy que escriba el operador)
  ni **R-F32** (depende de los datos del tenant).
- **R-F13 y R-F14 dependen de cómo se conecten los bloques entre sí**, no de
  cada bloque por separado: son propiedades del grafo compuesto.

---

## Pendiente de reconciliar

El PR #75 (carrusel) añade la condición `card_any` y las reglas de
`dynamic_cards` al backend, y toca el espejo del frontend. Cuando se mergee,
este catálogo gana:

- una regla de exclusividad `cards` / `dynamic_cards`,
- una regla de transición `button` inalcanzable en carrusel dinámico,
- `card_any` en la clave de deduplicación de R-F14.

No se anticipan aquí para no documentar código sin mergear.
