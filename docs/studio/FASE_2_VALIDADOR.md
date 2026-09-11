# Studio — Fase 2: validador de diseño

> **Fecha:** 2026-09-11 · **Rama:** `feat/studio-fase-2-validador` · apilada sobre #88 (y #87)
>
> Qué revisa el validador, qué no revisa y por qué, y cómo se usa.

---

## 1. Qué es

`backend/src/domain/validation/flowDesignValidator.ts` → `validateFlowDesign(flow)`. Vive en el dominio y es el mismo en los tres lugares que pide la especificación:

| Dónde | Cómo |
|---|---|
| Editor (en vivo) | `POST /api/admin/tenants/:id/studio/flows/:flowId/validate` |
| CI | `moldsValidation.test.ts` valida los tres moldes del repo en cada corrida |
| Publicación | **Todavía no.** Hoy publicar lo decide `FlowSchema`; que los errores del validador bloqueen es de la Fase 4 |

Los límites de WhatsApp los lee de `domain/whatsapp/limits.ts`. No hay un solo número escrito en el validador.

### Reporte

```jsonc
{
  "ok": false,                                  // sin errores de diseño (los avisos no cuentan)
  "summary": { "errors": 1, "warnings": 2 },
  "issues": [
    { "code": "V-EST-05", "level": "error", "nodeId": "info",
      "message": "«info» usa {{misterio}}, que ningún paso guarda: el cliente vería \"{{misterio}}\" tal cual." }
  ],
  "schema": { "ok": true, "issues": [] }        // ¿se podría publicar HOY? (FlowSchema, capa L2)
}
```

`schema` va aparte a propósito: el validador y el schema no miden lo mismo (§4), y mientras la publicación dependa del schema, el operador necesita ver las dos cosas.

---

## 2. Reglas implementadas

Cada una tiene un test que la dispara y otro que no (`flowDesignValidator.test.ts`).

| Código | Nivel | Qué detecta |
|---|---|---|
| V-FORMA | error | El JSON no tiene la forma mínima para revisarlo (sin pasos, paso sin id…). Si falla, no se revisa nada más |
| V-EST-01 | error | Paso que no es el fin y no tiene a dónde seguir. Con aviso especial para el paso a humano: sin salida, al terminar la pausa cada mensaje volvería a escalar |
| V-EST-02 | error | Salida a un paso que no existe |
| V-EST-03 | aviso | Paso al que ningún camino lleva |
| V-EST-04 | error | Ids repetidos de botón, opción o tarjeta en un mismo mensaje |
| V-EST-05 | error | `{{variable}}` que nada provee: el cliente la vería literal. También `{{selected_product_*}}` / `{{matched_service_*}}` sin paso que guarde su id: saldrían vacías |
| V-EST-06 | error | Pasos que se encadenan solos en círculo sin esperar al cliente (el motor corta ahí) |
| V-EST-07 | aviso | Dos salidas iguales a destinos distintos, o la misma palabra clave en dos salidas: gana la primera sin que se note |
| V-EST-08 | error | Paso inicial inexistente, o ningún camino llega a un paso de fin |
| V-META-01 | error | Texto más largo que el límite de su campo (cuerpo, botón, opción, descripción, id, pie, tarjeta: 160 caracteres y 2 saltos de línea) |
| V-META-02 | error / aviso | Botones fuera de 1–3, más de 10 opciones o secciones, carrusel fuera de 2–10 tarjetas. Aviso para lo que solo se sabe en ejecución: carrusel desde el catálogo (puede salir con 1 tarjeta) y lista que mezcla opciones fijas con una sección dinámica (puede pasar de 10) |
| V-META-04 | error | Tarjetas de un carrusel con botones de distinto tipo o cantidad, o más de un botón de enlace por tarjeta |
| V-META-05 | error | Imagen, documento, encabezado o enlace sin `https://` |
| V-CUMP-01 | error | Ningún camino lleva a una persona, o hay un paso donde el cliente puede quedarse sin forma de llegar a una. La política de WhatsApp exige esa vía |
| V-CUMP-06 | error | Un texto que pide datos que la política prohíbe pedir por chat: número de tarjeta, CVV/NIP, CLABE, cuenta bancaria, contraseña, identificación oficial (INE, CURP, pasaporte). Detección por frases, sin acentos ni mayúsculas; "aceptamos pago con tarjeta" no la dispara |
| V-CUMP-07 | aviso | Más de 3 mensajes seguidos del bot sin esperar respuesta, contados por turno |
| V-COSTO-01 | aviso | Un texto suelto justo antes de otro texto o de un menú: se pueden fusionar en un mensaje |
| V-COSTO-02 | aviso | Un turno que manda exactamente 3 mensajes (con más de 3 salta V-CUMP-07) |

---

## 3. Reglas de la especificación que no están, y por qué

Regla 2 de la especificación: si el motor no lo hace, el validador no lo revisa.

| Código | Por qué no |
|---|---|
| V-EST-09 | Respuesta por tipo de entrada (audio, imagen…): el motor ignora esos mensajes, así que el flow no tiene dónde declararla (hallazgo H-8) |
| V-META-03 | El modelo de nodos no tiene encabezados en los tipos donde Meta los prohíbe; no hay nada que revisar |
| V-META-06 | No existe nodo de address message |
| V-CUMP-02 | La palabra de baja es global en el motor (`stop`, `baja`…), no depende del flow: siempre se cumple |
| V-CUMP-03, 04, 05, 08 | El motor no programa envíos, recordatorios ni plantillas. Llegan con la Fase 5 y la Fase 7 |

---

## 4. Donde el validador y el schema no coinciden

El validador sigue a Meta (verificado el 2026-09-10); el schema sigue con sus números de antes.

| Caso | Validador (Meta) | Schema (publicar hoy) |
|---|---|---|
| Cuerpo de lista | hasta 4096 | hasta **1024**: rechaza listas válidas para Meta |
| Tarjetas de carrusel | 2 a 10 | **1** a 10: publica un carrusel que Meta rechaza |
| Cuerpo de tarjeta | hasta 160 y 2 saltos | hasta **1024**: publica tarjetas que Meta rechaza |
| Botones iguales en todas las tarjetas | mismo tipo **y cantidad** | solo mismo tipo |

Alinear el schema con Meta cambia qué se puede publicar. Es la decisión que queda pendiente para la Fase 4.

---

## 5. Los moldes

Los tres pasan sin errores y el schema los publica. Hay dos avisos, los dos de `securitech`, fijados en `moldsValidation.test.ts` para que uno nuevo no pase inadvertido:

- `V-COSTO-01` en «saludo»: el saludo sale como texto suelto antes del menú.
- `V-COSTO-01` en «no_entendi»: lo mismo con el "no entendí".

Fusionarlos ahorra un mensaje por conversación, pero cambia el texto del molde, así que es decisión del negocio. No se tocó.
