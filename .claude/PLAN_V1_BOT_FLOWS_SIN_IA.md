# ChatBot — V1 sin IA (Documento 2 de 2)

> **Nombre del producto:** ChatBot (SegurITech). La versión futura con IA se llamará **ChatBot Pro** — pausada, no forma parte de este documento. Ver nota de pausa en `.claude/SEGURITECH_AI_SECRETARIA_PLAN.md`.
>
> **Prioridad confirmada:** papelería primero. Es el negocio real que ya existe para desarrollar ahora — cerrajería y ferretería siguen en el documento como diseño general del motor, pero el orden de ejecución arranca en papelería.
>
> **Companion:** `PLAN_SOLUCION_HALLAZGOS_PENDIENTES.md` (Documento 1) — lo que hay que cerrar antes o en paralelo (seguridad, cumplimiento Meta). No repetido aquí.
>
> Diseño de la primera versión que debe servir, con el mismo motor, a papelería, cerrajería, ferretería (y cualquier giro futuro). Parte de lo que **ya existe y funciona** en el repo — no propone reconstruir nada desde cero.
>
> **Creado:** 2026-08-20. **Verificación previa a guardar (2026-08-20):** se confirmaron contra el código real, antes de dejar este documento como referencia, los siguientes puntos citados abajo: existencia de `backend/scripts/cerrajeria-flow.json` y `seed-cerrajerias.ts`, existencia de `backend/src/domain/moulds/papeleria.config.ts`, que `PosRouter.ts` solo define rutas `GET` (cero `POST/PUT/PATCH/DELETE`), y el schema exacto de `catalog_items` (`001_full_schema.sql`) y `pos_products` (`011_pos_module_bootstrap.sql`). Una corrección al texto original: §2.1 decía que `selected_product_id/name/price` son claves "sin consumidor" — **no es exacto**, `VariableResolver.ts:87-98` ya sabe resolverlas a texto desde `user.context`. Lo que falta no es activarlas, es que algún nodo (`search_catalog`) las **escriba** en el contexto — el resto de la conclusión del documento (no hay que inventar claves nuevas) se mantiene igual.

---

## 0. Arquitectura — lo que NO cambia

**Motor de mensajería:** Meta Cloud API v23.0, tal como ya está. No `Baileys`, no ninguna librería de conexión no-oficial — decisión ya tomada y documentada en el MAESTRO, y la razón sigue vigente: Baileys arriesga el número por ToS.

**Motor de conversación:** `FlowInterpreter` + `bot_flows` (JSON por tenant) + `BotController.processMessage`. No se reemplaza por un controlador de estado en memoria — ya hay persistencia real en `bot_users.current_node_id`/`context`, que sobrevive a reinicios del proceso; un estado en memoria no.

**Base de datos:** Supabase Postgres, ya modelado multi-tenant con RLS. No SQLite en ningún punto — ni en el bot ni en el POS.

Lo único que se agrega en este documento son **servicios nuevos de dominio** (`search_catalog`, horario real) y **mejor uso del catálogo de nodos que ya existe** — no arquitectura nueva.

---

## 1. Estado real por giro, verificado — para no partir de una idea equivocada

Hay una distinción que vale la pena tener clara: el repo tiene **dos conceptos de "molde" separados**, no uno:

| Concepto | Qué es | Estado real |
|---|---|---|
| **Molde de POS** (`domain/moulds/*.config.ts`) | Categorías + productos de ejemplo para sembrar el catálogo del punto de venta | Solo existe `papeleria.config.ts` (con SKUs, precios, stock). Ferretería/cerrajería/pizzería: no existen. |
| **Flow de WhatsApp** (`bot_flows`, JSON por tenant) | La conversación real que el cliente tiene con el bot | **Cerrajería SÍ existe** — `backend/scripts/cerrajeria-flow.json`, sembrado a CerraCruz y Tony vía `seed-cerrajerias.ts`, ya "endurecido" (anti-loop, confirmar antes de escalar). **Papelería y ferretería: no tienen flow de WhatsApp propio todavía** — el trabajo de papelería fue hacia el POS, no hacia el bot. |

