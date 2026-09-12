/**
 * Orden de entrega (§7.7) y pausa entre mensajes (DEC-08): el marcapasos
 * espera el "entregado" del mensaje anterior al mismo cliente, con tope, y la
 * pausa de 600–1200 ms. Relojes falsos de jest: nada espera de verdad.
 */
import { DeliveryPacer } from '@/infrastructure/adapters/meta/deliveryPacer';

beforeEach(() => jest.useFakeTimers({ now: new Date('2026-09-11T12:00:00Z') }));
afterEach(() => jest.useRealTimers());

/** random 0 → la pausa mínima (600 ms). */
const pacer = (opts: ConstructorParameters<typeof DeliveryPacer>[0] = {}) => new DeliveryPacer({ random: () => 0, ...opts });

/** Arranca beforeSend y deja ver si ya terminó. */
function start(p: DeliveryPacer, recipient: string) {
  const state = { done: false };
  void p.beforeSend(recipient).then(() => { state.done = true; });
  return state;
}

describe('DeliveryPacer', () => {
  it('el primer mensaje a un cliente sale sin esperar', async () => {
    const s = start(pacer(), '5217471234567');

    await jest.advanceTimersByTimeAsync(0);

    expect(s.done).toBe(true);
  });

  it('espera el "entregado" del anterior y completa la pausa de DEC-08', async () => {
    const p = pacer();
    p.sent('52747', 'wamid.1');
    const s = start(p, '52747');

    await jest.advanceTimersByTimeAsync(500);
    expect(s.done).toBe(false);

    p.onStatus('wamid.1', 'delivered');
    await jest.advanceTimersByTimeAsync(0);
    expect(s.done).toBe(false); // faltan 100 ms para los 600

    await jest.advanceTimersByTimeAsync(100);
    expect(s.done).toBe(true);
  });

  it.each(['read', 'failed'])('"%s" también deja seguir', async (status) => {
    const p = pacer();
    p.sent('52747', 'wamid.1');
    const s = start(p, '52747');

    await jest.advanceTimersByTimeAsync(700);
    expect(s.done).toBe(false);
    p.onStatus('wamid.1', status);
    await jest.advanceTimersByTimeAsync(0);

    expect(s.done).toBe(true);
  });

  it('"sent" no cuenta: sigue esperando', async () => {
    const p = pacer();
    p.sent('52747', 'wamid.1');
    const s = start(p, '52747');

    p.onStatus('wamid.1', 'sent');
    await jest.advanceTimersByTimeAsync(1000);

    expect(s.done).toBe(false);
  });

  it('sin "entregado", manda al cumplirse el tope', async () => {
    const p = pacer({ deliveryTimeoutMs: 2000 });
    p.sent('52747', 'wamid.1');
    const s = start(p, '52747');

    await jest.advanceTimersByTimeAsync(1999);
    expect(s.done).toBe(false);
    await jest.advanceTimersByTimeAsync(1);

    expect(s.done).toBe(true);
  });

  it('un "entregado" que llegó antes solo deja la pausa', async () => {
    const p = pacer();
    p.sent('52747', 'wamid.1');
    p.onStatus('wamid.1', 'delivered');
    const s = start(p, '52747');

    await jest.advanceTimersByTimeAsync(599);
    expect(s.done).toBe(false);
    await jest.advanceTimersByTimeAsync(1);

    expect(s.done).toBe(true);
  });

  it('cada cliente por su lado: la alerta al dueño no espera al cliente', async () => {
    const p = pacer();
    p.sent('cliente', 'wamid.1');
    const s = start(p, 'dueño');

    await jest.advanceTimersByTimeAsync(0);

    expect(s.done).toBe(true);
  });

  it('un mensaje de otro turno (hace más de 15 s) ya no hace esperar', async () => {
    const p = pacer();
    p.sent('52747', 'wamid.1');
    await jest.advanceTimersByTimeAsync(16_000);
    const s = start(p, '52747');

    await jest.advanceTimersByTimeAsync(0);

    expect(s.done).toBe(true);
  });

  it('la pausa va de 600 a 1200 ms según el azar', async () => {
    const p = pacer({ random: () => 0.9999 });
    p.sent('52747', 'wamid.1');
    p.onStatus('wamid.1', 'delivered');
    const s = start(p, '52747');

    await jest.advanceTimersByTimeAsync(1199);
    expect(s.done).toBe(false);
    await jest.advanceTimersByTimeAsync(1);

    expect(s.done).toBe(true);
  });

  it('sin id del mensaje anterior no hay a qué esperar', async () => {
    const p = pacer();
    p.sent('52747', undefined);
    const s = start(p, '52747');

    await jest.advanceTimersByTimeAsync(0);

    expect(s.done).toBe(true);
  });
});
