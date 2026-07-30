# Cómo diseñar un chatbot de WhatsApp en SegurITech Bot Pro

> Guía operativa para diseñar el `bot_flow` de un negocio nuevo (molde por industria — Camino K del roadmap). Caso de estudio real: `backend/scripts/cerrajeria-flow.json` (CerraCruz + Cerrajería Tony).

---

## 1. Discovery — qué necesitas saber del negocio ANTES de tocar el flow

No se diseña un flow bueno adivinando. Antes de escribir un solo nodo, consigue esto del dueño (o de quien onboardea al cliente):

1. **Los 3-4 caminos reales que sigue un cliente que escribe por WhatsApp.** No lo que el dueño cree que preguntan — lo que de verdad preguntan. Pídele ejemplos de conversaciones reales o capturas de pantalla de su WhatsApp actual si ya recibe mensajes.
2. **Urgencia vs no-urgencia.** ¿Hay un camino tipo "emergencia" que necesita escalar a un humano YA, distinto de uno tipo "cotización" que puede esperar horas? Esto define si necesitas un nodo `escape_to_human` inmediato o un flujo más largo de captura de datos.
3. **Qué datos mínimos necesita el dueño para actuar** (dirección, teléfono, tipo de problema, horario preferido...) — y en qué orden los pediría él mismo si contestara personalmente.
4. **El vocabulario real del cliente, no el del negocio.** Un cliente no dice "solicitar servicio de cerrajería", dice "se me perdieron las llaves" o "me quedé afuera". Pide 5-10 frases reales (o inventa las más probables si no hay historial) para poblar las `keyword` de cada nodo — nunca solo la palabra "formal" del menú.
5. **El WhatsApp del dueño/operador** que va a recibir los avisos (`owner_data.whatsapp_dueno`) — sin esto, `escape_to_human` no tiene a quién avisar.
6. **Horario real de atención** (¿24/7 o hay horas muertas?) — si NO es 24/7, se necesita lógica de "fuera de horario" (variable `{{out_of_hours_message}}` ya existe en `VariableResolver`).
7. **Catálogo de servicios/productos** con nombres cortos (≤24 caracteres — límite de Meta para list items) y una descripción de una línea (≤72 caracteres).
8. **Tono de los 3 mensajes base** (bienvenida, menú, "no entendí") — mándaselos al dueño para su OK explícito antes de sembrar en producción. Un texto que a ti te parece bien puede no sonar como su negocio.
9. **¿El bot necesita mandar mensajes primero (proactivos)** o solo responde a quien le escribe? Si hay cualquier mensaje business-initiated fuera de una conversación abierta, ver la sección 4 (templates) — esto casi siempre aplica al aviso al dueño.

---

## 2. Principios de diseño del árbol de conversación

Estos son los patrones que ya aprendimos a la mala construyendo el flow de cerrajería — inclúyelos por default, no como "mejora opcional":

### 2.1 Nunca dejes un callejón sin salida
Todo nodo de menú/error (`send_buttons`, `send_list`) que tenga una transición `default` hacia sí mismo o hacia otro nodo de error es una **trampa**: un cliente frustrado que no matchea ningún botón ni keyword se queda ahí para siempre, y si está en una emergencia real, nunca llega a un humano.

**Patrón correcto:** máximo 2 intentos de "no entendí" antes de forzar `escape_to_human`. Implementación: dos nodos distintos (`no_entendi` → `no_entendi_2` → `escape_to_human`), NO un nodo que se apunta a sí mismo. El motor de flows (`FlowInterpreter`) no tiene contador de intentos en context — el "contador" se modela con nodos encadenados, no con lógica nueva.

### 2.2 Confirma antes de escalar cuando capturas datos en texto libre
Un nodo `wait_input` acepta **cualquier texto** — no hay validación de formato en el motor (no existe un node type de "validar regex"). Si el cliente escribe "ok" en vez de su dirección, ese "ok" se va tal cual al aviso del dueño.

**Patrón correcto:** después de todo `wait_input` que capture datos críticos (dirección, teléfono, detalle del problema), agrega un nodo de confirmación (`send_buttons` con botones "✅ Sí, correcto" / "✏️ Corregir") que **eco lo que se capturó** usando la misma variable de `save_to_context`. Si el cliente dice que está mal, regresa al `wait_input`; si confirma, avanza a `escape_to_human`. La transición `default` de este nodo de confirmación debe **fallar abierto hacia el escalamiento** (no hacia otro error) — es mejor que un humano revise un dato dudoso a que el cliente se quede atrapado confirmando.

### 2.3 Duplica cada opción de botón como keyword
WhatsApp permite responder botones tocando o escribiendo texto libre. Todo nodo con botones/lista debe tener, además de las condiciones `button`/`list_item`, condiciones `keyword` equivalentes — y esas keywords deben cubrir el lenguaje real del cliente (ver punto 1.4 de discovery), no solo sinónimos formales.

### 2.4 El flow es UNO por industria, no por tenant
Como en `cerrajeria-flow.json`: un solo JSON sirve a N negocios del mismo giro. Lo que cambia por tenant son solo los textos vía variables (`{{nombre_negocio}}`, `{{welcome_message}}`, `{{menu_message}}`, `{{not_understood_message}}`) resueltas por `VariableResolver` desde `bot_configurations`/`tenants`. No dupliques el flow por cliente — generaliza el seed (ver `backend/scripts/seed-cerrajerias.ts` como ejemplo del patrón `TENANTS: TenantSeed[]`).

