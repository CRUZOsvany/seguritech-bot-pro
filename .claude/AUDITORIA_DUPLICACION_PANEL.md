# Auditoría de duplicación — panel, Designer y simulador

> **Fecha de verificación:** 2026-09-08
> **Método:** lectura de `main` + rama `feat/carrusel-bucle-cerrado`. Cero cambios de código.
> **Alcance:** los 9 puntos del prompt PA del plan de mejora del 2026-09-08.
>
> Cada afirmación lleva `archivo:línea`. Lo que no pude verificar está marcado
> **NO VERIFICADO** y no se cuenta como hallazgo.
>
> El plan que originó esta auditoría infirió sus hallazgos desde capturas de la
> interfaz. **Tres de sus conclusiones cambian con la evidencia** (D3, D4 y el
> badge de entorno) y una se confirma sin necesidad de la prueba manual que
> proponía (D9). Están señaladas abajo.

---

## 1. ¿Cuántas representaciones del flujo existen?

**Cuatro, no tres.**

| Representación | Dónde vive | Qué es |
|---|---|---|
| Molde | `flow_templates.json_definition` | Plantilla por giro, global |
| **Lo que corre** | `bot_flows.json_definition` | El flow activo que ejecuta el intérprete |
| Borrador | `bot_flows.draft_json` (**nullable**) | Lo único que mira el Designer |
| Historial | `bot_flow_versions.flow_json` | Inmutable, una fila por publicación |

Evidencia: `002_bot_flows_engine.sql:60-78` (bot_flows), `008_bot_flow_versions.sql:8-18`.

**Quién lee y escribe qué:**

```
flow_templates ──cloneFromTemplate──▶ bot_flows.json_definition ──▶ FlowInterpreter (runtime)
                    (COPIA)                     ▲
                                                │ publishDraft
                                                │
Designer ◀──getDraft──── bot_flows.draft_json ──┘ + INSERT bot_flow_versions
Guion    ◀──getDraft────────────┘  (y TAMBIÉN escribe: ver §5)
```

El punto ciego: **nada lee `json_definition` hacia el Designer.** Es la única de
las cuatro que ninguna pantalla de edición carga.

---

## 2. Causa raíz de «El flujo no tiene nodos en el draft»

Cadena completa, determinista:

1. `publishDraft` termina llamando a `setActiveFlow({ ..., clearDraft: true })`
   — `SupabaseBotFlowRepository.ts:342`. Eso pone `draft_json` a null
   (`:548`).
2. `getDraft` devuelve `data.draft_json ?? null` — `:222`.
3. El Designer hace
   `loadFromBotFlow(isBotFlowish(raw) ? raw : EMPTY_FLOW, flowId)` —
   `tenants.$id.designer.tsx:120`. Sin draft carga **EMPTY_FLOW**. No hay
   fallback a `json_definition` ni al molde.
4. `nodes.length === 0` pinta el cartel — `tenants.$id.designer.tsx:470`.

**El Designer está vacío precisamente porque el flujo se publicó bien.** No es
un fallo intermitente ni un problema de carga: publicar es la acción que deja
el Designer en blanco, y no hay forma de volver a llenarlo desde la interfaz.

Eso explica también por qué el badge dice `flujo: activo` al mismo tiempo: son
dos campos distintos de la misma fila, y ambos dicen la verdad.

El cartel llega a sugerir *«Publica desde un molde asignado o edita el draft en
una versión futura del designer»* (`:472`) — la propia interfaz admite que
editar no está implementado.

---

## 3. ¿Qué genera el badge «1 error»?

`frontend/src/apps/panel/designer/validation/graphValidator.ts`, **10 reglas
propias del frontend**:

`start_missing`, `start_unresolved`, `dangling_transition`,
`transition_to_missing`, `duplicate_condition`, `unreachable_node`,
`no_end_reachable`, `node_no_transitions`, `cycle_detected`,
`config_bound_mismatch` (`:60-272`).

Con `EMPTY_FLOW` (`start_node_id` vacío) dispara `start_missing`, severidad
`error`. **Exactamente uno.** La hipótesis del plan queda confirmada: el único
error es el que la interfaz se causó a sí misma al vaciar el canvas.

