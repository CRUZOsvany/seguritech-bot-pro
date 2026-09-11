/**
 * Qué manda el simulador cuando el operador toca un botón, una fila o una
 * card: lo mismo que el webhook de Meta le entregaría al bot, no lo que se
 * lee en pantalla.
 *
 * `content` va al backend; `label` es lo que se pinta en la burbuja del
 * cliente. Si el simulador mandara el título donde Meta manda el id, el
 * simulador y el bot real tomarían caminos distintos del intérprete — que es
 * justo como se escondió el bug de las listas dinámicas de papelería.
 *
 * Espejo de `MetaWhatsAppAdapter.parseIncomingMessage` (backend). Si esa
 * regla cambia, esta también.
 */

export interface SimulatedReply {
  content: string;
  label: string;
}

/**
 * Botón de respuesta: el título. `sendButtons` reemplaza los ids del flow por
 * `btn_0`/`btn_1`/`btn_2` al enviar, así que lo único con significado que
 * vuelve de Meta es el título.
 */
export function buttonReply(button: { id: string; title: string }): SimulatedReply {
  return { content: button.title, label: button.title };
}

/** Fila de lista: el id. `sendList` conserva los ids del flow. */
export function listReply(row: { id: string; title: string }): SimulatedReply {
  return { content: row.id || row.title, label: row.title };
}

/**
 * Quick reply de una card de carrusel: el id, salvo que sea uno de los
 * sintéticos `btn_<n>`, donde el parser cae al título. En un carrusel
 * dinámico todas las cards comparten el título, así que sin el id no hay
 * forma de saber cuál tocó el cliente.
 */
export function carouselReply(button: { id: string; title: string }): SimulatedReply {
  const synthetic = /^btn_\d+$/.test(button.id);
  return { content: button.id && !synthetic ? button.id : button.title, label: button.title };
}
