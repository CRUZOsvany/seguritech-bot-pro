/**
 * Contrato de los adaptadores falsos del simulador.
 *
 * El test de paridad usa InMemorySessionRepository en los DOS lados, así que
 * no puede detectar que este falso se comporte distinto a bot_users. Por eso
 * su semántica se fija aquí, contra lo que hace SupabaseUserRepository. Ya
 * pasó una vez: un update() que reemplazaba el registro entero borraba
 * lastInboundAt y la sesión simulada no expiraba nunca.
 */
import { UserState } from '@/domain/entities';
import type { User } from '@/domain/entities';
import {
  FakeClock,
  InMemorySessionRepository,
  SequentialIdGenerator,
} from '@/domain/conversation/simulation/fakes';

const T = 't1';
const PHONE = '5217471234567';

function user(overrides: Partial<User> = {}): User {
  return {
    id: 'u1',
    tenantId: T,
    phoneNumber: PHONE,
    currentState: UserState.INITIAL,
    currentNodeId: 'menu',
    context: { a: 1 },
    createdAt: new Date('2026-09-10T00:00:00Z'),
    updatedAt: new Date('2026-09-10T00:00:00Z'),
    ...overrides,
  };
}

describe('InMemorySessionRepository (semántica de bot_users)', () => {
  const clock = new FakeClock(new Date('2026-09-10T12:00:00Z'));

  it('update() no toca lastInboundAt ni optedOutAt, igual que el UPDATE real', async () => {
    const repo = new InMemorySessionRepository(clock);
    await repo.save(user());
    const inbound = new Date('2026-09-10T12:00:00Z');
    await repo.touchLastInbound(T, PHONE, inbound);
    await repo.setOptOut(T, PHONE, inbound);

    await repo.update(user({ currentNodeId: 'otro', lastInboundAt: null, optedOutAt: null }));

    const stored = await repo.findByPhoneNumber(T, PHONE);
    expect(stored?.currentNodeId).toBe('otro');
    expect(stored?.lastInboundAt).toEqual(inbound);
    expect(stored?.optedOutAt).toEqual(inbound);
  });

  it('update() sí escribe la pausa, como human_paused_until en el UPDATE real', async () => {
    const repo = new InMemorySessionRepository(clock);
    await repo.save(user());
    const until = new Date('2026-09-12T12:00:00Z');

    await repo.update(user({ humanPausedUntil: until }));

    expect((await repo.findByPhoneNumber(T, PHONE))?.humanPausedUntil).toEqual(until);
  });

  it('save() inserta sin pausa, sin último mensaje y sin opt-out', async () => {
    const repo = new InMemorySessionRepository(clock);
    await repo.save(user({ humanPausedUntil: new Date(), lastInboundAt: new Date(), optedOutAt: new Date() }));

    expect(await repo.findByPhoneNumber(T, PHONE)).toMatchObject({
      humanPausedUntil: null,
      lastInboundAt: null,
      optedOutAt: null,
    });
  });

  it('devuelve copias: modificar lo leído no cambia lo guardado', async () => {
    const repo = new InMemorySessionRepository(clock);
    await repo.save(user());

    const read = await repo.findByPhoneNumber(T, PHONE);
    read!.context = { cambiado: true };
    await repo.touchLastInbound(T, PHONE, new Date('2026-09-10T13:00:00Z'));

    expect((await repo.findByPhoneNumber(T, PHONE))?.context).toEqual({ a: 1 });
    expect(read!.lastInboundAt).toBeNull();
  });

  it('aísla por tenant', async () => {
    const repo = new InMemorySessionRepository(clock);
    await repo.save(user());

    expect(await repo.findByPhoneNumber('otro-tenant', PHONE)).toBeNull();
    await repo.update(user({ tenantId: 'otro-tenant', currentNodeId: 'x' }));
    expect((await repo.findByPhoneNumber(T, PHONE))?.currentNodeId).toBe('menu');
  });

  it('listPaused() usa el reloj simulado, no la hora real', async () => {
    const local = new FakeClock(new Date('2026-09-10T12:00:00Z'));
    const repo = new InMemorySessionRepository(local);
    await repo.save(user());
    await repo.setHumanHandoff(T, PHONE, new Date('2026-09-10T13:00:00Z'));

    expect(await repo.listPaused(T)).toHaveLength(1);
    local.advanceMinutes(61);
    expect(await repo.listPaused(T)).toHaveLength(0);
  });
});

describe('FakeClock y SequentialIdGenerator', () => {
  it('el reloj solo avanza cuando se le pide y no expone su estado interno', () => {
    const clock = new FakeClock(new Date('2026-09-10T12:00:00Z'));
    const t = clock.now();
    t.setFullYear(2000);

    expect(clock.now().toISOString()).toBe('2026-09-10T12:00:00.000Z');
    clock.advanceMinutes(90);
    expect(clock.now().toISOString()).toBe('2026-09-10T13:30:00.000Z');
  });

  it('los ids son predecibles', () => {
    const ids = new SequentialIdGenerator();

    expect([ids.uuid(), ids.uuid(), ids.orderId()]).toEqual(['sim-0001', 'sim-0002', 'SIM-0001']);
  });
});
