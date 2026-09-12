/**
 * Orden de entrega (§7.7) de punta a punta en el adaptador de Meta: el
 * segundo mensaje al mismo cliente no sale hasta que el webhook avisa que el
 * primero se entregó (o se cumple el tope). HTTP y relojes falsos.
 * No probado contra un número real (A-01).
 */
import type { MetaCredentialsRepository } from '@/domain/ports';
import { MetaWhatsAppAdapter, parseMetaStatuses } from '@/infrastructure/adapters/MetaWhatsAppAdapter';
import { DeliveryPacer } from '@/infrastructure/adapters/meta/deliveryPacer';
import { HARNESS_CUSTOMER_PHONE, HARNESS_TENANT_ID, silentLogger } from '../utils/conversationHarness';

const creds = { tenantId: HARNESS_TENANT_ID, phoneNumberId: 'PNID', wabaId: 'W', displayPhoneNumber: '5217470000000', accessToken: 'token', isActive: true };

/** Webhook de estados, con la forma de la doc de Meta (webhooks/components). */
function statusWebhook(id: string, status: string) {
  return {
    object: 'whatsapp_business_account',
    entry: [{
      id: 'WABA',
      changes: [{
        field: 'messages',
        value: {
          messaging_product: 'whatsapp',
          metadata: { display_phone_number: '5217470000000', phone_number_id: 'PNID' },
          statuses: [{ id, status, timestamp: '1757592000', recipient_id: '527471234567' }],
        },
      }],
    }],
  };
}

describe('parseMetaStatuses', () => {
  it('lee id, estado y destinatario; ignora lo mal formado', () => {
    expect(parseMetaStatuses(statusWebhook('wamid.1', 'delivered'))).toEqual([{ id: 'wamid.1', status: 'delivered', recipientId: '527471234567' }]);
    expect(parseMetaStatuses({ entry: [{ changes: [{ value: { statuses: [{ status: 'read' }] } }] }] })).toEqual([]);
    expect(parseMetaStatuses(null)).toEqual([]);
  });
});

describe('MetaWhatsAppAdapter con marcapasos', () => {
  let n = 0;
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-09-11T12:00:00Z') });
    n = 0;
    fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async () =>
      new Response(JSON.stringify({ messages: [{ id: `wamid.out.${++n}` }] }), { status: 200 }),
    );
  });
  afterEach(() => {
    fetchSpy.mockRestore();
    jest.useRealTimers();
  });

  const adapter = (pacer?: DeliveryPacer) =>
    new MetaWhatsAppAdapter(silentLogger, { findByTenantId: async () => creds } as unknown as MetaCredentialsRepository, undefined, pacer);

  it('el segundo mensaje espera el "entregado" del primero y la pausa de DEC-08', async () => {
    const a = adapter(new DeliveryPacer({ random: () => 0 }));
    const turn = (async () => {
      await a.sendMessage(HARNESS_TENANT_ID, HARNESS_CUSTOMER_PHONE, 'uno');
      await a.sendMessage(HARNESS_TENANT_ID, HARNESS_CUSTOMER_PHONE, 'dos');
    })();

    await jest.advanceTimersByTimeAsync(1000);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    a.handleStatuses(statusWebhook('wamid.out.1', 'delivered'));
    await jest.advanceTimersByTimeAsync(0);
    await turn;

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetchSpy.mock.calls[1][1]?.body)).text.body).toBe('dos');
  });

  it('si el "entregado" no llega, manda al cumplirse el tope', async () => {
    const a = adapter(new DeliveryPacer({ random: () => 0, deliveryTimeoutMs: 2000 }));
    const turn = (async () => {
      await a.sendMessage(HARNESS_TENANT_ID, HARNESS_CUSTOMER_PHONE, 'uno');
      await a.sendMessage(HARNESS_TENANT_ID, HARNESS_CUSTOMER_PHONE, 'dos');
    })();

    await jest.advanceTimersByTimeAsync(1999);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);
    await turn;

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('"escribiendo…" no espera ni hace esperar', async () => {
    const a = adapter(new DeliveryPacer({ random: () => 0 }));

    await a.sendTypingIndicator(HARNESS_TENANT_ID, HARNESS_CUSTOMER_PHONE, 'wamid.in');
    const send = a.sendMessage(HARNESS_TENANT_ID, HARNESS_CUSTOMER_PHONE, 'hola');
    await jest.advanceTimersByTimeAsync(0);
    await send;

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('sin marcapasos se manda sin esperar, como antes', async () => {
    const a = adapter();

    await a.sendMessage(HARNESS_TENANT_ID, HARNESS_CUSTOMER_PHONE, 'uno');
    await a.sendMessage(HARNESS_TENANT_ID, HARNESS_CUSTOMER_PHONE, 'dos');

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
