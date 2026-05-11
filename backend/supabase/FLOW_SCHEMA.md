# Flow Schema V1 — Contrato del Motor de Flujos

> Documentación del contrato JSON que define los flujos conversacionales del bot.
> Este contrato lo crea el Sprint A y lo interpreta el Sprint B (motor) y el
> Sprint D (editor visual).

## ¿Por qué existe este motor?

SegurITech Bot Pro es un SaaS multi-tenant **modelo concierge** donde el operador
interno arma bots para PyMEs y el cliente solo los usa. Hardcodear la lógica
conversacional no escala — cada cliente nuevo exige modificar código. La
solución: una FSM configurable por tenant, persistida en `bot_flows`, e
interpretada en runtime.

Este documento define **qué** se persiste. El **cómo** se interpreta es
responsabilidad del Sprint B.

## Estructura raíz

```jsonc
{
  "version": "1.0",
  "start_node_id": "<id de un nodo del array>",
  "nodes": [ /* array de nodos */ ]
}
```

- `version`: semver. V1 es siempre `"1.0"`.
- `start_node_id`: id del nodo donde empieza la conversación cuando el usuario
  es nuevo o se acaba de resetear (palabras de escape, ver abajo).
- `nodes`: array no vacío. El nodo cuyo `id` coincida con `start_node_id` debe
  existir. Los `id` deben ser únicos dentro del flow.

## Tipos de nodo (7 en V1)

Todos comparten:

```jsonc
{
  "id": "string-único-en-el-flow",
  "type": "send_text" | "send_buttons" | "send_list" | "send_media"
        | "wait_input" | "escape_to_human" | "end",
  "content": { /* depende del type */ },
  "transitions": [ /* array de transiciones */ ]
}
```

### `send_text`
Envía texto y avanza por la primera transición que matchee (típicamente
`default`).

### `send_buttons`
Texto + 1 a 3 botones. Espera respuesta del usuario.
**Reglas Meta**: máximo 3 botones; cada `title` máximo 20 caracteres.

### `send_list`
Texto + lista interactiva con secciones.
**Reglas Meta**: máximo 10 items totales sumando todas las secciones;
`button_label` máximo 20 chars; `title` de cada item máximo 24 chars;
`description` máximo 72 chars.

Las secciones son discriminated union por `type`:

- **`static`**: items literales en el JSON.
- **`dynamic`**: items inyectados por el motor desde una fuente externa
  (`items_source`).

Fuentes válidas en V1: solo `'catalog_items'`. Agregar otras (ej.
`'service_categories'`) requiere cambio deliberado del tipo
`ItemsSource` en `flow.ts`, no improvisación en seeds.

### `send_media`
Imagen o ubicación con caption opcional. Avanza automáticamente.
- `media_type: 'image'`: requiere `url` HTTPS y opcional `caption`.
- `media_type: 'location'`: requiere `latitude`, `longitude`, opcional `name` y `address`.

V1 NO soporta video, audio, documento. (Pendiente para futuro.)

### `wait_input`
Espera texto libre. Útil para captura de datos (nombre, dirección, ubicación).
Si declara `save_to_context`, el motor guarda el texto recibido en
`bot_users.context` bajo esa clave.

### `escape_to_human`
Notifica al dueño del negocio (vía
`urgent_service_config.whatsapp_alertas_urgentes` o fallback a
`owner_data.whatsapp_dueno`) con `owner_alert_template` resuelto, y le
responde al usuario `user_response`. Avanza al `end`.

### `end`
Nodo terminal. El usuario queda idle. El próximo mensaje vuelve al
`start_node_id`.

## Tipos de transición

```jsonc
{ "type": "button",        "value": "btn_id" }
{ "type": "list_item",     "value": "item_id" }
{ "type": "list_item_any", "save_to_context"?: "<clave>" }
{ "type": "keyword",       "values": ["sí", "si", "confirmar"] }
{ "type": "default" }
```

### Orden de evaluación (importante)

El motor evalúa `transitions[]` en el orden del array. **First-match-wins**.

**Regla operativa**: en nodos `send_list` mixtos (con sección estática
"Volver" + sección dinámica de catálogo), los `list_item` específicos deben
ir **antes** que `list_item_any`. Caso contrario el `list_item_any` se traga
las opciones específicas y la sección "Volver" deja de funcionar.

Ejemplo correcto:

```jsonc
"transitions": [
  { "condition": { "type": "list_item", "value": "back" },
    "next_node_id": "menu" },
  { "condition": { "type": "list_item_any",
                   "save_to_context": "selected_product_id" },
    "next_node_id": "confirm" },
  { "condition": { "type": "default" }, "next_node_id": "not_understood" }
]
```

