import type pino from 'pino';
import { z } from 'zod';
import type { SimulatedTurn, SimulationStep } from '@/domain/use-cases/SimulateConversationUseCase';
import { parseMetaWebhook } from '@/infrastructure/adapters/MetaWhatsAppAdapter';
import { buildMetaPayload, type MetaSendPayload } from '@/infrastructure/adapters/meta/metaPayloads';

/**
 * Traducción entre la API del simulador del Studio y el motor.
 *
 * Entrada: cada evento del cliente simulado se convierte en el webhook que
 * Meta mandaría y pasa por el parser REAL (parseMetaWebhook). Un toque de
 * botón llega al motor con el mismo `content` que en producción — título si
 * el id es sintético btn_N, id si es una fila o una card — sin que el
 * simulador tenga que saber esas reglas.
 *
 * Salida: cada mensaje del bot se convierte en el JSON exacto de la Cloud API
 * con buildMetaPayload, la misma función que usa el envío real.
 */

/** Lo que el cliente simulado hace, en el vocabulario del webhook de Meta. */
export const SimEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: z.string().min(1).max(4096) }),
  /** Tocar un botón de respuesta o el quick reply de una card: id y título tal como vienen en el payload que se envió. */
  z.object({
    type: z.literal('button_reply'),
    id: z.string().min(1).max(256),
    title: z.string().min(1).max(20),
  }),
  /** Elegir una fila de una lista. */
  z.object({
    type: z.literal('list_reply'),
    id: z.string().min(1).max(200),
    title: z.string().max(24).default(''),
  }),
  z.object({
    type: z.literal('location'),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    name: z.string().max(1000).optional(),
    address: z.string().max(1000).optional(),
  }),
  /** Cualquier cosa que no es texto ni interactiva. Hoy el parser las descarta (hallazgo H-8). */
  z.object({
    type: z.literal('media'),
    mediaType: z.enum(['image', 'audio', 'video', 'document', 'sticker', 'contacts', 'reaction']),
  }),
  /** Adelantar el reloj simulado: inactividad, expiración de sesión, fin de la pausa por humano. */
  z.object({
    type: z.literal('advance_time'),
    minutes: z.number().int().positive().max(60 * 24 * 30),
  }),
]);

export type SimEvent = z.infer<typeof SimEventSchema>;

/** Número de negocio de mentira para el sobre del webhook: el parser lo exige, el motor no lo usa. */
const SIM_BUSINESS_NUMBER = '5210000000001';

export function eventToStep(
  event: SimEvent,
  index: number,
  from: string,
  logger: pino.Logger,
): SimulationStep {
  if (event.type === 'advance_time') return { kind: 'advance_time', minutes: event.minutes };

  const messageId = `wamid.sim.${index + 1}`;
  const parsed = parseMetaWebhook(inboundWebhook(event, from, messageId), logger);
  return {
    kind: 'inbound',
    content: parsed?.content ?? null,
    messageId,
    ...(parsed ? {} : { ignoredReason: `mensaje de tipo ${describe(event)}` }),
  };
}

function describe(event: Exclude<SimEvent, { type: 'advance_time' }>): string {
  return event.type === 'media' ? event.mediaType : event.type;
}

/** El webhook que Meta mandaría para este evento (forma de la doc de webhooks de la Cloud API). */
export function inboundWebhook(
  event: Exclude<SimEvent, { type: 'advance_time' }>,
  from: string,
  messageId: string,
): unknown {
  const base = { from, id: messageId, timestamp: '0' };
  let message: Record<string, unknown>;
  switch (event.type) {
  case 'text':
    message = { ...base, type: 'text', text: { body: event.text } };
    break;
  case 'button_reply':
    message = {
      ...base,
      type: 'interactive',
      interactive: { type: 'button_reply', button_reply: { id: event.id, title: event.title } },
    };
    break;
  case 'list_reply':
    message = {
      ...base,
      type: 'interactive',
      interactive: { type: 'list_reply', list_reply: { id: event.id, title: event.title } },
    };
    break;
  case 'location':
    message = {
      ...base,
      type: 'location',
      location: {
        latitude: event.latitude,
        longitude: event.longitude,
        ...(event.name ? { name: event.name } : {}),
        ...(event.address ? { address: event.address } : {}),
      },
    };
    break;
  case 'media':
    message = { ...base, type: event.mediaType, [event.mediaType]: { id: `media.sim.${messageId}` } };
    break;
  }

  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'sim-waba',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: SIM_BUSINESS_NUMBER, phone_number_id: 'sim-phone' },
              contacts: [{ wa_id: from, profile: { name: 'Cliente simulado' } }],
              messages: [message],
            },
          },
        ],
      },
    ],
  };
}

export interface ApiOutbound {
  to: string;
  audience: 'customer' | 'owner';
  /** JSON exacto que se mandaría a la Cloud API, o null si el adaptador real no lo enviaría. */
  payload: MetaSendPayload | null;
  /** Por qué no se enviaría (lista o carrusel fuera de rango). */
  rejected?: string;
}

export interface ApiTurn extends Omit<SimulatedTurn, 'outbound'> {
  outbound: ApiOutbound[];
}

export function toApiTurn(turn: SimulatedTurn, turnIndex: number): ApiTurn {
  return {
    ...turn,
    outbound: turn.outbound.map((m, i) => {
      const built = buildMetaPayload(m.to, m.content, { flowToken: `ft_sim_${turnIndex + 1}_${i + 1}` });
      return built.ok
        ? { to: m.to, audience: m.audience, payload: built.payload }
        : { to: m.to, audience: m.audience, payload: null, rejected: built.reason };
    }),
  };
}
