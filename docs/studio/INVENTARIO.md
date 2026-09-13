# Studio de Chatbots — Inventario de la Fase 0

> **Fecha:** 2026-09-10 · **Base:** `main` en `ad2a663` · **Mergeado en** #84 (`092da4e`)
>
> **Actualización del 2026-09-10:** H-1 resuelto en #85 (`bcfecc7`). Las
> referencias `archivo:línea` de `MetaWhatsAppAdapter.ts` y
> `FlowInterpreter.ts` están recalculadas sobre ese commit.
>
> Contrasta la especificación del Studio (documento de OVY del 2026-09-10) con
> el código real de `main`. Donde no coinciden, **manda el repo**: la sección 2
> lista cada desvío y qué cambia en el plan.
>
> Etiquetas de evidencia: **[test]** reproducido con un test que corrió ·
> **[código]** leído en el código, con `archivo:línea` · **[doc Meta]** leído en
> la documentación oficial ese día · **[no verificado]** con la razón.

---

## 0. Lo que cambia el plan, en ocho líneas

1. **El prerrequisito 1 ya estaba cumplido.** #80, #78 y #79 se mergearon a `main` el 2026-09-10 03:46 UTC, en ese orden. No había nada que integrar.
2. **El bug de caché no estaba en `SupabaseTenantRepository.update()`** (no tiene caché propia), sino en el router que lo llama. Arreglado en esta rama.
3. **El panel no es Next.js ni NextAuth.** Es Vite + React 19 + TanStack, servido por el mismo Express, con auth propia por cookie JWT. No hay BFF: los endpoints del Studio van bajo `/api/admin/tenants/:id/…`.
4. **El versionado ya existe**, con otra forma: borrador en `bot_flows.draft_json`, publicado en `bot_flows.json_definition` e historial inmutable en `bot_flow_versions`. La tabla `flow_versions` del documento sería una segunda fuente de verdad.
5. **El simulador ya existe, pero es una copia paralela de `BotController`.** Comparten el intérprete, no los gates. La Fase 1 tiene que unificar la orquestación, no solo agregar traza.
6. ~~**Hay un bug en producción en el molde de papelería**~~ **Resuelto en #85.** Al tocar un servicio de la lista, el bot contestaba *"Perfecto, \*\*."* con el nombre vacío (§8, H-1).
7. **El cobro de mensajes de servicio desde octubre de 2026 no aparece en la doc oficial de precios.** Solo lo reportan proveedores. La página oficial dice hoy que los mensajes que no son plantilla son gratis (§6.3).
8. **Meta exige mínimo 2 tarjetas en un carrusel y cuerpo de tarjeta ≤ 160.** El schema del repo acepta 1 tarjeta y 1024: hoy se puede publicar un carrusel que Meta rechaza (§8, H-5).

---

## 1. Prerrequisitos

### 1.1. PRs #80, #78 y #79 — ya en `main`

| PR | Qué trajo | Mergeado (UTC) |
|---|---|---|
| #80 | #75 (carrusel con bucle cerrado, cards dinámicas, migración 021), #76 (auditoría de duplicación), #77 (siembra del Designer) y el arreglo del constructor de `FlowInterpreter` | 2026-09-10 03:46:27 |
| #78 | `REGLAS_FLOW.md`, catálogo de 36 reglas | 2026-09-10 03:46:39 |
| #79 | Bloques compuestos (F1-a), `backend/src/domain/blocks/` | 2026-09-10 03:46:48 |

Fuente: `gh pr list --state all`. Qué hace el Designer que llegó con ellos: §5.

### 1.2. Bug de caché — ubicado y arreglado

**Dónde estaba de verdad.** `SupabaseTenantRepository.update()` no cachea nada. La caché es la de `SupabaseTenantConfigService` (node-cache, TTL 5 min, `SupabaseTenantConfigService.ts:9`), y la invalida quien llama a `update()`: el `PATCH /api/admin/tenants/:id` (`tenantsRouter.ts:174`).

**El defecto.** El router solo invalidaba si el body traía `bot_configuration`. Pero `TenantConfig` también lee de `tenants` los campos `nombre_negocio`, `horario_semana`, `horario_sabado`, `abre_domingo` y `giro` (`SupabaseTenantConfigService.ts:77`). Cambiar el horario desde el panel tardaba hasta 5 minutos en llegar al gate de horario del bot. Un test lo protegía: afirmaba que un `PATCH` sin guion *"no tiene nada cacheado que cambie"*.

