# Studio — Fase 5: control de respuestas

> **Rama:** `feat/studio-fase-5-escape` · apilada sobre #91 (Fase 4), #90, #89, #88 y #87
>
> La especificación pide un PR por funcionalidad, con motor, validador y
> panel juntos (paridad de tres vías). Este documento crece con cada una.

| Funcionalidad | Estado |
|---|---|
| C-08 · Palabras de escape por tenant | **Este PR** |
| C-04 · Validación de capturas | Pendiente |
| B-02 · Desambiguación | Pendiente |
| Horario en el saludo y en el paso a humano | Pendiente |
| Inactividad con ventana | Pendiente |
| Opt-out | Cubierto por C-08 (la baja ahora es del flow) |
| Fusión de mensajes | Pendiente |
| Indicador de "escribiendo" | Pendiente |
| Orden de entrega | Pendiente |

---

## 1. C-08 · Palabras de escape

> §6: *Menú, asesor/humano, baja/alto/stop y reiniciar. Se evalúan antes que las reglas del paso. Son configurables, con valores por defecto del molde.*

### Qué hace

Cada flow puede traer `escape`, con cuatro grupos de palabras. Se comparan contra el **mensaje completo**, normalizado: sin acentos, sin signos ni emojis, sin mayúsculas y sin espacios de más. «¡Asesor!» cuenta; «quiero un asesor» no (eso lo decide el paso).

| Grupo | Qué pasa | Lo capturado |
|---|---|---|
| `menu` | Va a `menu.node_id`, o al inicio | Se conserva |
| `restart` | Empieza desde el inicio | Se borra |
| `human` | Va a `human.node_id`, un paso de persona (alerta al dueño y pausa de 48 h) | Se conserva |
| `opt_out` | Baja: confirma una vez y el bot deja de escribirle | — |

- **Precedencia.** Menú, empezar de nuevo y persona **ceden** ante una salida propia del paso que maneje esa palabra (la regla que ya tenía el motor para «cancelar» en `pedido_confirma`). La baja **no cede nunca**: la resuelve el motor antes de ejecutar el flow.
- **Una palabra en dos grupos:** gana baja, luego persona, luego empezar de nuevo, luego menú.
- **Flows sin `escape`** (todos los publicados antes de esto): se portan como siempre. «menu», «salir», «cancelar» e «inicio» reinician y borran lo capturado; «stop», «baja», «no molestar» y «cancelar suscripción» dan de baja; no hay palabra de persona.
- **Red de seguridad:** si un flow dejara la baja vacía, el motor usa la de siempre. El validador no lo deja publicar.

| Pieza | Dónde |
|---|---|
| Resolver y comparar | `backend/src/domain/conversation/escapeWords.ts` |
| Motor: menú, empezar de nuevo, persona | `FlowInterpreter.execute`, "Caso 1" |
| Motor: baja | `ConversationEngine` (ahora carga el flow antes del gate de baja) |
| Contrato | `BotFlow.escape` en `flow.ts` y `FlowSchema` (destinos que existen) |
| Validador | `flowDesignValidator.ts` |
| Asistente | `WizardSpec.escape` (opcional) → paso `hablar_persona` + `flow.escape` |
| Panel | Paso 4 *Reconocimiento* (las cuatro listas) y paso 6 *Paso a humano* (textos) |
| Designer | No las edita, pero las conserva al guardar |

### Validador

| Código | Nivel | Qué revisa |
|---|---|---|
| V-CUMP-01 | error | Con palabra de persona, la vía existe desde cualquier paso. Falla si la palabra lleva a algo que no pasa a una persona, o si un paso se queda con la palabra (palabra clave, botón o fila) y la manda a otro lado |
| V-CUMP-02 | error | La baja quedó sin palabras |
| V-EST-02 | error | `menu.node_id` o `human.node_id` no existen (el schema tampoco publica) |
| V-EST-03 | — | Un paso al que solo se llega con una palabra de escape ya no cuenta como inalcanzable |
| V-EST-07 | aviso | La misma palabra en dos grupos |

Sin palabra de persona, V-CUMP-01 sigue como antes: revisa el grafo desde cada paso.

### Moldes

Los tres moldes JSON (`backend/scripts/*-flow.json`) y el molde de cerrajería del asistente traen las palabras recomendadas. Persona lleva a `hablar_directo` en papelería, a `handoff_asesor` en securitech y a un paso nuevo, `hablar_persona`, en cerrajería (no tenía uno genérico). En securitech, el menú va a `menu_principal` sin repetir el saludo.

**Supabase:** las plantillas de `flow_templates` no salen de estos archivos (ninguna migración las siembra), así que **siguen sin `escape`** y se portan como siempre. Los tenants que ya tienen bot tampoco cambian. Para activarlas en un bot existente: Studio → paso 4 → «Usar las palabras recomendadas» → guardar → publicar.

### Hallazgo de paso: palabras clave cortas

`fuzzyIncludes` dice que las palabras clave de 3 letras o menos se comparan como palabra completa, pero antes de esa regla buscaba subcadenas. Así, «no» coincidía dentro de «humano» y «bueno», y «si» dentro de «casi». En `info_servicios` de cerrajería, un cliente que escribía «humano» recibía la despedida. Lo encontró el validador nuevo. Ahora las cortas coinciden solo como palabra completa. Ningún test existente cambió.

### Tests

- `escapeWords.test.ts`: motor de punta a punta con el simulador (persona, menú, empezar de nuevo, baja propia, la baja no cede, persona sí cede, flow sin `escape`), normalización y precedencia.
- `flowDesignValidator.test.ts`: V-CUMP-01/02, V-EST-02/03/07 con escape.
- `studioWizard.test.ts`: compilar, leer de vuelta, detectar edición fuera del asistente, schema.
- `studioMolds.test.ts`: el molde del asistente y el JSON responden igual con «Menú», «cancelar» y «¡Asesor!».
- Panel: `designer-store.test.ts` (el Designer conserva `escape`) y `wizard-model.test.ts`.

### Desvíos

| Especificación | Qué se hizo | Por qué |
|---|---|---|
| «Se evalúan antes que las reglas del paso» | La baja sí; menú, empezar de nuevo y persona ceden ante una salida propia del paso | El motor ya tenía esa regla por un bug real (perder el pedido al escribir «cancelar»). El validador garantiza que un paso que se queda con la palabra de persona lleve a una persona |
| §7.3: «la opción sea visible en el menú principal o en su pie» | No se revisa | El modelo de nodos no tiene pie de mensaje. El asistente ofrece agregar la opción «Hablar con alguien» al menú |
| §7.3: palabra de persona obligatoria | Obligatoria en el asistente (esquema) y en los moldes; en el Designer basta con que el grafo llegue a una persona | Un flow armado a mano sin la clave `escape` sigue siendo publicable si cumple V-CUMP-01 por el grafo |

### Decisiones para OVY

- **D-5.1 · Plantillas de Supabase.** ¿Actualizo `flow_templates` con las palabras de escape (una migración que reescribe el JSON de cada plantilla) o se quedan como están? Recomiendo esperar a que se use el Studio para crear bots.
