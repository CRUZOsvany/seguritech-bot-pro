/**
 * Prioridad id / title al parsear un button_reply.
 *
 * `sendButtons` descarta los ids del flow y manda `btn_0`/`btn_1`/`btn_2`
 * (MetaWhatsAppAdapter.sendButtons), así que para un send_buttons el único
 * dato con significado que vuelve es el título — por eso el parser lo prefería
 * siempre.
 *
 * `sendMediaCarousel` en cambio SÍ conserva el id real del quick_reply, y en un
 * carrusel dinámico ese id es el id del producto. Como todas las cards
 * generadas comparten el mismo `button_title`, quedarse con el título haría
 * imposible saber cuál card tocó el cliente.
 *
 * De ahí la regla: se prefiere el id salvo que sea uno de los sintéticos.
 * Estos tests fijan las dos mitades, porque la rama afecta a TODOS los
 * mensajes de botón, no solo a los del carrusel.
 */

import { MetaWhatsAppAdapter } from '@/infrastructure/adapters/MetaWhatsAppAdapter';
import type { MetaCredentialsRepository } from '@/domain/ports';
import pino from 'pino';

const logger = pino({ level: 'silent' });

// parseIncomingMessage trabaja sobre el payload bruto, antes de saber el
// tenantId: nunca toca el repositorio de credenciales.
const credsRepo = {} as unknown as MetaCredentialsRepository;

function makeAdapter(): MetaWhatsAppAdapter {
  return new MetaWhatsAppAdapter(logger, credsRepo);
}

function webhookConButtonReply(id: string, title: string) {
  return {
    entry: [
      {
        changes: [
          {
            value: {
              metadata: { display_phone_number: '5217471234567' },
              messages: [
                {
                  id: 'wamid.TEST',
                  from: '5217479876543',
                  timestamp: '1757280000',
                  type: 'interactive',
                  interactive: {
                    type: 'button_reply',
                    button_reply: { id, title },
                  },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

describe('parseIncomingMessage — button_reply: id vs title', () => {
  it('con id sintetico btn_0 usa el titulo (routing de send_buttons intacto)', () => {
    const parsed = makeAdapter().parseIncomingMessage(
      webhookConButtonReply('btn_0', 'Utiles escolares'),
    );

    expect(parsed?.content).toBe('Utiles escolares');
  });

  it('btn_2 tambien es sintetico', () => {
    const parsed = makeAdapter().parseIncomingMessage(
      webhookConButtonReply('btn_2', 'Hablar con alguien'),
    );

    expect(parsed?.content).toBe('Hablar con alguien');
  });

  it('con id real de una card de carrusel usa el id', () => {
    const parsed = makeAdapter().parseIncomingMessage(
      webhookConButtonReply('prod-cuaderno', 'Lo quiero'),
    );

    // Sin esta rama, las diez cards de un carrusel dinamico llegarian todas
    // como 'Lo quiero' y seria imposible saber cual toco el cliente.
    expect(parsed?.content).toBe('prod-cuaderno');
  });

  it('un id que empieza con btn_ pero no es btn_<digitos> no es sintetico', () => {
    const parsed = makeAdapter().parseIncomingMessage(
      webhookConButtonReply('btn_taladro', 'Ver taladro'),
    );

    expect(parsed?.content).toBe('btn_taladro');
  });

  it('un uuid de producto se conserva tal cual', () => {
    const uuid = '3f1a7c2e-9b44-4d61-8f0a-2c5e7d8b1a90';
    const parsed = makeAdapter().parseIncomingMessage(webhookConButtonReply(uuid, 'Lo quiero'));

    expect(parsed?.content).toBe(uuid);
  });

  it('el messageId sigue viajando (lo necesita send_reaction)', () => {
    const parsed = makeAdapter().parseIncomingMessage(webhookConButtonReply('btn_0', 'Si'));

    expect(parsed?.messageId).toBe('wamid.TEST');
  });
});