**Arreglo** (commit `15cc7a6`): se invalida en todo `PATCH` exitoso. Una lista selectiva de campos se volvería a quedar corta la próxima vez que `TenantConfig` lea un campo nuevo, y el Studio va a agregar variables como `{{direccion}}`. Un caso de test por campo y otro para el update fallido. **[test]** Con el router viejo fallan 5 de los 10 casos; con el arreglo pasan los 10.

**Por qué no aplica igual a la publicación de versiones.** El flow activo **no se cachea**: `findActiveByTenant` lee la BD en cada mensaje (`SupabaseBotFlowRepository.ts:31`). Publicar ya es visible en el siguiente mensaje sin reiniciar. Lo que sí se cachea: `TenantConfig` (5 min), el status del tenant (30 s, `Bootstrap.ts:205`) y las credenciales de Meta. Todo es caché in-process; con una sola instancia hoy basta con invalidar localmente. Si algún día hay varias instancias, el paso 5 de la publicación del documento sí necesita un canal (p. ej. Postgres `NOTIFY`).

---

## 2. El documento contra el repo

| El documento dice | El repo dice | Qué cambia |
|---|---|---|
| Panel Next.js + Supabase + NextAuth v5, que actúa como BFF | Vite 8 + React 19 + TanStack Router/Query + Zustand + shadcn, compilado a `backend/public/app/` y servido por Express. Auth propia: `AuthRouter` + `AuthMiddleware`, cookie JWT | Sin BFF. El Studio es una ruta más del panel, y el tenant y el rol salen de `req.admin` |
| Roles `SuperAdmin` / `AdminOperador` | `super_admin` / `admin_operator`, con `requireRole` y `requireTenantScope` (`AuthMiddleware.ts:124`) | Mismo concepto. `requireTenantScope` ya impide que un operador vea otro tenant |
| Endpoints `/studio/...` | Todo lo administrativo vive bajo `/api/admin/tenants/:id/...` y pasa por el audit log (regla 7) | Propuesta: `/api/admin/tenants/:id/studio/...`. Ver D-3 |
| 10 condiciones de transición | **11**: la última fue `card_any` (carrusel dinámico) | Solo corrige el número |
| Tabla nueva `flow_versions` con `status` draft/published/archived | Ya existen `bot_flows.draft_json` (migración 015), `bot_flows.json_definition` (lo publicado) y `bot_flow_versions` (008, append-only con `unique(flow_id, version_number)`) | Extender lo existente en vez de crear una tabla paralela. Ver D-2 |
| Publicar = una transacción | **No es transaccional** (`SupabaseBotFlowRepository.ts:330`). Orden: insertar versión → desactivar hermanos → activar. Entre los dos últimos pasos no hay flow activo y un mensaje entrante recibe *"en mantenimiento"* | La Fase 4 necesita una función de Postgres (RPC) para publicar de forma atómica. **Hecho en la Fase 4** con `publish_flow_version` (migración 023); ver `FASE_4_VERSIONES.md` |
| Rollback = republicar una archivada | Ya existe: crea una versión **nueva** con el contenido viejo, solo `super_admin` (`flowsRouter.ts:210`) | Reutilizar. Falta que el rollback pase por validación: hoy no llama a `validateFlow`. **Hecho en la Fase 4:** valida (no corre las pruebas, D-4.2) |
| Publicar: solo SuperAdmin por default | Ya es así (`flowsRouter.ts:124`, decisión D5) | La decisión pendiente 1 parte de ahí |
| Simulador por construir | Ya existe: `SimulateMessageUseCase` + `POST /api/admin/simulate` + `WhatsAppSimulator.tsx` embebido en el Designer, con fuentes `active`/`draft`/`version`, `simulateAt` y `simulatedElapsedMinutes` | La Fase 1 lo **reemplaza por dentro**, no lo crea. Ver H-2 |
| Los moldes JSON "se validan en CI" | Los tres (`backend/scripts/*-flow.json`) pasan `validateFlow` hoy **[test]**, pero **ningún test los carga**: los tests copian su forma a mano | La Fase 2 agrega ese test |
| El Studio solo lee `pos_products` | El carrusel dinámico solo sabe leer `catalog_items` (legacy), porque `pos_products` no tiene columna de imagen (`flow.ts:69`) | Ver D-4 |
| Address messages solo en India y Singapur | Solo **India** **[doc Meta]** | El Studio no los ofrece; no cambia nada más |
| `AnthropicIntentRouter` no conectado | Confirmado: nada fuera de su archivo y sus tests lo instancia **[código]** | — |
| No menciona los bloques compuestos | Existen seis (#79) con `expand`/`assemble` y garantías por construcción (`BLOQUES_COMPUESTOS.md`) | Son la base natural del asistente de 8 pasos. Ver §5 |

---

## 3. El motor hoy

### 3.1. Los 14 tipos de nodo

`backend/src/domain/entities/flow.ts:447`. "Espera" = el intérprete se detiene ahí hasta el siguiente mensaje (`FlowInterpreter.ts:101`, `isWaitNode`).

| Nodo | Qué envía | Espera | Notas |
|---|---|---|---|
| `send_text` | texto | no | Avanza por `transitions[0]` |
| `send_buttons` | 1–3 botones de respuesta | sí | Sin encabezado ni pie en el tipo. El adaptador **descarta los ids** (H-3) |
| `send_list` | lista, secciones estáticas o dinámicas | sí | Sin encabezado ni pie. Lista vacía → `default` |
| `send_media` | imagen, documento o ubicación | no | Sin video, audio ni sticker |
| `send_cta_url` | botón CTA URL | no | |
| `send_location_request` | pedir ubicación | no | La ubicación que responde el cliente **se descarta** (H-4) |
| `send_media_carousel` | carrusel, cards literales o dinámicas | solo si es de quick_reply | Límites divergentes de Meta (H-5) |
| `send_reaction` | reacción al último mensaje del cliente | no | |
| `wait_input` | prompt opcional | sí | Guarda el texto en contexto. Única validación: `'numeric'` (C-04 parcial) |
| `search_catalog` | prompt opcional | sí | Busca en `pos_products` → `catalog_found` / `catalog_not_found` |
| `escape_to_human` | respuesta al cliente + alerta al dueño | no | Activa la pausa de 48 h en `BotController`. La alerta puede fallar fuera de ventana (H-6) |
| `request_call_permission` | solicitud de permiso de llamada | sí | **No es** el "botón de llamada" del documento. Ver D-7 |
| `end` | nada | — | Siguiente mensaje → arranca de nuevo |
| `send_whatsapp_flow` | WhatsApp Flow | no | La respuesta del formulario se descarta (H-4) |

### 3.2. Las 11 condiciones y su especificidad

`FlowInterpreter.ts:529`. Gana la de mayor puntaje entre las que matchean; el orden del array solo desempata dentro del mismo nivel (DEC-06, ADR-016).

| Condición | Puntaje | Qué matchea |
|---|---|---|
| `button` | 100 | id exacto **o** título igual ignorando mayúsculas (sin normalizar acentos ni signos) |
| `list_item` | 90 | id o título exacto de una fila estática |
| `call_permission_granted` / `_denied` | 85 | centinelas `__CALL_PERMISSION_*__` |
| `catalog_found` | 80 | hubo match en `pos_products` (con la excepción de servicios, DEC-03) |
| `service_directory_match` | 70 | match en el directorio de servicios |
| `list_item_any` / `card_any` | 60 | una fila o card que el cliente vio, por id (o por título en filas). Texto libre ya no cuenta como fila (#85) |
| `keyword` | 50 | `fuzzyIncludes` sobre la lista de palabras |
| `catalog_not_found` | 20 | no hubo match |
| `default` | 0 | siempre |

**Lo que el documento pide y el motor no tiene:** normalización sin acentos ni signos en `button`/`list_item` (solo `keyword` es difusa), desambiguación ante empate (B-02), contador de reintentos (ADR propuesto, sin decidir), branching por contexto (C-02), condición de horario como nodo (hoy el horario es un gate de `BotController`, antes del flow).

### 3.3. Palabras especiales, hardcodeadas

| Qué | Dónde | Valores |
|---|---|---|
| Escape global → reinicia el flow | `FlowInterpreter.ts:92` | `menu`, `salir`, `cancelar`, `inicio`. Cede ante una transición local del nodo |
| Opt-out real | `BotController.ts:37` | `stop`, `baja`, `no molestar`, `cancelar suscripcion` (con y sin acento). Confirma una vez; cualquier mensaje posterior es opt-in implícito |
| Reanudar handoff (solo el dueño) | `BotController.ts:28` | `#listo`, `#reanudar` |

**No hay palabra global para "asesor" o "humano".** Solo existe si el flow la declara como `keyword` en cada nodo. Es exactamente el hueco de V-CUMP-01.

### 3.4. Entradas del cliente

`MetaWhatsAppAdapter.parseIncomingMessage` (`:348`) convierte todo a un `content: string`.

| Entrada | Qué recibe el motor |
|---|---|
| Texto | el texto |
| Botón de respuesta | el **título** (los ids son sintéticos `btn_0..2`); en carrusel, el id real |
| Fila de lista | el **id** de la fila (`list_reply.id`); si viene vacío, el título. Hasta #85 era siempre el título (H-1) |
| Permiso de llamada | `__CALL_PERMISSION_GRANTED__` / `_DENIED__` |
| Respuesta de WhatsApp Flow | `__FLOW_RESPONSE__`; el payload se pierde en `ExpressServer.handleParsed` (H-4) |
| Ubicación | `__LOCATION__`; lat/lng se pierden igual (H-4) |
| Imagen, audio, video, documento, sticker, contacto, reacción, no soportado | **nada**: el parser devuelve `null` y el cliente no recibe respuesta (H-8) |

### 3.5. Dependencias ocultas que estorban a la simulación

- **Reloj:** `new Date()` / `Date.now()` en `BotController` (`:107`, `:167`, `:262`), `SimulateMessageUseCase`, `OwnerAlertFormatter.ts:21` y `FlowInterpreter.maybeGenerateOrderId` (`:1009`). `BusinessHoursService.isOpenNow` sí acepta `now` por parámetro.
- **Aleatoriedad:** `order_id` usa `Math.random()` (`FlowInterpreter.ts:1010`) y `flow_token` también (`MetaWhatsAppAdapter.ts:895`). Sin inyectarlos, el test de paridad de la Fase 1 no puede comparar payloads byte a byte.
- **Hexagonal:** `VariableResolver` (dominio) importa el tipo `SupabaseClient` y lo recibe en el constructor sin usarlo nunca **[código]**. Es la única importación de `@supabase` bajo `domain/`.

---

## 4. Qué usa cada molde

Contado sobre los JSON de `backend/scripts/`.

| | Cerrajería | Papelería | SegurITech |
|---|---|---|---|
| Nodos | 15 | 20 | 18 |
| Tipos | `send_buttons` 6 · `send_list` 2 · `wait_input` 2 · `escape_to_human` 3 · `send_text` 1 · `end` 1 | `send_buttons` 7 · `wait_input` 3 · `escape_to_human` 6 · `send_list` 1 · `search_catalog` 1 · `send_text` 1 · `end` 1 | `send_text` 6 · `send_buttons` 2 · `wait_input` 4 · `escape_to_human` 5 · `end` 1 |
| Condiciones | `button` 16 · `keyword` 16 · `default` 14 · `list_item_any` 2 | `button` 19 · `keyword` 14 · `default` 18 · `service_directory_match` 2 · `list_item_any` 1 · `catalog_found` 1 · `catalog_not_found` 1 | `default` 17 · `button` 6 |
| Validación en `wait_input` | ninguna | `pedido_cantidad`: `numeric` | ninguna |
| Listas dinámicas | no | `menu_servicios` desde `service_directory` (H-1, resuelto en #85) | no |
| Variables | `welcome_message`, `menu_message`, `not_understood_message`, `nombre_negocio`, `phone`, `last_message`, `datos_emergencia`, `detalle_servicio`, `tipo_emergencia`, `servicio` | `welcome_message`, `menu_message`, `not_understood_message`, `nombre_negocio`, `phone`, `last_message`, `order_id`, `lista_escolar_detalle`, `detalle_servicio`, `cantidad_producto`, `matched_service_name`, `matched_service_response`, `selected_product_name`, `selected_product_price` | `phone`, `contacto_basico`, `contacto_estandar`, `contacto_premium`, `contacto_mantenimiento` |
| Pasa `validateFlow` | sí **[test]** | sí **[test]** | sí **[test]** |

Entre los tres usan 7 de los 14 tipos. SegurITech enruta solo por botón y `default`, sin una sola `keyword`: llega a humano por sus botones, pero un cliente que escribe "asesor" no tiene cómo pedirlo. Es el caso que V-CUMP-01 debe atrapar.

---

## 5. El Designer, el Guion, el simulador y los bloques

| Pieza | Dónde | Qué hace |
|---|---|---|
| **Designer** | `frontend/src/apps/panel/routes/tenants.$id.designer.tsx` (1561 líneas) + `apps/panel/designer/` (~2000) | Canvas React Flow con los 14 tipos, paleta, menú contextual, inspector por tipo, editor de transiciones, panel de versiones con "restaurar como borrador", validación en vivo (`graphValidator.ts`, capa L1), publicar, simulador embebido. Mapeo bidireccional `to-react-flow` / `to-bot-flow` |
| **Guion** | `routes/tenants.$id.guion.tsx` (247 líneas) | Edita los textos `config_bound` (bienvenida, menú, no entendí) con concurrencia optimista |
| **Simulador** | `shared/simulator/WhatsAppSimulator.tsx` | Burbujas por tipo de salida. Al tocar manda lo mismo que entregaría Meta: el título de un botón, el id de una fila o de una card (`replies.ts`, desde #85), con el título en la burbuja. Toggle de fuera de horario y de sesión expirada |
| **Bloques** | `backend/src/domain/blocks/` + `POST .../blocks/expand` y `.../assemble` | Seis bloques (Entrada, Menú, Consulta de catálogo, Captura y escalado, Cotizador, Cierre) que se expanden a nodos y se ensamblan en un grafo que pasa L1 y L2. **Ninguna pantalla los usa todavía** |
| **Espejo de tipos** | `designer/flow-types.ts` | Copia a mano de `flow.ts`; le faltan `service_directory_match`, `catalog_found`, `catalog_not_found` |

**Recomendación: reutilizar, no construir en paralelo.** El Designer ya *es* el modo avanzado del documento (§4.2): edita el mismo `BotFlow`. El asistente de 8 pasos (§4.1) es una ruta nueva que produce un `BotFlow` vía `assemble()` y lo guarda en el mismo borrador. Así el modo sencillo y el avanzado editan el mismo modelo por construcción. Lo que sí hay que reemplazar es el **interior** del simulador (H-2), no su pantalla.

---

## 6. Verificación contra la documentación de Meta (2026-09-10)

Consultado ese día en `developers.facebook.com/documentation/business-messaging/whatsapp/…` y en la política de WhatsApp Business. Los números verificados quedaron en `backend/src/domain/whatsapp/limits.ts`, cada grupo con su enlace.

### 6.1. Mensajes (§5 del documento)

| Tipo | El documento | Meta dice | El repo aplica hoy |
|---|---|---|---|
| Texto | cuerpo 4096 | **4096** ✔ | 4096 ✔ |
| Botones | 3 botones · título 20 · id 256 · cuerpo 1024 · header texto 60 o medio · pie 60 | 3 · 20 · 256 · 1024 · header text/image/video/document · pie 60 ✔. **El largo del header de texto no aparece** en la página | Sin header ni pie en el nodo; ids sin tope; ids descartados al enviar |
| Lista | botón 20 · 10 filas en ≤10 secciones · fila 24 · desc. 72 · sección 24 · header solo texto 60 · cuerpo 4096 · pie 60 | Todo ✔, más **id de fila ≤ 200** | Cuerpo ≤ **1024** (más estricto); sin header ni pie; id de fila sin tope |
| CTA URL | botón 20 · cuerpo 1024 · header texto/imagen/video/doc · pie 60 | ✔ (header de texto 60). La doc **no fija largo de URL** | ✔; URL ≤ 2000 como regla propia |
| Carrusel | 2–10 cards · cuerpo 1024 sin header ni pie · card con imagen/video, cuerpo ≤160 y ≤2 saltos · 1 botón URL o quick replies, iguales en tipo y cantidad · etiqueta 20 | Todo ✔. Quick replies: *"one or more"*, sin máximo explícito | **1**–10 cards; cuerpo de card ≤ **1024** y obligatorio; exige mismo **tipo** pero no misma **cantidad** de botones |
| Solicitud de ubicación | cuerpo 1024, sin header ni pie | Cuerpo 1024 ✔. La doc solo documenta `body` | ✔ (`.strict()`) |
| Imagen / documento | pie 1024 | Pie 1024 ✔. Imagen JPEG/PNG ≤ 5 MB; documento ≤ 100 MB. **Sin tope de filename** | Filename ≤ 240 como regla propia |
| Address messages | India y Singapur | **Solo India** | No existen, correcto |
| CTA URL + botones de respuesta en un solo mensaje | "verificar" | **La página de CTA URL no lo menciona** | — |

### 6.2. Reglas de envío (§7.7)

| Tema | Meta dice | Estado en el repo |
|---|---|---|
| Ventana de 24 h | Se abre con cada mensaje **o llamada** del cliente y se reinicia con cada uno ✔ | Se registra `last_inbound_at` (PR #57) pero **ningún envío la consulta**. Hoy casi no hace falta, porque todo envío responde a un mensaje entrante. La excepción es la alerta al dueño (H-6) |
| Orden de entrega | *"not guaranteed to match the order of your API requests"* ✔ | Varios mensajes por turno se envían en serie sin esperar `delivered` |
| Prefijo MX | *"For Brazil and Mexico, the extra added prefix … may be modified by the Cloud API"* ✔ | `isOwnerPhone` compara solo dígitos; `521…` contra `52…` no coincide **[código]** |
| Caché de medios | 10 min por URL ✔ | — |
| TTL | 30 días (autenticación 10 min) ✔ | — |
| Calidad | bloqueos, reportes, silenciados, archivados y motivos de bloqueo ✔ (la ventana de 7 días no aparece en esa página) | — |
| Límites de mensajería | Solo cuentan los envíos **fuera** de la ventana; niveles 250 / 2 000 / 10 000 / 100 000 / ilimitado | — |

### 6.3. Precios (§7.6)

| El documento | La doc oficial hoy |
|---|---|
| Desde el 1 de octubre de 2026 los mensajes de servicio se cobran por mensaje entregado, con 1 000 gratis por número al mes | **No aparece.** La página de precios dice: *"All non-template messages are free"* |
| Las plantillas utility dentro de la ventana se empiezan a cobrar | La página dice que son **gratis** desde el 1 de julio de 2025. Para octubre de 2026 solo anuncia ajustes de tarifas por país |
| El objeto `pricing` del webhook de estado | ✔ `billable`, `pricing_model`, `type`, `category` |

El cambio de octubre **sí lo reportan** varios proveedores oficiales ([YCloud](https://www.ycloud.com/blog/whatsapp-api-message-pricing-update-effective-october-1-2026), [SendPulse](https://sendpulse.com/blog/whatsapp-service-message-pricing), [Zendesk](https://support.zendesk.com/hc/en-us/articles/11113277351322-Announcing-upcoming-changes-to-WhatsApp-Business-messaging-pricing)), con las mismas cifras del documento. **[no verificado]** en la fuente oficial: queda como riesgo probable, no como regla. Ver D-6.

### 6.4. Política (§7.2–7.5)

| Tema | Meta dice |
|---|---|
| Paso a humano | *"must also have available prompt, clear, and direct escalation paths"*: chat con humano, teléfono, correo, web, tienda o formulario ✔. Cualquiera de esas vías cumple, no solo el humano en el chat |
| Opt-in | Hace falta permiso del destinatario para mensajes posteriores ✔ |
| Opt-out | Hay que respetar toda solicitud de bloqueo o baja y sacar a la persona de la lista ✔ |
| Datos sensibles | *"Do not share or ask people to share full payment card numbers, bank account numbers, personal ID numbers or other sensitive identifiers"* ✔. Contraseñas no aparecen de forma literal; entran en "other sensitive identifiers" |
| IA (enero de 2026) | No está en la página de política. Está en los *WhatsApp Business Solution Terms*: prohibidos los "AI Providers" cuando la IA es la funcionalidad principal, vigente desde el 15 de enero de 2026; los bots de tareas del negocio siguen permitidos. **[no verificado]** en los Terms directamente, solo en fuentes secundarias ([TechCrunch](https://techcrunch.com/2025/10/18/whatssapp-changes-its-terms-to-bar-general-purpose-chatbots-from-its-platform), [respond.io](https://respond.io/blog/whatsapp-general-purpose-chatbots-ban)). Honestidad y no entrenar con conversaciones son reglas internas del documento, no de Meta |

---

## 7. Mapa: tipo de paso del Studio ↔ nodo del motor

Regla 2 del documento: un campo solo aparece en la UI si el motor lo ejecuta. **Existe** = se puede exponer hoy · **Parcial** = se expone con lo que hay · **Falta** = trabajo de motor antes de exponerlo.

### 7.1. Mensajes salientes

| Paso del Studio | Nodo | Estado | Qué falta |
|---|---|---|---|
| Texto | `send_text` | Existe | Vista previa de enlace (`preview_url`) |
| Botones de respuesta | `send_buttons` | Parcial | Encabezado y pie; conservar ids al enviar (H-3) |
| Lista | `send_list` | Parcial | Encabezado y pie (los ids de fila ya viajan desde #85) |
| Botón CTA URL | `send_cta_url` | Existe | — |
| Carrusel | `send_media_carousel` | Parcial | Alinear límites con Meta (H-5) |
| Solicitud de ubicación | `send_location_request` | Parcial | Capturar la ubicación que responde el cliente (H-4) |
| Ubicación | `send_media` (`location`) | Existe | — |
| Imagen, documento | `send_media` | Existe | — |
| Video, audio, sticker | — | Falta | Tipos nuevos en `SendMediaContent` y en el adaptador |
| Contacto | — | Falta | Nodo nuevo |
| Reacción | `send_reaction` | Existe | — |
| Botón de llamada | — | Falta | `request_call_permission` es otra cosa (D-7) |
| WhatsApp Flow | `send_whatsapp_flow` | Parcial | Capturar la respuesta (H-4). Fase 9 |
| Catálogo de Meta | — | Falta | Fase posterior |
| Plantilla | — | Falta | `TemplatePort` y tabla. Fase 7 |
| "Escribiendo" / marcar leído | — | Falta | C-07, bloqueado por A-01 |

### 7.2. Pasos de lógica

| Paso del Studio | Hoy | Estado |
|---|---|---|
| Captura con validación | `wait_input` + `validation: 'numeric'` | Parcial: faltan teléfono MX, correo, rango, fecha, largo, reintentos (C-04) |
| Condición de horario | Gate en `BotController`, antes del flow | Falta como paso: no se puede ramificar dentro del flow |
| Condición por variable, cliente nuevo o recurrente, origen | — | Falta (C-02) |
| Asignar variable | — | Falta |
| Consulta de catálogo | `search_catalog` | Existe |
| Paso a humano | `escape_to_human` | Existe; destino fijo `owner_data.whatsapp_dueno` |
| Fin de conversación | `end` | Existe |
| Reintentos antes de escalar | — | Falta. Depende del ADR del contador, sin decidir |

### 7.3. Bloques compuestos que ya cubren pasos del asistente

| Paso del asistente (§4.1) | Bloque |
|---|---|
| 2. Primer mensaje | Entrada + Menú (el Menú elige botones o lista según el número de opciones) |
| 3. Opciones | Captura y escalado, Consulta de catálogo, Cotizador |
| 6. Paso a humano | Captura y escalado |
| 7. Despedida | Cierre |
| 1, 4, 5, 8 | Sin bloque: datos del negocio, reconocimiento, "no entendí" y publicar son configuración, no subgrafos |

---

## 8. Hallazgos

| # | Hallazgo | Evidencia | Severidad |
|---|---|---|---|
| **H-1** ✅ | **Resuelto en #85 (`bcfecc7`).** Las filas de listas dinámicas entraban por título, no por id: el parser usaba `list_reply.title` y `list_item_any` sobre una sección dinámica aceptaba cualquier texto y lo guardaba crudo, mientras el `VariableResolver` busca por id. En `menu_servicios` de papelería el cliente tocaba "Engargolado" y recibía *"Perfecto, \*\*. Dinos cuántas hojas…"*; el simulador del panel lo reproducía porque también mandaba el título. **Ahora:** el parser entrega el id (`MetaWhatsAppAdapter.ts:386`); `FlowInterpreter.resolveListItemId` (`:722`) resuelve la fila contra las filas hidratadas, por id o por título escrito; el simulador manda lo que entregaría Meta. **Cambio de comportamiento:** un texto que no es ninguna fila, o una palabra de escape, cae al `default` del nodo en vez de avanzar con un dato basura | Reproducido antes con un test desechable. Ahora cubierto por `FlowInterpreter.listReplyById.test.ts` (molde, parser y `VariableResolver` reales; sin el arreglo fallan 5 de 15), `MetaWhatsAppAdapter.buttonReplyId.test.ts` y `frontend/src/shared/simulator/replies.test.ts` | Era alta: afectaba un molde sembrado, sin impacto real porque Meta aún no está conectado (A-01) |
| **H-2** ✅ | **Resuelto.** La Fase 1 (#87) puso el simulador del Studio sobre el motor de producción, y el 2026-09-11 se borraron la copia vieja (`SimulateMessageUseCase`, `POST /api/admin/simulate`) y la página `/simulator/<uuid>`. Lo que era: **el simulador duplica la orquestación de producción.** `SimulateMessageUseCase` copia a mano los gates de `BotController`. No simula el opt-out ni la pausa por handoff; el horario solo aplica con `simulateAt` y la sesión solo con `simulatedElapsedMinutes`; no produce payloads de Meta, solo `InterpreterOutput` | **[código]** `SimulateMessageUseCase.ts:88` contra `BotController.ts:69` | Alta para el Studio: rompe la garantía 1 del documento |
| **H-3** | **`sendButtons` descarta los ids del nodo** y manda `btn_0..2` (`MetaWhatsAppAdapter.ts:503`). En producción los botones se reconocen solo por título. Un título con `{{variable}}` no matchearía nunca, porque `matchesCondition` compara contra el título sin resolver (`FlowInterpreter.ts:630`) | **[código]**. El caso del título con variable no se reprodujo | Media |
| **H-4** | **La ubicación y la respuesta de un WhatsApp Flow se pierden.** El parser las extrae, pero `handleParsed` solo pasa `from`, `content` y `messageId` (`ExpressServer.ts:433`) | **[código]** | Media: `send_location_request` y `send_whatsapp_flow` no pueden capturar nada |
| **H-5** | **Se pueden publicar carruseles que Meta rechaza:** 1 sola card, o cuerpo de card de más de 160 caracteres o más de 2 saltos de línea. Un carrusel dinámico con un solo producto con foto genera 1 card: el resolver solo desvía el caso de 0 (`CarouselCardResolver.ts:39`, `FlowInterpreter.ts:417`) | **[código]** + **[doc Meta]**. El 400 de Meta no se probó en vivo | Media |
| **H-6** | **La alerta al dueño es un mensaje libre iniciado por el negocio** (`BotController.ts:405`). Si el dueño no le escribió al número del bot en las últimas 24 h, Meta la rechaza. El cliente sí recibe su respuesta (el envío es best-effort), pero el dueño no se entera del lead | **[código]** + **[doc Meta]**: *"Non-template messages can only be sent within an open customer service window"*. No probado en vivo | Alta para la decisión pendiente 4 |
| **H-7** | **Publicar no es atómico** (§2) | **[código]** | Media |
| **H-8** | **Audio, imagen, sticker, video, documento, contacto y reacción entrantes se ignoran en silencio.** El cliente no recibe nada | **[código]** `MetaWhatsAppAdapter.ts:429` | Media: es V-EST-09 del documento, y hoy no hay motor para cumplirla |
| **H-9** | **La comparación de teléfonos no normaliza el prefijo MX** (521 contra 52) | **[código]** `BotController.ts:498` | Baja hoy; importa para identificar contactos |

---

## 9. Ajustes propuestos a las fases

- **Fase 1 — Motor observable.** Además de la traza: extraer la orquestación de `BotController` (opt-out, pausa, sesión, horario, intérprete, persistencia) a **un** caso de uso de dominio que usen el webhook y el simulador; `SimulateMessageUseCase` queda como adaptador con fakes. Mover el armado de payloads de Meta a una función pura, compartida por el adaptador real y el `CapturingMessenger`, para que "payloads exactos" sea cierto por construcción. Inyectar `ClockPort` y un generador de ids (§3.5). Sin esto, el test de paridad no es posible.
- **Fase 2 — Validador.** Un solo validador de dominio que absorba `flowSchema.ts` (L2), `validators/graphRules.ts` (el puerto de L1 que usan los bloques) y las reglas de `graphValidator.ts` (L1), leyendo de `limits.ts`. Cerrar las divergencias de §6.1. Test que valide los tres moldes JSON en CI.
- **Fase 3 — Studio sencillo.** Ruta nueva del panel Vite que arma el flow con los bloques compuestos y lo guarda en el mismo borrador que el Designer.
- **Fase 4 — Versiones.** Extender `bot_flow_versions` (`validation_report`, `test_report`) y crear `flow_test_cases` con `tenant_id` + RLS; publicación atómica vía función de Postgres; que el rollback valide.
- **Fase 5 — Control de respuestas.** Reintentos antes de escalar requiere decidir primero el ADR del contador.

---

## 10. Decisiones que necesito de OVY

Nuevas, salidas de este inventario:

| # | Pregunta | Recomendación |
|---|---|---|
| D-1 ✅ | ¿Arreglo H-1 (listas por id) ahora, en un PR `fix/` aparte, antes de la Fase 1? | **Decidida: sí.** Hecho en #85 |
| D-2 | ¿Versionado sobre las tablas existentes o tabla `flow_versions` nueva como dice el documento? | Existentes. Dos fuentes de verdad es justo lo que el proyecto ya pagó caro |
| D-3 | ¿Prefijo de los endpoints: `/api/admin/tenants/:id/studio/...`? | Sí: hereda `requireTenantScope` y el audit log sin código nuevo |
| D-4 | El carrusel dinámico lee `catalog_items` (legacy) porque `pos_products` no tiene imagen. ¿Agregamos `imagen_url` a `pos_products` o el Studio no ofrece carrusel dinámico por ahora? | Columna en `pos_products`, en su propia migración, antes de la Fase 6 |
| D-5 ✅ | ¿Se decide el ADR del contador de reintentos? El paso 5 del asistente ("intentos antes de escalar") no se puede construir sin él | **Decidida el 2026-09-11 (D-5.2):** un contador por captura, como se hizo en #93 |
| D-6 | El cobro de octubre no está en la doc oficial. ¿V-COSTO-01/02 igual como avisos? | Sí, como avisos: fusionar mensajes es buena práctica cobren o no. La métrica contra la cuota, hasta que Meta lo publique |
| D-7 | "Botón de llamada" del documento (CTA de voz) contra `request_call_permission` (pedir permiso para llamar). ¿Cuál quieres? | Aclarar antes de la Fase 6 |

Las cinco del documento (§16) quedaron decididas el 2026-09-11 y el 2026-09-12; la tabla está en el ROADMAP, sección «Studio de chatbots». Sobre la 4 (por H-6, el WhatsApp libre al dueño falla en cuanto pasa 24 h sin escribirle al bot): siempre en el panel, y por WhatsApp solo con su ventana abierta; sin plantilla utility por ahora.