### 2.5 Variables — una sola pasada, sin anidar
`VariableResolver.resolve()` hace **una sola pasada** de sustitución de `{{var}}`. Si el valor de una variable de config contiene otro `{{...}}` literal, NO se vuelve a resolver — sale tal cual. Nunca metas un placeholder dentro del valor de otro campo de configuración.

---

## 3. Node types disponibles (y sus límites reales de Meta)

Todos viven en `backend/src/domain/validators/flowSchema.ts` (fuente de verdad — ahí se valida antes de guardar/publicar):

| Node type | Uso | Límite Meta clave |
|---|---|---|
| `send_text` | Mensaje simple, sin interacción | Texto ≤ 4096 chars (recomendado ≤ 1024) |
| `send_buttons` | Hasta 3 botones de respuesta rápida | Texto ≤ 1024, título de botón ≤ 20 chars, máx 3 botones |
| `send_list` | Menú desplegable, hasta 10 items | Texto ≤ 1024, título de item ≤ 24 chars, descripción ≤ 72 chars, máx 10 items totales en secciones estáticas |
| `send_media` | Imagen, ubicación o documento | — |
| `send_cta_url` | Botón que abre un link externo (v23.0) | URL debe ser https |
| `send_location_request` | Pide ubicación al cliente (v23.0) | Sin header/footer permitido |
| `send_media_carousel` | Carrusel de tarjetas (v23.0) | Todos los botones del carrusel deben ser del mismo tipo |
| `wait_input` | Espera texto libre del cliente | **Sin validación de formato** — ver patrón 2.2 |
| `escape_to_human` | Notifica al dueño y pausa el bot | Pausa automática por `HANDOFF_PAUSE_MINUTES` (default 120 min, migration 017) |
| `request_call_permission` | Pide permiso de llamada (v23.0) | — |
| `send_whatsapp_flow` | Abre un WhatsApp Flow nativo (v23.0) | Requiere `whatsapp_flow_id` (UUID) ya creado en Meta |
| `end` | Cierra la conversación | No debe tener transiciones |

Para validar un flow nuevo sin publicarlo:
```bash
cd backend
npx ts-node -r tsconfig-paths/register scripts/validate-flow.ts scripts/<tu-flow>.json
```

---

## 4. Cumplimiento de Meta — lo que decide si "lo aceptan"

1. **La estructura del flow no necesita aprobación de Meta** — los límites de botones/listas/caracteres ya se validan en código (sección 3). Ese riesgo está cubierto.
2. **Todo mensaje business-initiated fuera de una ventana de 24h SÍ necesita un template (HSM) pre-aprobado.** El caso más común en este proyecto: el aviso al dueño (`escape_to_human` → `owner_alert_template`) es hoy texto libre — si el dueño no le ha escrito al número del bot en las últimas 24h, Meta rechaza el envío y hoy el código lo captura como error silencioso (`best-effort` en `BotController.ts`). Antes de ir a producción con un negocio nuevo, somete un template categoría **UTILITY** para esta notificación.
3. **Categoría del template:** usa `UTILITY` para notificaciones operativas (avisos, confirmaciones) — se aprueban más rápido que `MARKETING` y no exigen opt-in de marketing. Nunca declares como utility un texto con tono promocional (Meta lo rebota).
4. **Verificación de negocio (Meta Business Account)** es un proceso aparte, más lento (días/semanas), y es requisito para número de producción — pero no bloquea el diseño ni las pruebas en sandbox/simulador.

---

## 5. QA manual antes de activar con número real

Mínimo por cada flow nuevo (no hace falta el gate automatizado de test cases del roadmap — Camino H — para esto):

1. Camino feliz de cada opción del menú principal, de punta a punta.
2. Cada camino que termine en `escape_to_human`: confirma que el mensaje al cliente y el aviso al dueño tengan sentido.
3. Escribe basura/texto sin sentido dos veces seguidas en cualquier menú → confirma que llegas a escalamiento, no a un loop.
4. En cualquier nodo de confirmación (patrón 2.2), responde "no" → confirma que regresa a pedir el dato, no que se rompe.
5. Verifica en Supabase que `bot_users.human_paused_until` se setea tras escalar y que el bot deja de responder por `HANDOFF_PAUSE_MINUTES`.
6. Manda los 3 mensajes de configuración (bienvenida/menú/no-entendí) al dueño del negocio para su aprobación explícita antes de publicar.

---

## 6. Caso de estudio: cerrajerías (CerraCruz + Cerrajería Tony)

`backend/scripts/cerrajeria-flow.json` — un solo flow, 15 nodos, sirve a N tenants vía `backend/scripts/seed-cerrajerias.ts`. Estructura:

```
bienvenida → [emergencia | agendar | info]
  emergencia → menu_emergencia (lista) → emerg_captura (wait_input)
             → emerg_confirma (confirma antes de escalar) → emerg_escala (escape_to_human)
  agendar    → menu_servicios (lista) → serv_captura (wait_input)
             → serv_confirma (confirma antes de escalar) → serv_escala (escape_to_human)
  info       → info_servicios → [agendar | emergencia | salir → despedida]
  (cualquier no-match) → no_entendi → no_entendi_2 → no_entendi_escala (escape_to_human)
```

Aplica los patrones 2.1 (máx 2 intentos antes de escalar) y 2.2 (confirmar antes de escalar) explícitamente — úsalo como plantilla al diseñar el siguiente giro (ferretería, pizzería — Camino K).
