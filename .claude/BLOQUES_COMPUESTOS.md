# Bloques compuestos

> **Fecha:** 2026-09-08 · Implementado en `backend/src/domain/blocks/`.
> Reglas citadas: `.claude/REGLAS_FLOW.md`.

El operador no arma nodos sueltos: elige un bloque y lo rellena. Los 14 tipos
de nodo pasan a ser lenguaje interno del motor, no interfaz humana.

**No se añadió ningún tipo de nodo. El motor no se tocó.**

---

## Por qué un bloque suelto no pasa el linter

Es la decisión de diseño que ordena todo lo demás, y conviene entenderla antes
de leer el resto.

Un bloque aislado **siempre** tiene salidas sin destino — eso es exactamente lo
que violan R-F04 (transición sin `next_node_id`) y R-F05 (transición a nodo
inexistente). Un bloque que "pasara el linter" por sí solo sería un bloque sin
salidas, es decir, inútil.

Por eso `expandBlock` no devuelve transiciones completas: devuelve **outlets**,
salidas nombradas que el ensamblador cablea.

```ts
interface BlockExpansion {
  nodes: FlowNode[];        // ids ya prefijados con el id del bloque
  entryNodeId: string;      // por dónde se entra
  outlets: BlockOutlet[];   // salidas pendientes de destino
}
```

La garantía de "pasa el linter" es de **`assemble()`**, no del bloque. Y los
tests lo prueban así: *bloque + cableado mínimo*, nunca *bloque solo*.

`assemble()` exige que **toda** salida esté cableada. Es lo que convierte un
montón de subgrafos con puntas sueltas en un grafo que cumple R-F04 y R-F05, y
luego valida contra las dos capas: Zod (L2) y las reglas de estructura
portadas a `graphRules.ts` (L1).

---

## Los seis bloques

### Entrada

| | |
|---|---|
| **Parámetros** | ninguno |
| **Subgrafo** | un `send_text` |
| **Salidas** | `next` |
| **Garantiza** | **R-F31** |

El texto no es editable a propósito: siempre es `{{welcome_message}}` con
`config_bound` declarado. Así no puede haber dos saludos, uno en el traje y
otro escrito a mano en el grafo, y cambiar el saludo no obliga a publicar una
versión nueva del flujo.

### Menú

| | |
|---|---|
| **Parámetros** | `texto`, `opciones[]`, (lista) `etiquetaBoton`, `tituloSeccion` |
| **Subgrafo** | un `send_buttons` **o** un `send_list`, según el número de opciones |
| **Salidas** | una `opcion:<id>` por opción + `fallback` |
| **Garantiza** | **R-F16, R-F17, R-F18** |

**La presentación no la elige el operador, la decide el número de opciones:**
1-3 → botones, 4-10 → lista de una sección, más de 10 → falla al expandir.
Los títulos se truncan al límite que aplique (20 en botón, 24 en fila), así que
un texto largo no revienta al publicar.

El **id de la opción no cambia** al pasar de botones a lista, así que agregar
una cuarta opción no rompe el cableado que el operador ya hizo. Hay un test
para eso.

La salida `fallback` (condición `default`) es obligatoria: nada queda sin
respuesta. **Sin contador de reintentos** — ver la sección de límites.

### Consulta de catálogo

| | |
|---|---|
| **Parámetros** | `prompt`, `guardarEn` (default `selected_product_id`) |
| **Subgrafo** | un `search_catalog` |
| **Salidas** | `encontrado`, `no_encontrado` |
| **Garantiza** | cero escalado ciego |

Las dos salidas son obligatorias y ahí está el valor: sin match el flow **nunca
inventa**, y `no_encontrado` tiene que ir a algún lado que el autor decida.
Dejarla sin cablear rompe el ensamblaje.

`encontrado` guarda el id del producto, que es la clave que después resuelve
`{{selected_product_name}}` y `{{selected_product_price}}` sin lookup extra.

### Captura y escalado

| | |
|---|---|
| **Parámetros** | `datos[]`, `resumen`, `respuestaCliente`, `avisoDueno` |
| **Subgrafo** | N × `wait_input` → `send_text` resumen → `send_buttons` confirmación → `escape_to_human` |
| **Salidas** | `next` |
| **Garantiza** | un dato por turno · escalado con contexto |