**Duplicación confirmada (D8).** El backend valida con Zod en
`domain/validators/flowSchema.ts` al publicar, con reglas que **no son las
mismas**: el backend comprueba límites de Meta (≤3 botones, ≤10 filas,
longitudes, https, reglas cross-card del carrusel) que el validador del
frontend no tiene; y el frontend comprueba alcanzabilidad y ciclos que el
backend no. Ninguna de las dos es superconjunto de la otra: **un flow puede
pasar el validador del canvas y ser rechazado al publicar, y viceversa.**

---

## 4. Los textos de WhatsApp → Mensajes

**Único consumidor real de cuatro de los cinco: el grafo, vía `VariableResolver`**
(`VariableResolver.ts:69-77`). No hay ningún punto del intérprete que los
inyecte por su cuenta.

| Clave | Consumidores fuera del grafo |
|---|---|
| `welcome_message` | ninguno |
| `menu_message` | ninguno |
| `not_understood_message` | **ninguno** |
| `order_confirmation_message` | ninguno |
| `out_of_hours_message` | `BotController.ts:238` (gate de horario), `SimulateMessageUseCase.ts:172` |

**Esto corrige D3 del plan**, que lo marcaba con confianza «Alta» diciendo que
el campo suelto *contradice* la escalera de fallback del grafo. No la
contradice: **es inerte**. Cuando ninguna transición matchea, `FlowInterpreter`
re-renderiza el nodo actual — nunca envía `notUnderstoodMessage`. Ese texto
solo llega al cliente si un nodo lo pide con `{{not_understood_message}}`.

No hay dos fuentes compitiendo en runtime. El problema es el inverso:

| Flow | Nodos `send_text`+`send_buttons` | Referencias al traje | `config_bound` |
|---|---|---|---|
| `seed.sql` (**los moldes**) | 29 | 5 | **0** |
| papeleria-flow.json | 8 | 3 | 2 |
| cerrajeria-flow.json | 7 | 3 | 2 |
| securitech-flow.json | 8 | 0 | **0** |

~47 nodos de copy contra 11 referencias. **La mayoría del copy está
hardcodeado en el JSON del grafo**. El candado que lo impediría existe
—`config_bound` (`flow.ts:169`), su lista de claves (`:148-153`) y la regla que
exige texto puro-placeholder en `FlowSchema.superRefine`— pero está sin poner
justo donde más importa: los moldes. Cada molde nuevo nace duplicando
copy.

Además, `CONFIG_BOUND_VALUES` solo admite 3 de las 5 claves, y el comentario
que excluye a las otras dos (`flow.ts:140-146`) dice que quedan fuera *«hasta
que exista lógica de horarios o un molde que los use»*. **Las dos condiciones
ya se cumplieron** (ver tabla arriba). El comentario está obsoleto.

---

## 5. ¿Qué es la pestaña «Guion»?

**No es una vista de sólo lectura. Es un segundo editor del mismo draft.**

`frontend/src/apps/panel/hooks/use-guion.ts:15-19` lo dice explícito: carga el
draft, lo aplana a filas de texto, y **escribe draft** con concurrencia
optimista contra `draft_updated_at`. El endpoint `PUT .../draft` acepta el
`expectedDraftUpdatedAt` precisamente para eso (`flowsRouter.ts:75`).

**Esto agrava D4 del plan**, que lo clasificaba como «vista generada del grafo,
de sólo lectura» pendiente de convertir. La realidad es peor: **hoy hay dos
editores concurrentes sobre `draft_json`**, y solo uno de los dos (el Guion)
implementa control de concurrencia. El comentario de `flowsRouter.ts:75-77` lo
admite: *«El Designer no lo [usa]»*.

Consecuencia práctica: si editas en el Designer y guardas, puedes pisar lo que
el Guion escribió sin que nada te avise.

---

## 6. ¿El molde se referencia o se copia?

**Se copia. Confirmado en código — no hace falta la prueba manual de 5 minutos
que proponía el plan.**

`AssignMoldeUseCase.ts:11` («Clona el template indicado en bot_flows del
tenant») → `cloneFromTemplate` (`SupabaseBotFlowRepository.ts`), que lee
`flow_templates.json_definition` y hace `insert` de una copia entera en
`bot_flows.json_definition`.

