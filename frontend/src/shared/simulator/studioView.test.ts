import { describe, expect, it } from 'vitest';
import type { MetaPayload } from '@/shared/api/studio';
import {
  bubbleFromPayload,
  eventLabel,
  formatMinutes,
  sessionVariables,
  startAtTodayAt,
} from './studioView';

// Payloads con la forma exacta que arma buildMetaPayload en el backend
// (backend/src/infrastructure/adapters/meta/metaPayloads.ts).
const base = { messaging_product: 'whatsapp', to: '520000000000' };

describe('bubbleFromPayload', () => {
  it('texto', () => {
    expect(bubbleFromPayload({ ...base, type: 'text', text: { body: 'Hola' } } as MetaPayload)).toEqual({
      kind: 'text',
      text: 'Hola',
    });
  });

  it('botones: conserva id y título tal como van a WhatsApp, para devolverlos al tocar', () => {
    const payload = {
      ...base,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: '¿Qué necesitas?' },
        action: {
          buttons: [
            { type: 'reply', reply: { id: 'btn_0', title: '🚨 Emergencia' } },
            { type: 'reply', reply: { id: 'btn_1', title: '📅 Agendar' } },
          ],
        },
      },
    } as MetaPayload;

    expect(bubbleFromPayload(payload)).toEqual({
      kind: 'buttons',
      text: '¿Qué necesitas?',
      buttons: [
        { id: 'btn_0', title: '🚨 Emergencia' },
        { id: 'btn_1', title: '📅 Agendar' },
      ],
    });
  });

  it('lista: secciones y filas con su id', () => {
    const payload = {
      ...base,
      type: 'interactive',
      interactive: {
        type: 'list',
        body: { text: 'Servicios' },
        action: {
          button: 'Ver servicios',
          sections: [{ title: 'Servicios', rows: [{ id: 'svc-1', title: 'Engargolado', description: '$35' }] }],
        },
      },
    } as MetaPayload;

    expect(bubbleFromPayload(payload)).toEqual({
      kind: 'list',
      text: 'Servicios',
      button: 'Ver servicios',
      sections: [{ title: 'Servicios', rows: [{ id: 'svc-1', title: 'Engargolado', description: '$35' }] }],
    });
  });

  it('carrusel: tarjetas con respuesta rápida y con enlace', () => {
    const payload = {
      ...base,
      type: 'interactive',
      interactive: {
        type: 'media_carousel',
        body: { text: 'Productos' },
        action: {
          sections: [{
            cards: [
              {
                header: { type: 'image', image: { link: 'https://x/a.jpg' } },
                body: { text: 'Cuaderno' },
                action: { buttons: [{ type: 'reply', reply: { id: 'prod-1', title: 'Lo quiero' } }] },
              },
              {
                header: { type: 'video', video: { link: 'https://x/b.mp4' } },
                body: { text: 'Mochila' },
                action: { buttons: [{ type: 'cta_url', parameters: { display_text: 'Ver', url: 'https://x' } }] },
              },
            ],
          }],
        },
      },
    } as MetaPayload;

    expect(bubbleFromPayload(payload)).toEqual({
      kind: 'carousel',
      body: 'Productos',
      cards: [
        { media: 'image', body: 'Cuaderno', buttons: [{ kind: 'reply', id: 'prod-1', title: 'Lo quiero' }] },
        { media: 'video', body: 'Mochila', buttons: [{ kind: 'url', label: 'Ver', url: 'https://x' }] },
      ],
    });
  });

  it('CTA con encabezado de texto y pie', () => {
    const payload = {
      ...base,
      type: 'interactive',
      interactive: {
        type: 'cta_url',
        header: { type: 'text', text: 'Catálogo' },
        body: { text: 'Mira todo' },
        footer: { text: 'Actualizado hoy' },
        action: { name: 'cta_url', parameters: { display_text: 'Abrir', url: 'https://x' } },
      },
    } as MetaPayload;

    expect(bubbleFromPayload(payload)).toEqual({
      kind: 'cta',
      header: 'Catálogo',
      body: 'Mira todo',
      footer: 'Actualizado hoy',
      label: 'Abrir',
      url: 'https://x',
    });
  });

  it('solicitud de ubicación', () => {
    const payload = {
      ...base,
      type: 'interactive',
      interactive: { type: 'location_request_message', body: { text: '¿Dónde estás?' }, action: { name: 'send_location' } },
    } as MetaPayload;

    expect(bubbleFromPayload(payload)).toEqual({ kind: 'location_request', body: '¿Dónde estás?' });
  });

  it('un tipo que no conoce no revienta: lo marca como desconocido', () => {
    expect(bubbleFromPayload({ ...base, type: 'sticker' } as MetaPayload)).toEqual({ kind: 'unknown', type: 'sticker' });
  });
});

describe('eventLabel', () => {
  it('lo que ve el cliente en su burbuja', () => {
    expect(eventLabel({ type: 'button_reply', id: 'btn_0', title: '🚨 Emergencia' })).toEqual({
      from: 'user',
      text: '🚨 Emergencia',
    });
    expect(eventLabel({ type: 'list_reply', id: 'svc-1', title: 'Engargolado' }).text).toBe('Engargolado');
    expect(eventLabel({ type: 'media', mediaType: 'audio' }).text).toBe('📎 Nota de voz');
  });

  it('adelantar el reloj es una nota del sistema, no un mensaje del cliente', () => {
    expect(eventLabel({ type: 'advance_time', minutes: 180 })).toEqual({ from: 'system', text: '⏩ Pasan 3 h' });
  });
});

describe('utilidades', () => {
  it('formatMinutes', () => {
    expect([30, 90, 180, 1440, 2940].map(formatMinutes)).toEqual([
      '30 min',
      '1 h 30 min',
      '3 h',
      '1 día',
      '2 días 1 h',
    ]);
  });

  it('sessionVariables omite las vacías', () => {
    expect(
      sessionVariables({
        currentNodeId: 'x',
        context: { servicio: 'Engargolado', vacia: '', nula: null, cantidad: 3 },
        lastInboundAt: null,
        humanPausedUntil: null,
        optedOut: false,
      }),
    ).toEqual([
      ['servicio', 'Engargolado'],
      ['cantidad', '3'],
    ]);
  });

  it('startAtTodayAt usa el día de hoy en México y offset -06:00', () => {
    // 2026-09-11 03:00 UTC es todavía 10 de septiembre en México.
    expect(startAtTodayAt('22:00', new Date('2026-09-11T03:00:00Z'))).toBe('2026-09-10T22:00:00-06:00');
  });
});
