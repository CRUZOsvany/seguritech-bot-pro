# Studio — Fase 5: control de respuestas

> Una rama por funcionalidad, apiladas: C-08 (`feat/studio-fase-5-escape`, #92) sobre la Fase 4 (#91), C-04 (`feat/studio-fase-5-capturas`, #93) sobre C-08, B-02 (`feat/studio-fase-5-desambiguacion`, #94) sobre C-04, horario (`feat/studio-fase-5-horario`, #95) sobre B-02, fusión (`feat/studio-fase-5-fusion`, #96) sobre horario, y "escribiendo" (`feat/studio-fase-5-escribiendo`) sobre fusión.
>
> La especificación pide un PR por funcionalidad, con motor, validador y
> panel juntos (paridad de tres vías). Este documento crece con cada una.

| Funcionalidad | Estado |
|---|---|
| C-08 · Palabras de escape por tenant | Hecha: #92 |
| C-04 · Validación de capturas | Hecha: #93 |
| B-02 · Desambiguación | Hecha: #94 |
| Horario en el saludo y en el paso a humano | Hecha: #95 (sin zona horaria por tenant, D-5.3) |
| Inactividad con ventana | Pendiente |
| Opt-out | Cubierto por C-08 (la baja ahora es del flow) |
| Fusión de mensajes | Hecha: #96 |
| Indicador de "escribiendo" | Hecha: PR apilado sobre el de fusión (sin probar contra un número real, A-01) |
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

---

## 2. C-04 · Validación de capturas

> §6: *teléfono MX (10 dígitos; acepta +52, espacios y guiones; normaliza); correo; número entero o decimal con rango; fecha y hora; texto con largo mínimo y máximo; opción de lista, ubicación e imagen. Cada captura define su mensaje de error y sus reintentos. Al agotarlos, escala o vuelve al menú (configurable).*

### Qué hace

Un paso `wait_input` puede declarar `validation`. Si la respuesta no sirve, el bot vuelve a pedirla con `validation_error` o con un mensaje según el tipo, y no avanza ni guarda nada. Si sirve, guarda la respuesta **normalizada**.

| Tipo | Acepta | Se guarda como |
|---|---|---|
| `phone_mx` | 10 dígitos, con +52, 52 o 521 delante, espacios, guiones o paréntesis | `7471234567` |
| `email` | `nombre@dominio.algo` | en minúsculas |
| `number` | entero o decimal (coma o punto), con `min`, `max` e `integer` opcionales | `3.5` |
| `date` | `15/03/2026`, `15-3-26`, `15/03`, `15 de marzo (de 2026)`; revisa que el día exista | `15/03/2026` o `15/03` |
| `time` | `17:30`, `5:30 pm`, `5 pm`, `17 h`, `17:30 hrs` | `17:30` |
| `text` | con `min_length` y `max_length` (por caracteres) | sin espacios en las orillas |

`'numeric'`, la validación de antes (papelería, `pedido_cantidad`), sigue igual: mismo patrón, mismo mensaje y guarda el texto tal cual.

**Intentos.** Con `max_attempts` (1 a 5) y `on_exhausted`, el motor cuenta las respuestas inválidas seguidas en la sesión (clave reservada `__capture_attempts`). Al llegar al tope sigue en `on_exhausted`; una respuesta buena reinicia la cuenta. Sin tope, vuelve a pedir siempre, como antes.

| Pieza | Dónde |
|---|---|
| Revisar, normalizar, mensajes, ejemplos | `backend/src/domain/conversation/captureValidation.ts` |
| Motor | `FlowInterpreter.execute`, bloque de validación de `wait_input` |
| Contrato | `WaitInputNode` en `flow.ts`, `FlowSchema` |
| "Por qué" | `explain.ts`: qué se esperaba y en qué intento va |
| Validador | `on_exhausted` cuenta como salida para alcanzar pasos y llegar a una persona |
| Explorador | Prueba una respuesta válida de cada tipo y agotar los intentos |
| Asistente | `check` en la opción de captura; al agotar va a «Cuando no entiende» (su aviso trae el último mensaje) o al menú |
| Panel | Paso 3, en cada captura: tipo, rango o largo, mensaje, intentos y a dónde sigue |

### Validador y schema

| Dónde | Qué revisa |
|---|---|
| V-EST-02 (error) | `on_exhausted` lleva a un paso que no existe |
| V-EST-03 / V-CUMP-01 | Un paso al que solo se llega al agotar los intentos es alcanzable, y cuenta como vía a una persona |
| Schema (no publica) | `max_attempts` y `on_exhausted` van juntos; tope sin validación; mínimo mayor que el máximo; tipo desconocido |

### Desvíos

| Especificación | Qué se hizo | Por qué |
|---|---|---|
| Ubicación e imagen | No están | El motor no recibe esos mensajes: el parser los extrae pero no llegan al flow (H-4) o se ignoran (H-8). Regla 2: si el motor no lo hace, no se ofrece |
| Opción de lista | Sin tipo nuevo | Ya lo hace `send_list` con `list_item_any`: desde #85 solo acepta filas reales |
| Fecha y hora | Formatos fijos | «mañana a las 5» necesita saber qué día es hoy en la zona del negocio; queda para cuando se decida la zona horaria del contenedor |
| Reintentos | Contador por captura, no el general del ADR | Ver D-5.2 |

### Decisiones para OVY

- **D-5.2 · ADR del contador de reintentos** (`.claude/ADR_CONTADOR_REINTENTOS.md`, "propuesto, sin decidir"). La especificación exige reintentos en capturas, así que implementé la parte mínima: un contador **solo para capturas con validación**, en la sesión, sin condición nueva de transición. No es la opción B del ADR (contar los "no entendí" de cualquier paso); los menús del asistente ya tienen su escalera con pasos. ¿Das el ADR por decidido así, o lo reviso con los datos del piloto como proponía?

---

## 3. B-02 · Desambiguación

> §6: *Si dos reglas empatan, el bot pregunta ("¿Te refieres a A o a B?") en lugar de elegir. El validador marca los empates que se pueden detectar en diseño.*

### Qué hace

Cuando un mensaje coincide con **palabras clave** de dos o más salidas del mismo paso, con la misma prioridad y hacia destinos distintos, el bot no adivina. Manda botones: «¿Te refieres a «Información» o a «Agendar cita»?».

- **Cómo se llama cada opción:** el botón o la fila del mismo paso que lleva a ese destino (el cliente ya lo vio); si no hay, la palabra que coincidió.
- **Cuántas:** una por destino, hasta el máximo de botones de WhatsApp (`limits.ts`). Los títulos se recortan al largo que permite Meta.
- **La respuesta:** tocar un botón, o escribir el título de una opción, sigue a esa opción. Cualquier otra cosa descarta la pregunta y el paso se evalúa normal. Una palabra de escape también la descarta.
- **Dónde no aplica:** botones y filas (coinciden exacto, no empatan); un empate que incluye otra condición (se sigue desempatando por especificidad); dos palabras al mismo destino; y las capturas (`wait_input`), donde el texto es la respuesta y no una elección.
- La pregunta pendiente vive en la sesión (clave reservada `__disambiguation`). El simulador no la muestra como variable.

| Pieza | Dónde |
|---|---|
| Opciones, pregunta y respuesta | `backend/src/domain/conversation/disambiguation.ts` |
| Motor | `FlowInterpreter`: `ambiguousOptions` en `evaluateTransitions`, y la pregunta pendiente al empezar el "Caso 3" |
| "Por qué" | «Coinciden A y B con la misma prioridad: en vez de adivinar, el bot pregunta cuál» y «El cliente eligió A» |
| Validador | V-EST-07 avisa la misma palabra en dos salidas: ahora dice que el bot tendrá que preguntar |
| Panel | La nota del paso 4 explica la pregunta |

### Cambio de una decisión anterior

DEC-06 / ADR-016 decía que un empate entre salidas del mismo nivel lo desempata el orden (gana la primera). Para palabras clave a destinos distintos ya no: el bot pregunta. El test que fijaba «gana la primera» (`FlowInterpreter.transitionSpecificity.test.ts`) ahora fija la pregunta. Para cualquier otro empate, el orden sigue desempatando como antes.

Ninguna conversación grabada de los moldes cambió: ninguna tenía un empate así.

### Desvíos

| Especificación | Qué se hizo | Por qué |
|---|---|---|
| «Si dos reglas empatan» | Solo empates de palabras clave | Botones y filas coinciden exacto; los demás tipos (catálogo, directorio) tienen prioridades distintas y no empatan entre sí |
| El validador marca los empates detectables | V-EST-07 marca la misma palabra en dos salidas | Dos palabras distintas que aparecen en el mismo mensaje («precio de la cita») no se pueden prever en diseño |
| Texto de la pregunta | Fijo en el motor | Igual que la confirmación de baja. Si hace falta por negocio, es un campo más del flow |

---

## 4. Horario

> §6: *Condición "dentro/fuera de horario" en el saludo y en el paso a humano, con la zona horaria del tenant.*

### Qué hace

Antes, fuera de horario el motor solo mandaba el mensaje de "cerrado" y no corría el flow, para todos. Ahora cada flow elige con `hours.when_closed`:

| Modo | Fuera de horario |
|---|---|
| `block` (o sin `hours`) | Como siempre: solo el mensaje de "cerrado"; la conversación se queda donde iba |
| `continue` | El flow atiende. Una conversación **nueva** empieza con el mensaje de "cerrado" y sigue normal. Cada paso a persona usa su `user_response_closed` (si no lo trae, el de siempre); el aviso al dueño se manda igual |

El dueño prueba su bot a cualquier hora, sin aviso.

| Pieza | Dónde |
|---|---|
| Contrato | `BotFlow.hours`, `EscapeToHumanNode.content.user_response_closed`, `FlowSchema` |
| Motor | `ConversationEngine`: el gate de horario según el modo, y el texto del paso a persona |
| "Por qué" | Gates nuevos `out_of_hours_notice` y `out_of_hours_handoff` |
| Validador | **V-CUMP-05** (aviso): en `continue`, un paso a persona sin texto de fuera de horario |
| Asistente | `hours.whenClosed` y `userResponseClosed` en cada paso a persona |
| Panel | Paso 1: «Fuera de horario el bot sigue atendiendo». Paso 6: «Lo que ve el cliente fuera de horario» |

### Hallazgo: el molde de cerrajería prometía algo que no hacía

El mensaje de "cerrado" sugerido del molde de cerrajería dice *«Si es una emergencia, escríbenos "emergencia" y te atendemos»*, pero el gate de horario no dejaba correr el flow: escribir "emergencia" de noche devolvía otra vez el mensaje de "cerrado". Ahora el molde (el del asistente y el JSON) está en `continue`, con texto de fuera de horario en cada paso a persona. Las emergencias usan el mismo texto a cualquier hora, a propósito. Lo fija `businessHoursFlow.test.ts`.

Por lo mismo, la conversación grabada de cerrajería ahora pasa por `out_of_hours_notice` en vez de `out_of_hours`. El gate de siempre sigue probado con un flow en `block` en el mismo archivo.

### Desvíos

| Especificación | Qué se hizo | Por qué |
|---|---|---|
| Condición en el saludo | Aviso al empezar una conversación nueva, no un paso de condición | Una condición de horario como paso implica que el motor evalúe salidas en pasos que no esperan al cliente. El aviso cubre el caso real (avisar que está cerrado y seguir) sin tocar cómo avanza el motor |
| Zona horaria del tenant | Sigue `America/Mexico_City` para todos | Ver D-5.3 |
| Simulador viejo (`/simulator/<uuid>`) | Conserva el gate de siempre | Usa su propia copia de la orquestación (H-2) y está por retirarse |

### Decisiones para OVY

- **D-5.3 · Zona horaria por tenant.** `bot_configurations` es una tabla con columnas, así que necesita la migración 024 (`zona_horaria`) y el campo en el PATCH y en el panel. Leerla es seguro aunque la migración no esté (el servicio lee con `select('*')`); escribirla no. Hoy todos los tenants están en Chilpancingo. Para el horario, la zona del contenedor no importa: `BusinessHoursService` le pasa la zona a `Intl` explícitamente. ¿La agrego ahora o cuando haya un tenant en otra zona? Recomiendo esperar, porque ya hay dos migraciones sin aplicar (021 y 023).

---

## 5. Fusión de mensajes

> §6: *El editor muestra cuántos mensajes envía cada paso y propone fusionar. Ejemplo: saludo de texto + menú se convierten en un solo mensaje interactivo con el saludo en el cuerpo.*

### Qué hace

- **Mensajes por turno.** El reporte del validador trae `turns`: desde cada inicio de turno, cuántos mensajes manda el bot hasta esperar al cliente, y por qué pasos. El Studio los muestra en el paso 8 y el Designer en su panel de validación (solo los turnos con más de uno).
- **Propone fusionar.** V-COSTO-01 (un texto suelto justo antes de otro texto o de un menú) trae un arreglo (`fix`) cuando se puede hacer solo, o el motivo cuando no.
- **Fusiona sin mover flechas.** El texto se convierte **en su lugar** en el mensaje que le sigue, con el texto arriba: conserva su id, así lo que llegaba a él no cambia. El mensaje de después se queda si algo más lo usa (otra salida, el inicio, una palabra de escape, un tope de intentos) y se quita si ya no.
- **No fusiona** si juntos pasan del límite del cuerpo (de `limits.ts`), si uno de los dos textos es del negocio (`config_bound`) y el otro no, o si el texto tiene más de una salida. Si los dos son del negocio, junta sus claves, como el saludo del asistente.
- **En el Designer**, la sección «Revisión del Studio» valida lo que hay en el lienzo, sin guardar, con las mismas reglas que se aplican al publicar. «Fusionar» carga el resultado al lienzo como cambio sin guardar, y el operador guarda como siempre.

| Pieza | Dónde |
|---|---|
| Fusión | `backend/src/domain/validation/mergeMessages.ts` (`planMerge`, pura) |
| Validador | `turns` en el reporte; `fix` en V-COSTO-01 |
| Endpoints | `POST /api/admin/tenants/:id/studio/validate` y `POST …/studio/merge`: devuelven, no guardan. No escriben nada, así que no pasan por el audit log |
| Panel | Designer: `designer/validation/StudioReview.tsx`. Studio: paso 8 |

Con securitech: fusionar «saludo» deja un solo mensaje (saludo + menú). «menu_principal» se queda porque lo usan «no_entendi» y la palabra «menú».

### Desvíos

| Especificación | Qué se hizo | Por qué |
|---|---|---|
| «Cuántos mensajes envía cada paso» | Por turno, no por paso | Lo que cuenta para el cliente y para el costo es cuántos llegan juntos; un paso casi siempre manda uno |
| Proponer fusionar en el editor | En el Designer y en el reporte; el asistente no lo necesita | El asistente ya arma el saludo y el menú en un solo mensaje |
| Los moldes JSON | Sin tocar | Fusionar el saludo de securitech cambia cómo se ve el primer mensaje: es decisión del negocio (ya estaba anotado en la Fase 2) |

---

## 6. Indicador de "escribiendo" (C-07)

### Qué hace

Cuando el bot va a contestar, marca como leído el mensaje del cliente y le muestra "escribiendo…" mientras arma la respuesta. Meta lo quita al llegar la respuesta, o a los 25 s.

- **Payload verificado contra la doc oficial** (2026-09-11, [typing indicators](https://developers.facebook.com/docs/whatsapp/cloud-api/typing-indicators)): `POST /{phone-number-id}/messages` con `{"messaging_product":"whatsapp","status":"read","message_id":"<wamid>","typing_indicator":{"type":"text"}}`. No es un mensaje: no lleva `to` ni `type`.
- **Solo si el bot va a contestar**, como pide Meta: el motor lo manda justo antes de correr el flow. No lo manda si un gate decide el turno (baja, pausa por persona, cerrado en modo `block`, sin flow), ni si no hay id del mensaje.
- **No frena el turno:** si falla, se registra y el cliente recibe su respuesta igual.
- **Simulación:** el mensajero falso lo anota sin mandar nada. Aparece en la traza (`typing`) y en el "Por qué".

| Pieza | Dónde |
|---|---|
| Payload | `buildTypingPayload` en `infrastructure/adapters/meta/metaPayloads.ts` |
| Puertos | `MessengerPort.typing?` (dominio) y `NotificationPort.sendTypingIndicator?`, opcionales: un adaptador que no lo soporta no lo muestra |
| Producción | `MetaWhatsAppAdapter.sendTypingIndicator`, por el mismo `sendToMeta` y las mismas credenciales |
| Motor | `ConversationEngine`, antes de `interpreter.execute` |

**Paridad:** la paridad de producción intercepta cada POST a Meta. Ahora compara aparte los de "escribiendo…" contra los pasos `typing` de la traza de la simulación: los dos lados lo muestran en los mismos turnos.

**[no verificado]:** no se probó contra un número real, porque Meta sigue sin conectar (A-01). Lo que sí está probado es el payload exacto y la llamada HTTP.

**Fuera de este PR:** el retraso de 600–1200 ms entre mensajes (DEC-08) va con el orden de entrega.
