# Studio — Fase 3: el asistente de 8 pasos

> **Fecha:** 2026-09-11 · **Rama:** `feat/studio-fase-3-asistente` · apilada sobre #89, #88 y #87
>
> Cómo funciona el asistente, qué cubre de la especificación y qué no, y cómo
> probar el criterio de aceptación.

---

## 1. Cómo probarlo (criterio de aceptación)

> *OVY crea un bot de cerrajería para un tenant de prueba en menos de 15 minutos sin tocar JSON.*

1. En el panel, crear un tenant de prueba (giro cerrajería) o abrir uno existente.
2. En su ficha, **Studio del bot**.
3. Según el punto de partida:
   - **Sin bot:** «Crear el bot con el molde…». Crea el flow con el molde JSON de cerrajería.
   - **Con un bot que no salió del asistente:** «Empezar con este molde» (Cerrajería). Crea un borrador; lo publicado sigue igual.
4. Recorrer los pasos:
   1. Negocio: horario y **WhatsApp del dueño**.
   2. Primer mensaje: saludo y texto del menú. Si el negocio no tenía textos, vienen sugeridos.
   3. Opciones: ajustar textos, casos y preguntas.
   4. a 7. Revisar palabras clave, "no entendí", paso a humano y despedida.
5. **Guardar.** Probar en el simulador de la derecha (guarda solo antes de cada turno si hay cambios).
6. **Probar y publicar:** sin errores, **Publicar**. El bot real contesta con esto desde el siguiente mensaje.

El molde de cerrajería del asistente responde **exactamente igual** que `cerrajeria-flow.json` en la conversación grabada y en el camino de información y "no te entendí". Lo comprueba `studioMolds.test.ts`, que falla si cambia un solo texto.

**[no verificado]:** no se probó en un navegador. Hace falta el panel levantado contra Supabase y una sesión de `super_admin`.

---

## 2. Cómo funciona

| Pieza | Dónde |
|---|---|
| Especificación, compilador y lectura de vuelta | `backend/src/domain/studio/wizard.ts` |
| Moldes del asistente (hoy: cerrajería) | `backend/src/domain/studio/molds.ts` |
| Endpoints | `GET /api/admin/studio/molds` · `POST …/studio/wizard/preview` · `GET` y `PUT …/studio/flows/:flowId/wizard` |
| Pantalla | `frontend/src/apps/panel/routes/tenants.$id.studio.tsx` + `apps/panel/studio/` |

- **El asistente edita una especificación**, no nodos: opciones del menú, qué hace cada una (pide datos y pasa a una persona, da información, pasa directo a una persona), la escalera de "no te entendí" y la despedida.
- **El backend la compila** a un flow con los nodos que el motor ya ejecuta, y lo guarda en el **mismo borrador** que usa el Designer. Publicar sigue siendo el `POST …/publish` de siempre.
- **Los textos del negocio** (saludo, menú, "no te entendí", fuera de horario, horario, dueño) se guardan en el tenant con `PATCH /api/admin/tenants/:id`, como siempre. El flow los usa con `config_bound`, así que cambiarlos no obliga a publicar.
- **La especificación viaja dentro del flow**, en `studio.wizard`, y se conserva al publicar. Al reabrir, el backend la vuelve a compilar y la compara con el flow:

| Resultado | Qué hace el Studio |
|---|---|
| Coincide | Abre el asistente con esa especificación |
| `no_spec`: el flow no lo generó el asistente (p. ej. el molde JSON) | Ofrece empezar desde un molde |
| `edited_elsewhere`: se editó después en el Designer | Avisa que abrirlo aquí perdería esos cambios; sigue en el Designer o empieza de nuevo |

- **Validación en vivo:** cada cambio se compila y pasa por el validador de la Fase 2 sin guardar (`preview`). Cada paso muestra sus hallazgos y el menú de pasos marca cuántos tiene cada uno. Publicar se desactiva mientras haya errores.
- **Límites:** cada campo tiene contador contra los límites de WhatsApp que sirve `GET /api/admin/studio/limits`. Ningún número está escrito en el panel.

### Permisos

Según el §13 de la especificación:

| | super_admin | admin_operator |
|---|---|---|
| Datos y textos del negocio | sí | sí (su tenant) |
| Estructura del bot (opciones, capturas, palabras clave…) | sí | solo lectura |
| Empezar desde un molde, publicar | sí | no |
| Simular | sí | sí (su tenant) |

---

## 3. Lo que cubre de la especificación (§4.1) y lo que no

Regla 2: si el motor no lo ejecuta, el asistente no lo muestra. Lo que el motor hace solo se explica en notas, sin controles.

| Paso | Cubre | No cubre, y por qué |
|---|---|---|
| 1. Negocio | Nombre, horario (semana, sábado, domingo), mensaje fuera de horario, dueño | Tono (el motor no lo usa), dirección y ubicación (no hay variable), festivos (el motor no los conoce) |
| 2. Primer mensaje | Saludo y menú en un solo mensaje, botones o lista según el número de opciones | Encabezado de imagen y pie (el nodo no los tiene). Variantes cliente nuevo / que regresa / fuera de horario (C-02, sin ramificación por contexto) |
| 3. Opciones | Pide datos (lista previa de casos opcional, pregunta, confirmación opcional) y pasa a una persona · información con botones · pasar directo a una persona | Búsqueda en catálogo, cotizador, carrusel, CTA, ubicación y medios: el motor los tiene, pero el asistente todavía no. Fases 5 y 6 |
| 4. Cómo reconoce | Palabras clave por opción y en la confirmación; los choques los marca el validador | Desambiguación ante empate (B-02), palabras de escape por tenant (C-08) |
| 5. Cuando no entiende | Primer mensaje, 1 a 3 intentos y reintento, luego a una persona | Respuesta propia para audio, imagen o sticker (el motor los ignora, H-8) |
| 6. Paso a humano | Texto al cliente y alerta al dueño en cada caso; opción "Hablar con alguien" | Destino distinto al WhatsApp del dueño (decisión pendiente 4); cómo se devuelve la conversación (siempre `#listo` o a las 48 h) |
| 7. Despedida | Mensaje y palabras | Inactividad y baja: las maneja el motor igual para todos |
| 8. Probar y publicar | Revisión, simulador, guardar, publicar | Pruebas guardadas, explorador de ramas, diff y rollback: Fase 4 |

### Desvío: no usa los bloques compuestos

El inventario recomendaba armar el asistente sobre los bloques de #79. No encajan con la forma del molde de cerrajería: el Menú no tiene escalera de reintentos y la Captura no tiene el paso de confirmación con "sí / corregir". Adaptarlos habría cambiado bloques que el Designer ya ofrece. El compilador del asistente es propio y queda cubierto por el mismo validador y por la paridad con el molde. Los bloques siguen disponibles en el Designer.

---

## 4. Otros cambios que trajo la fase

- **WhatsApp del dueño editable desde el panel.** `PATCH /api/admin/tenants/:id` acepta `owner`. Antes no había forma de editarlo y es el destino de todas las alertas.
- **`FlowSchema` acepta `studio`**, opcional. Antes una clave extra se descartaba en silencio al publicar, así que ningún flow deja de ser publicable.