`source_template_id` se guarda, pero **solo como procedencia: nunca se vuelve a
leer para obtener contenido.** Y **no existe `molde_version`** en el esquema.

**D9 confirmado.** CerraCruz y Cerrajería Tony tienen cada uno su copia
independiente. Un arreglo al molde de cerrajería no llega a ningún tenant ya
creado. La promesa de «un molde por giro» es hoy decorativa, tal como sospechaba
el plan.

---

## 7. ¿Existe código de simulación?

**Sí, y cubre bastante más de lo que el plan supone.**

`POST /api/admin/simulate` (`tenantsRouter.ts:506-508`) →
`SimulateMessageUseCase`. Ya soporta:

| Capacidad que pide §5.3 del plan | Estado |
|---|---|
| Elegir qué versión simular | **Existe** — `source: 'active' \| 'draft' \| 'version'` |
| Sesión que no toca la BD | **Existe** — `persist: false`, User efímero |
| Encadenar turnos sin persistir | **Existe** — `state: { currentNodeId, context }` |
| Reloj inyectable | **Existe** — `simulateAt` (ISO 8601), para probar el gate de horario |
| Aislamiento multi-tenant | **Existe** — `tenantsRouter.ts:515` |

Y es **dry por construcción**: el constructor de `SimulateMessageUseCase` no
recibe `NotificationPort`. No es que se sustituya el envío — es que
estructuralmente no puede enviar nada.

Hay además un simulador **separado**: SPA estática en `backend/public/simulator/`,
servida en `/simulator/:tenantId` (`ExpressServer.ts:376-414`). Es la cuarta
puerta del §1.3 del plan y no comparte código con el panel React.

**Lo que falta para §5:** `trace` (el `SimulateResult` solo devuelve `outputs`,
`nextNodeId`, `context`, `flowEnded`, `error`), sesiones con TTL, `rewind`,
`jump` y `export` a fixture.

---

## 8. Estado del bot: dónde se calcula y se pinta

Sin función compartida. Cadenas literales dispersas en **5 archivos**:

- `components/service-cards.tsx` — `'active'`
- `components/tenants-table.tsx` — `'Sandbox'`
- `routes/tenants.$id.designer.tsx` — `'active'`, `'draft'`
- `routes/tenants.$id.whatsapp.tsx` — `'active'`, `'activo'`, `'pendiente'`
- `routes/tenants.$id.service-directory.tsx` — `'activo'`

Nótese `'active'` y `'activo'` **conviviendo en el mismo archivo**
(`tenants.$id.whatsapp.tsx`). **D5 y D10 confirmados.**

---

## 9. Efectos secundarios fuera de puerto que bloqueen el dry-run

**Ninguno. El bloqueo que teme el prompt PC no existe.**

- `FlowInterpreter` es puro: devuelve `InterpreterOutput[]`, no envía nada.
- Los envíos viven en `BotController.dispatchOutputs`, que el simulador no usa.
- **No hay `setTimeout` / `sleep` / delays** en `domain/` ni `app/` — los delays
  de DEC-08 no están implementados en runtime, así que el «tiempo lógico» de
  §5.2 no tiene nada que sustituir todavía.
- **No hay escrituras a `pos_sales`** en el camino del bot; la sustitución del
  puerto POS de §5.2 es hoy innecesaria.

Única laguna real: el aviso al dueño del `escape_to_human` vive en
`BotController.dispatchOutputs`, no en el intérprete. El simulador **nunca
ejercita la escalación**, así que no puedes probarla ahí. No bloquea el
dry-run, pero sí limita lo que el simulador puede validar.

---

## Corrección al badge de entorno

El plan pide que «en local diga LOCAL». **Ya lo hace**: `shared/lib/env.ts:27-32`
devuelve `LOCAL` cuando `import.meta.env.DEV`.

El badge decía PROD en la captura porque `127.0.0.1:3001` sirve el panel
**compilado** desde `backend/public/app/` (`npm run build:panel` → `PROD=true`),
no el dev server de Vite. El badge no miente: reporta el **modo de build**.

