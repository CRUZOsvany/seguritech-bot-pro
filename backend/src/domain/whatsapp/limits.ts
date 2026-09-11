/**
 * Límites de la WhatsApp Cloud API — fuente única.
 *
 * Regla 4 de la especificación del Studio: el motor, el validador y el panel
 * leen los números de aquí; ningún componente los escribe a mano. El panel
 * los obtendrá del backend, por eso el objeto es JSON puro (sin funciones ni
 * clases) y se congela al cargar.
 *
 * Cada grupo trae `doc`, la página oficial de la que salen sus números, y
 * `unconfirmed`, las claves que esa página NO confirma explícitamente: se
 * conservan porque el código ya las aplica, pero no se deben presentar como
 * regla de Meta hasta verificarlas.
 *
 * Verificado contra la documentación oficial el 2026-09-10 (Fase 0 del
 * Studio, docs/studio/INVENTARIO.md §6). Meta cambia estos números seguido:
 * al cambiar uno, actualizar `verifiedAt` y el inventario.
 *
 * ESTADO DE ADOPCIÓN: hoy nadie importa este archivo todavía. `flowSchema.ts`
 * y `MetaWhatsAppAdapter.ts` siguen con sus números propios y en tres casos
 * divergen de estos (carrusel: mínimo de cards y largo del cuerpo de card;
 * lista: largo del cuerpo). Conectarlos es la Fase 2; hacerlo aquí cambiaría
 * qué flows se pueden publicar.
 */

const DOCS = 'https://developers.facebook.com/documentation/business-messaging/whatsapp';

export const WHATSAPP_LIMITS_VERIFIED_AT = '2026-09-10';

export const WHATSAPP_LIMITS = deepFreeze({
  text: {
    doc: `${DOCS}/messages/text-messages`,
    bodyMax: 4096,
  },

  replyButtons: {
    doc: `${DOCS}/messages/interactive-reply-buttons-messages`,
    buttonsMin: 1,
    buttonsMax: 3,
    buttonTitleMax: 20,
    buttonIdMax: 256,
    bodyMax: 1024,
    headerTypes: ['text', 'image', 'video', 'document'],
    headerTextMax: 60,
    footerMax: 60,
    unconfirmed: ['headerTextMax'],
  },

  list: {
    doc: `${DOCS}/messages/interactive-list-messages`,
    bodyMax: 4096,
    headerTypes: ['text'],
    headerTextMax: 60,
    footerMax: 60,
    buttonLabelMax: 20,
    sectionsMin: 1,
    sectionsMax: 10,
    rowsTotalMin: 1,
    rowsTotalMax: 10,
    sectionTitleMax: 24,
    rowTitleMax: 24,
    rowDescriptionMax: 72,
    rowIdMax: 200,
  },

  ctaUrl: {
    doc: `${DOCS}/messages/interactive-cta-url-messages`,
    headerTypes: ['text', 'image', 'video', 'document'],
    headerTextMax: 60,
    bodyMax: 1024,
    footerMax: 60,
    displayTextMax: 20,
    // La doc no fija un largo de URL; 2000 es el tope que ya aplica
    // `httpsUrlSchema` en flowSchema.ts.
    urlMax: 2000,
    unconfirmed: ['urlMax'],
  },

  mediaCarousel: {
    doc: `${DOCS}/messages/interactive-media-carousel-messages/`,
    cardsMin: 2,
    cardsMax: 10,
    bodyMax: 1024,
    mainHeaderAllowed: false,
    mainFooterAllowed: false,
    cardHeaderTypes: ['image', 'video'],
    cardBodyMax: 160,
    cardBodyMaxLineBreaks: 2,
    urlButtonsPerCard: 1,
    // "one or more quick-reply buttons": la doc no fija un máximo. 2 es lo
    // que hoy acepta flowSchema.ts.
    quickRepliesPerCardMax: 2,
    buttonLabelMax: 20,
    quickReplyIdMax: 256,
    sameButtonTypeAndCountAcrossCards: true,
    unconfirmed: ['quickRepliesPerCardMax'],
  },

  locationRequest: {
    doc: `${DOCS}/messages/location-request-messages`,
    bodyMax: 1024,
    // La doc solo documenta `body`. El `.strict()` de flowSchema.ts rechaza
    // header y footer; se mantiene como decisión conservadora del repo.
    headerAllowed: false,
    footerAllowed: false,
    unconfirmed: ['headerAllowed', 'footerAllowed'],
  },

  image: {
    doc: `${DOCS}/messages/image-messages`,
    captionMax: 1024,
    mimeTypes: ['image/jpeg', 'image/png'],
    maxBytes: 5 * 1024 * 1024,
  },

  document: {
    doc: `${DOCS}/messages/document-messages`,
    captionMax: 1024,
    // La doc no fija largo de filename; 240 es lo que aplica flowSchema.ts.
    filenameMax: 240,
    maxBytes: 100 * 1024 * 1024,
    unconfirmed: ['filenameMax'],
  },

  serviceWindow: {
    doc: `${DOCS}/messages/send-messages`,
    // Se abre con cada mensaje O llamada del cliente y se reinicia con cada
    // uno. Fuera de ella solo se pueden enviar plantillas aprobadas.
    hours: 24,
  },

  delivery: {
    doc: `${DOCS}/messages/send-messages`,
    // "the order in which messages are delivered is not guaranteed to match
    // the order of your API requests"
    orderGuaranteed: false,
    // La Cloud API cachea el archivo por URL; para reemplazar un medio hay
    // que versionar la URL.
    mediaLinkCacheMinutes: 10,
    // Reintentos de un mensaje no entregado (excepto plantillas de
    // autenticación, que duran 10 min).
    undeliveredTtlDays: 30,
  },

  addressMessages: {
    doc: `${DOCS}/messages/address-messages`,
    // "only available for businesses based in India and their India
    // customers". El Studio no los ofrece en México.
    availableCountries: ['IN'],
  },
} as const);

export type WhatsAppLimits = typeof WHATSAPP_LIMITS;

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const inner of Object.values(value)) deepFreeze(inner);
    Object.freeze(value);
  }
  return value;
}