Un dato por turno es deliberado: pedir tres cosas en un mensaje produce
respuestas que un motor determinista no puede separar.

El `owner_alert_template` viaja con las claves capturadas, así que el dueño
recibe el lead completo y no un "alguien necesita ayuda".

**Ciclo deliberado:** el botón "Corregir" vuelve al primer dato. Eso crea un
ciclo y dispara **R-F13 (warning)** a propósito — el ciclo tiene salida
(confirmar), y sin él "me equivoqué" obligaría a reiniciar la conversación
entera. Es warning, nunca error, y hay un test que lo fija.

### Cotizador

| | |
|---|---|
| **Parámetros** | `parametros[]` (opciones enumeradas), `precios`, `plantillaResultado` |
| **Subgrafo** | árbol de decisión: un nodo por parámetro y camino, un `send_text` por hoja |
| **Salidas** | `next` (todas las hojas convergen en una) |
| **Garantiza** | precio determinista y reproducible |

Toda combinación necesita precio: si falta una, falla **antes de generar un
solo nodo**. Y el árbol se corta en 60 hojas — no es un límite de Meta, es de
sensatez: un flow con cientos de nodos generados no se revisa en el canvas.

Todas las hojas comparten una sola salida, así que el operador cablea **una**
cosa y no una por combinación. Para eso `BlockOutlet.fromNodeIds` es un array.

### Cierre

| | |
|---|---|
| **Parámetros** | `mensaje` |
| **Subgrafo** | `send_text` → `end` |
| **Salidas** | ninguna |
| **Garantiza** | **R-F06, R-F07, R-F10** |

Es el único bloque que pasa el linter por sí solo, porque es el único sin
salidas. Con al menos un Cierre alcanzable el grafo satisface a la vez a los
dos validadores, que es la divergencia R-F06 / R-F07 documentada en
`REGLAS_FLOW.md`.

---

## Qué garantizan y qué no

Del catálogo, **los bloques garantizan por construcción**: R-F01, R-F02, R-F03
(ids prefijados por bloque), R-F04, R-F05 (vía ensamblaje), R-F06, R-F07,
R-F10, R-F16, R-F17, R-F18 y R-F31.

**No pueden garantizar:**

- **R-F31 fuera del bloque Entrada.** Depende del copy que escriba el operador
  en Menú, Captura o Cotizador.
- **R-F32** (guardrail de giro restringido). Depende de los datos del tenant,
  no de la forma del grafo.
- **R-F13 y R-F14.** Son propiedades del **grafo compuesto**, no de cada
  bloque: un bloque puede ser impecable y el ensamblaje seguir teniendo un
  ciclo. Por eso `assemble()` las reporta como warnings en la respuesta en vez
  de prometerlas.

---

## Dos límites que son del motor, no de los bloques

Los encontré construyendo esto, y los dos tienen la misma raíz: **los 14 tipos
de nodo no computan nada.** No hay operación aritmética ni condición sobre un
número.

1. **No hay contador de reintentos.** El Menú garantiza un `fallback`, pero "al
   tercer intento te paso con un humano" no es expresable. `wait_input` con
   `save_to_context` guarda el texto del cliente, no un número, y no hay nodo
   de incremento ni condición aritmética. Hoy, cuando ninguna transición
   matchea, `FlowInterpreter` re-renderiza el mismo nodo indefinidamente.

2. **El Cotizador lee precios, no los calcula.** Precio unitario sí ("$1.50 por
   hoja"); precio × cantidad no. El patrón recomendado es dar el unitario y
   capturar la cantidad con un bloque Captura, para que el humano cierre.

Ambos se levantan con lo mismo: computación en el motor. Ver
`.claude/ADR_CONTADOR_REINTENTOS.md`.

---

## API

```
POST /api/admin/tenants/:id/blocks/expand
  { block }  →  { expansion }

POST /api/admin/tenants/:id/blocks/assemble
  { blocks, wiring, startBlockId }  →  { flow, warnings }
```

**Ninguno persiste nada.** Devuelven el grafo para que el Designer lo cargue en
el canvas; guardar sigue siendo `PUT .../draft` y publicar `POST .../publish`.
Un endpoint que generara y publicara de una se saltaría la revisión humana, que
es justo el punto del paso 6 de la entrevista.

Los errores de expansión salen como **400 con mensaje redactado para una
persona**, no como 500: son problemas de lo que pidió el operador.