El riesgo que señala el plan sigue en pie, pero el arreglo es otro: el badge
responde una pregunta que nadie hace (¿cómo se compiló esto?) en lugar de la que
importa (¿contra qué Supabase y qué número de Meta estoy apuntando?). El propio
archivo ya anota la deuda: `VITE_APP_ENV` no existe (`env.ts:8`).

---

## Tabla de duplicación, ordenada por costo de dejarlo así

| # | Duplicado | Ubicaciones | Fuente que debe ganar | Costo de unificar | Costo de NO hacerlo |
|---|---|---|---|---|---|
| **1** | Draft vs. lo que corre | `draft_json` (null tras publicar) vs `json_definition` | `json_definition` siembra el draft al abrir | **Bajo** — un fallback en `getDraft` o en el loader | **Bloqueante.** No se puede editar ningún flujo publicado desde el panel |
| **2** | Dos editores del mismo draft | Designer (`use-flows.ts`) y Guion (`use-guion.ts`), solo el 2º con concurrencia | Un editor; el Guion pasa a lectura | Medio | Pérdida silenciosa de trabajo entre pestañas |
| **3** | Molde clonado por tenant | `cloneFromTemplate` copia el JSON entero | Referencia `molde_id` + `molde_version` + overrides | **Alto** — toca esquema y migración | Cada cliente del mismo giro cuesta como el primero; los arreglos al molde no propagan |
| **4** | Dos validadores desalineados | `graphValidator.ts` (10 reglas) vs `flowSchema.ts` (Zod, límites Meta) | Paquete compartido | Medio-alto (no hay workspace compartido hoy) | Se puede publicar lo que el canvas aprobó, y al revés |
| **5** | Copy del bot | 47 nodos con texto literal vs 11 referencias al traje; `config_bound` en 0 moldes | El traje, referenciado desde el grafo | **Bajo** para las 5 claves canónicas; alto para el copy mixto | Cambiar un saludo obliga a publicar versión nueva del flujo |
| **6** | Estado del bot | 5 archivos, `'active'` y `'activo'` en el mismo | Estado derivado + un componente | Bajo | Confusión; badges que se contradicen |
| **7** | Simuladores | Panel React + SPA estática `/simulator/` | El del panel | Medio | Dos cosas que mantener; la estática no ve draft/versión |
| **8** | Vocabulario | cliente/tenant/negocio · molde/flujo/guion · draft/versión | Glosario, 1 palabra por concepto | Bajo | Fricción permanente |
| ~~D3~~ | ~~«No entendió» duplicado~~ | — | — | — | **Descartado**: el campo es inerte, no compite (§4) |
| D6 | «Pausar» en dos sitios | encabezado WhatsApp + tarjeta de servicio | — | — | **NO VERIFICADO** |
| D7 | Config de servicios | WhatsApp + Directorio de servicios | — | — | **NO VERIFICADO** |

---

## Lo que esta auditoría cambia en el plan de fases

1. **El hallazgo 1.1 es de costo bajo, no estructural.** El plan lo trata como
   síntoma de un modelo mal reconciliado que exige el ADR de PB primero. Es más
   simple: publicar nulea el draft y nadie lo resiembra. Se puede arreglar
   **antes** de F0 sin comprometer ninguna decisión del ADR, y desbloquea poder
   diseñar de inmediato.

2. **F3 (simulador) es mucho más barato de lo presupuestado.** `source`,
   `persist`, `state` y `simulateAt` ya existen y el dry-run no está bloqueado
   por ningún puerto. Lo que falta es principalmente **`trace`** — que es, según
   el propio §5.4, lo que de verdad hace falta para diseñar.

3. **El Guion sube de prioridad.** Pasa de «convertir en vista generada»
   (cosmético) a «hay dos editores concurrentes sobre la misma fila» (riesgo de
   pérdida de datos).

4. **F1 sobre textos se encoge**: ampliar `CONFIG_BOUND_VALUES` a 5 claves,
   poner `config_bound` en los moldes y añadir la regla al linter. No necesita el
   ADR.

5. **El clonado del molde (#3) es el único que exige migración de esquema** y por
   tanto el único que justifica el ADR de PB por sí solo.