**Consecuencia práctica para este plan:** no se parte los tres giros del mismo punto. Cerrajería necesita mejora (upgrade de nodos básicos a nodos ricos). Papelería y ferretería necesitan flow desde cero.

**El dato que más importa:** el flow real de cerrajería, revisado nodo por nodo, usa exactamente **6 de los 13 tipos de nodo** que soporta `FlowInterpreter`: `send_buttons`, `escape_to_human`, `send_list`, `wait_input`, `send_text`, `end`. Cero uso de carrusel, ubicación, CTA URL, reacciones, permiso de llamada, o WhatsApp Flows nativos — ni siquiera en el flow más maduro. Ahí está la ganancia disponible sin escribir una sola línea de motor nuevo: solo diseñar mejor el JSON del flow.

---

## 2. Lo que falta construir — Core, no Molde (sirve a los 3 giros por igual)

### 2.0 Decisión de arquitectura: ¿de dónde lee el bot el catálogo? (resolver esto ANTES de 2.1)

El proyecto tiene **dos tablas de catálogo separadas y sin sincronizar** (verificado, schemas exactos abajo):

| Tabla | Migración | Campos | Para qué está pensada |
|---|---|---|---|
| `catalog_items` | `001_full_schema.sql` | `nombre_producto`, `descripcion`, `precio`, `categoria` (texto libre), `disponible`, `imagen_url` | Catálogo chico para las listas fijas de máx. 10 ítems del bot (`send_list`) |
| `pos_products` | `011_pos_module_bootstrap.sql` | `sku`, `barcode`, `name`, `description`, `category_id` (FK real), `unit_type`, `unit_price`, `cost_price`, `tax_rate`, `stock_qty`, `stock_min`, `unique(tenant_id, sku)` | El inventario real y completo del negocio — es donde `papeleria.config.ts` ya modela ~40 productos de ejemplo con SKU/stock/precio |

**Decisión (recomendada, no la única posible):** `search_catalog`/`CatalogSearchService` debe consultar **`pos_products`**, no `catalog_items`. Es la fuente completa y real — exactamente lo que se quiere decir cuando se dice "captura todos los artículos de la papelería y dáselos al bot". `catalog_items` se queda como está, para las listas fijas cortas que ya funcionan (`send_list`); no hace falta migrarla ni borrarla, simplemente el buscador de texto libre no la usa como fuente.

**Implicación técnica:** `CatalogSearchService` reutiliza el repositorio de productos POS que ya existe (usado hoy por `PosRouter.ts`) — no se construye un acceso a datos nuevo, solo se invoca desde un contexto distinto (el flow del bot, no el POS).

### 2.0-bis El bloqueador real: hoy no hay forma de cargar el catálogo completo

Verificado en `PosRouter.ts`: **solo existen endpoints de lectura** (`GET /products`, `/products/lookup`, `/products/:id`, `/categories`, `/config`). No hay `POST` de creación, no hay edición, no hay importación masiva. Tampoco hay pantalla en el frontend para gestionar productos.

**Esto es, en la práctica, el ticket #1 de todo el plan de papelería.** Sin esto, "capturar todos los artículos" significa que un desarrollador teclea SQL a mano por cada producto — no escala a 150-500 SKUs.

**Diseño mínimo viable:**
- Endpoint `POST /api/admin/tenants/:id/pos/products/import` que reciba un CSV/Excel (nombre, SKU, categoría, precio, stock) y haga upsert masivo por `(tenant_id, sku)` — el `unique(tenant_id, sku)` ya existe en el schema, así que reimportar el mismo archivo no duplica.
- Pantalla simple en el panel: subir archivo, ver preview de cuántas filas se van a crear/actualizar, confirmar.
- Validación con Zod (mismo patrón que usa todo el resto del admin API) antes de tocar la base de datos — fila inválida se reporta, no tumba el import completo.

### 2.1 `search_catalog` + `CatalogSearchService`

