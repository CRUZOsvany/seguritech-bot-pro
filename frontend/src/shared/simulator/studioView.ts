import type { MetaPayload, SimEvent, SimSession } from '@/shared/api/studio';

/**
 * Traducciones puras que usa el simulador para pintar la conversación.
 *
 * La burbuja se arma desde el JSON EXACTO que se mandaría a WhatsApp, no
 * desde una representación intermedia: lo que se ve es lo que recibiría el
 * cliente. Y al tocar un botón o una fila se manda el id y el título que
 * trae ese JSON — lo mismo que Meta mandaría en el webhook —, así que el
 * simulador no necesita saber las reglas del parser: las aplica el backend.
 */

export type Bubble =
  | { kind: 'text'; text: string }
  | { kind: 'buttons'; text: string; buttons: Array<{ id: string; title: string }> }
  | {
      kind: 'list';
      text: string;
      button: string;
      sections: Array<{ title: string; rows: Array<{ id: string; title: string; description?: string }> }>;
    }
  | { kind: 'image'; url: string; caption?: string }
  | { kind: 'document'; filename: string; caption?: string }
  | { kind: 'location'; latitude: number; longitude: number; name?: string; address?: string }
  | { kind: 'cta'; header?: string; body: string; footer?: string; label: string; url: string }
  | { kind: 'location_request'; body: string }
  | {
      kind: 'carousel';
      body?: string;
      cards: Array<{
        media: 'image' | 'video';
        body: string;
        buttons: Array<{ kind: 'reply'; id: string; title: string } | { kind: 'url'; label: string; url: string }>;
      }>;
    }
  | { kind: 'reaction'; emoji: string }
  | { kind: 'call_permission'; body: string; footer?: string }
  | { kind: 'flow'; header?: string; body: string; footer?: string; cta: string }
  | { kind: 'unknown'; type: string };

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === 'object' ? (v as Obj) : {});
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const optStr = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const textOf = (v: unknown): string => str(obj(v).text);

export function bubbleFromPayload(payload: MetaPayload): Bubble {
  switch (payload.type) {
  case 'text':
    return { kind: 'text', text: str(obj(payload.text).body) };
  case 'image': {
    const image = obj(payload.image);
    return { kind: 'image', url: str(image.link), caption: optStr(image.caption) };
  }
  case 'document': {
    const doc = obj(payload.document);
    return { kind: 'document', filename: str(doc.filename), caption: optStr(doc.caption) };
  }
  case 'location': {
    const loc = obj(payload.location);
    return {
      kind: 'location',
      latitude: Number(loc.latitude),
      longitude: Number(loc.longitude),
      name: optStr(loc.name),
      address: optStr(loc.address),
    };
  }
  case 'reaction':
    return { kind: 'reaction', emoji: str(obj(payload.reaction).emoji) };
  case 'interactive':
    return interactiveBubble(obj(payload.interactive));
  default:
    return { kind: 'unknown', type: payload.type };
  }
}

function interactiveBubble(i: Obj): Bubble {
  const body = textOf(i.body);
  const action = obj(i.action);
  switch (i.type) {
  case 'button':
    return {
      kind: 'buttons',
      text: body,
      buttons: arr(action.buttons).map((b) => {
        const reply = obj(obj(b).reply);
        return { id: str(reply.id), title: str(reply.title) };
      }),
    };
  case 'list':
    return {
      kind: 'list',
      text: body,
      button: str(action.button),
      sections: arr(action.sections).map((s) => ({
        title: str(obj(s).title),
        rows: arr(obj(s).rows).map((r) => ({
          id: str(obj(r).id),
          title: str(obj(r).title),
          description: optStr(obj(r).description),
        })),
      })),
    };
  case 'cta_url': {
    const header = obj(i.header);
    const params = obj(action.parameters);
    return {
      kind: 'cta',
      header: header.type === 'text' ? optStr(header.text) : undefined,
      body,
      footer: optStr(obj(i.footer).text),
      label: str(params.display_text),
      url: str(params.url),
    };
  }
  case 'location_request_message':
    return { kind: 'location_request', body };
  case 'media_carousel':
    return {
      kind: 'carousel',
      body: body || undefined,
      cards: arr(obj(arr(action.sections)[0]).cards).map((c) => {
        const card = obj(c);
        return {
          media: obj(card.header).type === 'video' ? 'video' : 'image',
          body: textOf(card.body),
          buttons: arr(obj(card.action).buttons).map((b) => {
            const button = obj(b);
            if (button.type === 'reply') {
              const reply = obj(button.reply);
              return { kind: 'reply' as const, id: str(reply.id), title: str(reply.title) };
            }
            const params = obj(button.parameters);
            return { kind: 'url' as const, label: str(params.display_text), url: str(params.url) };
          }),
        };
      }),
    };
  case 'call_permission_request':
    return { kind: 'call_permission', body, footer: optStr(obj(i.footer).text) };
  case 'flow':
    return {
      kind: 'flow',
      header: optStr(obj(i.header).text),
      body,
      footer: optStr(obj(i.footer).text),
      cta: str(obj(action.parameters).flow_cta),
    };
  default:
    return { kind: 'unknown', type: `interactive/${str(i.type)}` };
  }
}

/** Ubicación que manda el cliente simulado: el centro de Chilpancingo. */
export const SIMULATED_LOCATION: SimEvent = {
  type: 'location',
  latitude: 17.5506,
  longitude: -99.5024,
  name: 'Ubicación simulada',
};

/** Cómo se ve en el chat lo que hizo el cliente, o una nota del sistema si no fue un mensaje. */
export function eventLabel(event: SimEvent): { from: 'user' | 'system'; text: string } {
  switch (event.type) {
  case 'text':
    return { from: 'user', text: event.text };
  case 'button_reply':
    return { from: 'user', text: event.title };
  case 'list_reply':
    return { from: 'user', text: event.title || event.id };
  case 'location':
    return { from: 'user', text: '📍 Ubicación compartida' };
  case 'media':
    return { from: 'user', text: `📎 ${MEDIA_LABEL[event.mediaType]}` };
  case 'advance_time':
    return { from: 'system', text: `⏩ Pasan ${formatMinutes(event.minutes)}` };
  }
}

const MEDIA_LABEL: Record<Extract<SimEvent, { type: 'media' }>['mediaType'], string> = {
  image: 'Imagen',
  audio: 'Nota de voz',
  video: 'Video',
  document: 'Documento',
  sticker: 'Sticker',
  contacts: 'Contacto',
  reaction: 'Reacción',
};

export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 24) return rest ? `${hours} h ${rest} min` : `${hours} h`;
  const days = Math.floor(hours / 24);
  const h = hours % 24;
  return `${days} ${days === 1 ? 'día' : 'días'}${h ? ` ${h} h` : ''}`;
}

/** Variables capturadas, sin las que están vacías. */
export function sessionVariables(session: SimSession | null): Array<[string, string]> {
  if (!session) return [];
  return Object.entries(session.context)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)]);
}

/**
 * ISO 8601 de HOY (calendario en America/Mexico_City) a la hora `HH:MM`
 * elegida, con offset fijo -06:00. México eliminó el horario de verano en la
 * reforma de 2022 (excepto la franja fronteriza), así que el offset no varía.
 */
export function startAtTodayAt(time: string, now: Date = new Date()): string {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  return `${today}T${time}:00-06:00`;
}

/** "sáb 12 sep, 22:03" en hora de México. */
export function formatWhen(iso: string): string {
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: 'America/Mexico_City',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
}
