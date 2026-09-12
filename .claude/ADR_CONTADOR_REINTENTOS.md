# ADR — Estado numérico en el motor de flows

> **Estado:** decidido el 2026-09-11 para el contador (ver [Decisión](#decisión-2026-09-11-d-52)); el precio sigue fuera. **Fecha:** 2026-09-08.
> Sale de construir los bloques compuestos (F1-a): dos cosas que el plan daba
> por hechas resultaron no ser expresables con los 14 tipos de nodo.

## Contexto

El plan de la Fase 1 pide que el bloque Menú garantice *"escalera de fallback +
contador"* y que el Cotizador dé *"precio determinista"*.

Al implementarlos aparecieron dos límites con la misma raíz.

**No hay contador de reintentos.** Cero apariciones de `retry` / `reintento` /
`attempt` en `backend/src/domain`. Cuando ninguna transición matchea,
`FlowInterpreter` re-renderiza el mismo nodo y se queda ahí:

```ts
if (!transition) {
  this.logger.warn(..., 'Ninguna transición matchea, re-renderizando nodo');
  return { outputs, nextNodeId: currentNode.id, ... };
}
```

Desde el cliente eso es el mismo menú, una y otra vez. La única salida son las
palabras de escape (`menu`, `salir`, `cancelar`, `inicio`), que el cliente no
tiene por qué conocer.

**Tampoco hay aritmética.** El Cotizador puede *leer* un precio de una hoja del
árbol de decisión, pero no puede multiplicarlo por una cantidad.

La raíz es la misma: **el motor no tiene estado numérico ni ramificación sobre
él.** `wait_input` con `save_to_context` guarda el texto del cliente. No hay
nodo de incremento, ni condición de comparación, ni operación.

Tampoco es un descuido: es coherente con ADR-015 (motor determinista,
exprimirlo antes de meter IA) y con mantener el JSON legible. Pero marca el
techo de lo que un bloque puede prometer.

## Qué está en juego

Sin esto:

- La escalera de fallback de tres escalones **no se puede construir**. Solo
  "cualquier cosa que no entienda → escalado", que dispara el handoff humano
  al primer error de dedo del cliente.
- El Cotizador da precio unitario y **el humano hace la multiplicación**.
- Un cliente que no entiende el menú puede quedarse en bucle indefinido.

## Opciones

### A. No hacer nada

El Menú escala al primer fallo; el Cotizador da unitario. Cero código, cero
riesgo. Es lo que hay hoy y lo que entregó F1-a.

**Coste:** handoffs humanos innecesarios, que es justo lo que el bot debería
evitar. Con 100-300 mensajes diarios por negocio puede ser tolerable — o no,
según cuántos sean por dedo gordo.

### B. Contador implícito en el intérprete

El motor cuenta los no-match consecutivos por nodo en `user.context` (clave
reservada), y una condición nueva `no_match_count_gte: N` ramifica sobre él.

- Un tipo de condición nuevo, no un tipo de nodo. El JSON sigue legible.
- Toca `FlowInterpreter`, `TransitionCondition`, el schema, los dos
  validadores y el espejo del frontend.
- El bloque Menú lo garantizaría por construcción, con `N` como parámetro.
- **No resuelve el Cotizador.**

### C. Estado numérico general

Nodos de asignación y operación, y condiciones de comparación. Resuelve las
dos cosas.

- Es convertir el JSON en un lenguaje de programación. Contradice de frente
  "el diseñador no arma nodos, elige arquetipos".
- Superficie de validación mucho mayor: división por cero, tipos, desbordes.
- **No recomendado** sin un caso de uso que lo exija de verdad.

### D. Cálculo en un puerto

Un `PricingPort` que el intérprete consulta, con la tabla de precios en datos
del tenant y no en el grafo.

- Encaja con la arquitectura hexagonal que ya existe.
- Resuelve el Cotizador **de verdad** (precio × cantidad, escalones por
  volumen) y saca la tabla de precios del JSON del flow, donde no debería
  estar.
- **No resuelve el contador.**
- Es trabajo de verdad: puerto, adapter, tabla, panel para editarla.

## Recomendación

**B para el contador, D para el precio. Ninguna de las dos ahora.**

Son problemas distintos con soluciones distintas, y juntarlos en C es el error
clásico de generalizar antes de tener dos casos reales.

Y ninguna es urgente todavía: **no hay datos de uso**. El motor no registra
cuántos no-match consecutivos ocurren, así que no sabemos si el bucle del menú
es un problema real o teórico. Medirlo primero es más barato que cualquiera de
las dos opciones.

## Lo que propongo decidir ahora

1. **Instrumentar antes de construir.** El `logger.warn` de no-match ya existe;
   contar esos eventos por tenant y por nodo durante el piloto de la papelería
   dice si el contador hace falta. Coste: casi cero.
2. **Aceptar el límite del Cotizador en V1** y documentarlo en el bloque
   (hecho, en `BLOQUES_COMPUESTOS.md`).
3. **Revisar este ADR cuando la papelería lleve dos semanas en producción**,
   con datos en la mano.

## Decisión (2026-09-11, D-5.2)

OVY aprobó lo que construyó la Fase 5 del Studio (C-04, #93), porque la
especificación exige reintentos en las capturas:

- Un contador **solo para capturas con validación**, uno por captura. Cuenta
  las respuestas inválidas seguidas en la sesión (clave reservada
  `__capture_attempts`) y una respuesta buena lo reinicia.
- Al llegar a `max_attempts` (1 a 5) el paso sigue en `on_exhausted`. Es un
  campo del nodo `wait_input`, no una condición nueva de transición.
- **No es la opción B:** no se cuentan los "no entendí" de cualquier paso. Los
  menús del asistente ya tienen su escalera con pasos.
- **La opción D (precio en un puerto) sigue sin construirse**; el Cotizador
  mantiene el límite documentado en `BLOQUES_COMPUESTOS.md`.

La propuesta de arriba ("Lo que propongo decidir ahora") queda como
antecedente. Detalle de la implementación: `docs/studio/FASE_5_CONTROL.md` §2.

## Lo que NO se decide aquí

Si el precio debe salir del catálogo (`pos_products`) en vez de una tabla
aparte. Está relacionado con la opción D pero es una decisión de modelo de
datos, y arrastra el problema del catálogo dual que documenta
`AUDITORIA_DUPLICACION_PANEL.md`.