**El gap que resuelve:** hoy `send_list` con `items_source: 'catalog_items'` muestra máximo 10 ítems fijos (límite real de Meta, en `DynamicSectionResolver.ts`). Si el cliente pregunta en texto libre — "¿tienen tornillos de 2 pulgadas?", "¿hacen copia de llave de auto?" — el bot no tiene forma de contestar hoy.

**Diseño:**
- Nodo nuevo `search_catalog`, mismo patrón que `wait_input` (captura texto libre del cliente).
- `CatalogSearchService` en `domain/services/`: normaliza texto (minúsculas, sin acentos), compara contra `name`/`category`/`description` de `pos_products` (fuente decidida en §2.0 — completa y real, no `CatalogItem`).
- Diccionario de sinónimos **por giro** — esto sí es "molde", va en `domain/moulds/` o similar, no en el servicio de dominio: ferretería ("desarmador"~"destornillador", "cinta métrica"~"flexómetro"), cerrajería ("copia de llave"~"duplicado"), papelería ("libreta"~"cuaderno").
- Nuevas condiciones de transición `catalog_found` / `catalog_not_found` (mismo patrón que `TransitionCondition` ya tiene con `button`/`list_item`/`keyword`).
- Al encontrar match: guarda en contexto usando las claves `selected_product_id`, `selected_product_name`, `selected_product_price` — **ya resueltas a texto por `VariableResolver.ts:87-98`**, solo falta que este nodo las escriba en `user.context`. No hay que inventar claves nuevas ni tocar el resolver.
- Sin match: **nunca inventa** — transición directa a `escape_to_human` (nodo que ya existe y ya funciona).

### 2.2 `BusinessHoursService`

**El gap que resuelve:** `horario_semana`/`horario_sabado` existen como texto libre en `tenants` (columnas reales en Supabase, editable en el panel), y `out_of_hours_message` existe como variable resolvible (`VariableResolver.ts` ya la resuelve a texto) — pero **nada compara la hora actual contra el horario real**. Hoy el bot puede decir "sí, claro, ven a las 3am".

**Diseño:** servicio que parsee el texto de horario (formato a definir — recomendado: forzar un formato simple tipo `"09:00-19:00"` en el panel en vez de texto totalmente libre, para que sea parseable sin ambigüedad) y gatee el flow ANTES de responder — mismo punto de inserción que el gate de handoff humano que ya existe en `BotController.processMessage` (justo después de cargar `config`, antes de ejecutar el `FlowInterpreter`).

### 2.3 Opt-out y ventana 24h

Cubiertos en el Documento 1 (Bloque 2) — son compliance de Meta, no features de producto, pero técnicamente viven en el mismo punto del código (`BotController`, antes de enviar cualquier salida).

---

## 3. Lo que sí es Molde — diseño concreto por giro

Aquí es donde el bot pasa de "funcional" a "se ve como el de una marca grande" — usando nodos que ya existen y sin explotar.

### 3.1 Ferretería (desde cero)

Sketch de flow usando 5 de los 13 tipos de nodo:

1. `send_text` — bienvenida con nombre del negocio.
2. `send_buttons` — "1. Ver catálogo · 2. Buscar un producto · 3. Hablar con alguien".
3. Si elige catálogo: `send_media_carousel` por categoría (tornillería, herramienta eléctrica, pintura...) — tarjetas con imagen + nombre + precio, no lista de texto plano. Esto es lo que hace que se sienta "de catálogo real" y no de menú de IVR.
4. Si elige buscar: `search_catalog` (2.1) → si encuentra, `send_buttons` con "Agregar a pedido" / "Ver otro" → si no, `escape_to_human`.
5. Al cerrar pedido: `send_location_request` para saber si es para entrega o recolección en tienda.
6. `send_reaction` (👍) sobre el mensaje de confirmación del cliente — detalle pequeño, remata la sensación de atención real.

### 3.2 Papelería — PRIORIDAD ACTUAL (el POS mould ya tiene la forma de los datos, falta cargarlos de verdad y falta el flow)