Ejemplo INCORRECTO (el `list_item_any` se come el "back"):

```jsonc
"transitions": [
  { "condition": { "type": "list_item_any", "save_to_context": "..." },
    "next_node_id": "confirm" },
  { "condition": { "type": "list_item", "value": "back" },     // ← nunca se alcanza
    "next_node_id": "menu" },
  { "condition": { "type": "default" }, "next_node_id": "..." }
]
```

El editor del Sprint D debe validar este orden y advertir al operador.

## Palabras de escape global

El motor reservará 4 palabras universales que resetean a `start_node_id`
desde **cualquier** nodo, sin pasar por las transiciones definidas:

- `menu`
- `salir`
- `cancelar`
- `inicio`

Esto NO se modela en el JSON. Es comportamiento del intérprete.

## Variables interpoladas

Sintaxis: `{{nombre_variable}}` dentro de cualquier campo de texto del
contenido del nodo (`text`, `prompt`, `caption`, `user_response`,
`owner_alert_template`, etc.).

### Estáticas (resueltas desde `bot_configurations` del tenant)

- `{{nombre_bot}}`
- `{{nombre_negocio}}`
- `{{welcome_message}}`
- `{{menu_message}}`
- `{{out_of_hours_message}}`
- `{{not_understood_message}}`
- `{{order_confirmation_message}}`

### Dinámicas (resueltas en runtime por el motor)

- `{{catalog_listing}}`: catálogo formateado como texto multilinea.
- `{{selected_product_id}}`: id del producto elegido (de `bot_users.context`).
- `{{selected_product_name}}`: nombre del producto elegido.
- `{{selected_product_price}}`: precio del producto elegido.
- `{{order_id}}`: id corto generado al confirmar pedido.
- `{{phone}}`: número del usuario (para alertas al dueño).
- `{{last_message}}`: último mensaje recibido del usuario (para alertas).

### Resolución lazy

El motor resuelve variables **solo cuando el nodo las necesita**, no
precarga todas al inicio del turno. Ahorra queries innecesarias y mantiene
el motor simple.

## Items dinámicos en `send_list`

Las secciones `dynamic` no llevan `items` en el JSON. El motor los inyecta
en runtime al renderizar el nodo, leyendo de la fuente declarada
(`items_source`).

Ejemplo: un nodo con `items_source: "catalog_items"` se hidrata con todos
los productos disponibles del tenant (filtrados por `disponible = true`).

### Pendiente abierto (decisión de Sprint B)

**¿Qué hace el motor si la fuente dinámica resuelve vacío?**

Tres opciones razonables que el Sprint B debe elegir y documentar:

1. **Saltar al `default`** de `transitions` (asume que el operador modeló
   un fallback adecuado).
2. **Enviar solo las secciones estáticas si las hay**, y si no hay,
   transicionar al `default`.
3. **Soportar `fallback_node_id` opcional en la sección dinámica** que
   tome control si la fuente está vacía.

V1 deja la decisión abierta. El editor del Sprint D no debe permitir flows
con única sección dinámica sin `default` en transiciones, hasta que esto
se cierre.

## Cómo crear un template nuevo

1. Identificar el giro (ferreteria, salon, farmacia, etc.). Si no encaja,
   usar `'otro'`.
2. Bosquejar el grafo en papel: nodo de bienvenida, nodos de flujo principal,
   nodos terminales (`escape_to_human`, `end`).
3. Escribir el JSON respetando este contrato.
4. Agregar un bloque `INSERT ... ON CONFLICT (slug) DO UPDATE` al final de
   `backend/supabase/seed.sql`.
5. Re-aplicar seeds: `supabase db reset` (local) o pegar el INSERT en SQL
   Editor del Dashboard (cloud).
6. (Sprint D, futuro) Clonar al tenant desde el panel super_admin.

## Lo que NO está en V1

- Templates HSM aprobadas por Meta (mensajes outbound fuera de la ventana
  de 24h). → Sprint F.
- WhatsApp Flows (formularios nativos multi-pantalla con encriptación).
  → V2 o V3 según demanda real.
- IA / RAG / clasificador de intención. → V2 con clasificador simple +
  fallback humano; V3 con RAG si los clientes lo demandan.
- A/B testing de flows. → V2 (requiere remover índice único parcial
  `idx_bot_flows_tenant_active`).
- Flows múltiples por tenant (welcome, post-24h, recordatorio_pago).
  → V2.
- Versionado/diff de flows. → V2 si surge necesidad de auditoría
  (hoy se sobreescribe).