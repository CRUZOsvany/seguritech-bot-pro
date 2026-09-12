/**
 * buildMetaPayload: el JSON de la Cloud API que comparten el envío real y
 * el simulador. Las reglas raras que fija este test son las de siempre del
 * adaptador; están aquí para que moverlas sea una decisión, no un accidente.
 */
import { buildMetaPayload, normalizeWaId } from '@/infrastructure/adapters/meta/metaPayloads';

describe('normalizeWaId', () => {
  it.each([
    ['5217471234567', '527471234567'],
    ['+52 1 747 123 4567', '527471234567'],
    ['527471234567', '527471234567'],
    ['5491123456789', '541123456789'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeWaId(input)).toBe(expected);
  });
});

describe('buildMetaPayload', () => {
  it('botones: ids sintéticos btn_N y títulos recortados a 20, aunque el flow traiga otros ids', () => {
    const built = buildMetaPayload('5217471234567', {
      kind: 'buttons',
      text: 'Elige',
      buttons: [
        { id: 'emergencia', title: '🚨 Emergencia' },
        { id: 'agendar', title: 'Un título larguísimo de más de veinte' },
      ],
    });

    expect(built).toEqual({
      ok: true,
      payload: {
        messaging_product: 'whatsapp',
        to: '527471234567',
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text: 'Elige' },
          action: {
            buttons: [
              { type: 'reply', reply: { id: 'btn_0', title: '🚨 Emergencia' } },
              { type: 'reply', reply: { id: 'btn_1', title: 'Un título larguísimo' } },
            ],
          },
        },
      },
    });
  });

  it('botones vacíos: se manda como texto', () => {
    expect(buildMetaPayload('527471234567', { kind: 'buttons', text: 'Hola', buttons: [] })).toEqual({
      ok: true,
      payload: { messaging_product: 'whatsapp', to: '527471234567', type: 'text', text: { body: 'Hola' } },
    });
  });

  it('lista: conserva los ids de las filas', () => {
    const built = buildMetaPayload('527471234567', {
      kind: 'list',
      text: 'Servicios',
      buttonLabel: 'Ver',
      sections: [{ title: 'Servicios', items: [{ id: 'svc-1', title: 'Engargolado' }] }],
    });

    expect(built.ok && built.payload).toMatchObject({
      interactive: { action: { sections: [{ rows: [{ id: 'svc-1', title: 'Engargolado' }] }] } },
    });
  });

  it('lista con más de 10 filas: no se envía, con el motivo', () => {
    const items = Array.from({ length: 11 }, (_, i) => ({ id: `r${i}`, title: `Fila ${i}` }));
    expect(
      buildMetaPayload('527471234567', { kind: 'list', text: 'x', buttonLabel: 'Ver', sections: [{ title: 'S', items }] }),
    ).toEqual({ ok: false, reason: 'List inválida: total rows debe ser 1..10' });
  });

  it('carrusel sin cards: no se envía, con el motivo', () => {
    expect(buildMetaPayload('527471234567', { kind: 'media_carousel', body: 'x', cards: [] })).toEqual({
      ok: false,
      reason: 'Carrusel inválido: 1..10 cards',
    });
  });

  it('WhatsApp Flow: usa el flow_token que le pasan', () => {
    const built = buildMetaPayload(
      '527471234567',
      { kind: 'whatsapp_flow', body: 'Agenda', flow_id_meta: 'F1', flow_cta: 'Abrir', mode: 'published' },
      { flowToken: 'ft_sim_1_1' },
    );

    expect(built.ok && built.payload).toMatchObject({
      interactive: { action: { parameters: { flow_token: 'ft_sim_1_1', flow_id: 'F1', mode: 'published' } } },
    });
  });

  it('reacción: apunta al mensaje del cliente', () => {
    expect(
      buildMetaPayload('527471234567', { kind: 'reaction', emoji: '👍', messageId: 'wamid.X' }),
    ).toEqual({
      ok: true,
      payload: {
        messaging_product: 'whatsapp',
        to: '527471234567',
        type: 'reaction',
        reaction: { message_id: 'wamid.X', emoji: '👍' },
      },
    });
  });
});