Diferenciador real del giro: temporada de regreso a clases (ya documentado en `papeleria.config.ts`: `seasonalSpikes: ['agosto', 'septiembre', 'enero']`) y venta de servicios (impresión, fotocopia, engargolado — ya en `sampleProducts` con `unitType: 'service'`).

**Orden real para este giro específicamente** (no se puede saltar directo al flow):

1. Construir la herramienta de carga de catálogo (§2.0-bis) — sin esto no hay datos reales que mostrarle al bot.
2. Cargar el inventario real de la papelería vía esa herramienta.
3. `search_catalog` + `CatalogSearchService` sobre `pos_products` (§2.1) — ahora sí tiene sentido, hay datos reales que buscar.
4. El flow de conversación:
   - `send_buttons` — "1. Lista escolar · 2. Servicios de impresión · 3. Buscar producto".
   - Lista escolar: candidato perfecto para `send_whatsapp_flow` (formulario multipantalla nativo) — el cliente llena grado escolar + escuela, el bot arma automáticamente qué productos corresponden a esa lista, consultando `pos_products` ya cargado. Esto es lo más "premium" que se puede mostrar en una demo: es la misma tecnología que usan las marcas grandes para checkout dentro del chat.
   - Servicios: `send_list` simple (no necesitan carrusel, son pocos ítems sin imagen relevante).
   - `search_catalog` disponible siempre como fallback desde el menú.

### 3.3 Cerrajería (upgrade del flow existente — no desde cero)

El flow actual (`cerrajeria-flow.json`) ya está bien diseñado en lógica (anti-loop, confirmar antes de escalar) — el upgrade es de presentación, no de lógica:

1. Los 3 nodos `escape_to_human` actuales (emergencia, no resuelto por flow, petición explícita) — agregar `request_call_permission` justo antes de escalar en el caso de emergencia: pedirle permiso al cliente para que el negocio lo llame directo es más rápido que seguir escribiendo en una urgencia real (encerrado afuera de casa, por ejemplo).
2. Los 2 `send_list` actuales (probablemente servicios/tarifas) — candidatos a `send_media_carousel` si hay fotos de los servicios (apertura de auto, cambio de cerradura, caja fuerte), o se quedan como lista si el catálogo es puramente de servicios sin imagen relevante — usar el juicio, no forzar carrusel donde no aporta.
3. Agregar `search_catalog` para preguntas tipo "¿hacen llaves de control remoto de auto?" que hoy el flow de 15 nodos no puede resolver en texto libre.

---

## 4. Lo que este documento NO cubre (a propósito)

- Test cases como gate de publicación (Camino H) — depende de que los flows de este documento existan primero para tener algo que probar.
- Moldes de POS para ferretería/cerrajería — es un proyecto aparte (Fase 2, después de que WhatsApp tenga clientes pagando).
- Todo lo de cumplimiento Meta (24h, opt-out) — vive en el Documento 1, aunque comparte punto de inserción en el código.

---

## 5. Orden sugerido de prompts para Claude Code (papelería primero, confirmado)

1. **Herramienta de carga de catálogo** (§2.0-bis) — endpoint de import + pantalla simple en el panel. Sin esto, nada de lo demás tiene datos reales que usar.
2. Cargar el inventario real de la papelería con esa herramienta.
3. `CatalogSearchService` + nodo `search_catalog`, apuntando a `pos_products` (§2.0 + §2.1) — Core, sirve también a cerrajería/ferretería después sin cambios.
4. `BusinessHoursService` (Core).
5. Flow de papelería completo (§3.2) — incluyendo el `send_whatsapp_flow` de lista escolar, el más vistoso para demo.
6. Flow de ferretería desde cero (§3.1) — cuando ferretería sea el siguiente negocio real a atender.
7. Upgrade del flow de cerrajería (§3.3) — menor urgencia porque ya está en producción funcionando; tocar con cuidado y test de regresión antes/después.

**Pendiente de decidir cuando se retome:** ¿arrancamos por el paso 1 (herramienta de carga de catálogo) — es el que de verdad destraba todo lo demás?
