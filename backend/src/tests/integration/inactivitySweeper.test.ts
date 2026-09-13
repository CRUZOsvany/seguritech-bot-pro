/**
 * Barrido de inactividad (Fase 5) con los adaptadores en memoria: recordatorio
 * una sola vez, cierre, carreras con un mensaje del cliente y fallas que no
 * frenan a los demás.
 */
import pino from 'pino';
import type { BotFlow } from '@/domain/entities/flow';
import { UserState, type User } from '@/domain/entities';
import { BusinessHoursService } from '@/domain/services/BusinessHoursService';
import { InactivitySweeper } from '@/domain/conversation/InactivitySweeper';
import { CapturingMessenger, FakeClock, InMemorySessionRepository } from '@/domain/conversation/simulation/fakes';
import { HARNESS_TENANT_ID as TENANT, makeTenantConfig, makeTenantConfigPort } from '../utils/conversationHarness';

/** Jueves 10 de septiembre de 2026, 11:00 en Chilpancingo. */
const START = new Date('2026-09-10T11:00:00-06:00');
const REMINDER = '¿Sigues ahí? Contesta para continuar.';
const CLOSE = 'Cerramos la conversación por ahora.';
const A = '5217470000001';
const B = '5217470000002';

/** `null`: flow sin inactividad (un `undefined` tomaría el valor por defecto). */
function flow(inactivity: BotFlow['inactivity'] | null = { reminder: { after_minutes: 15, text: REMINDER }, close: { after_minutes: 60, text: CLOSE } }): BotFlow {
  return {
    version: '1.0',
    start_node_id: 'menu',
    nodes: [
      {
        id: 'menu',
        type: 'send_buttons',
        content: { text: '¿Qué necesitas?', buttons: [{ id: 'cita', title: 'Agendar' }] },
        transitions: [{ condition: { type: 'default' }, next_node_id: 'menu' }],
      },
    ],
    ...(inactivity ? { inactivity } : {}),
  };
}

function setup(opts: { flow?: BotFlow; hours?: { horarioSemana: string; horarioSabado: string } } = {}) {
  const clock = new FakeClock(START);
  const sessions = new InMemorySessionRepository(clock);
  const messenger = new CapturingMessenger();
  const logger = pino({ level: 'silent' });
  const sweeper = new InactivitySweeper({
    sessions,
    messenger,
    tenantConfig: makeTenantConfigPort(makeTenantConfig(opts.hours ?? {})),
    flows: { findActive: async () => opts.flow ?? flow() },
    businessHours: new BusinessHoursService(),
    clock,
    logger,
  });
  const sent = () => messenger.sent.map((s) => [s.message.to, 'text' in s.message.content ? s.message.content.text : s.message.content.kind]);
  return { clock, sessions, messenger, sweeper, sent };
}

/** Un cliente que escribió en `at` y quedó esperando en `node`. */
async function waitingCustomer(sessions: InMemorySessionRepository, phone: string, at: Date, node = 'menu', extra: Partial<User> = {}) {
  const user: User = {
    id: `u-${phone}`,
    tenantId: TENANT,
    phoneNumber: phone,
    currentState: UserState.INITIAL,
    currentNodeId: node,
    context: { detalle: 'cambio de chapa' },
    createdAt: at,
    updatedAt: at,
  };
  await sessions.save(user);
  await sessions.touchLastInbound(TENANT, phone, at);
  if (extra.optedOutAt) await sessions.setOptOut(TENANT, phone, extra.optedOutAt);
  if (extra.humanPausedUntil) await sessions.setHumanHandoff(TENANT, phone, extra.humanPausedUntil);
}

describe('InactivitySweeper', () => {
  it('a los 15 min manda el recordatorio, y en las pasadas siguientes no lo repite', async () => {
    const { clock, sessions, sweeper, sent } = setup();
    await waitingCustomer(sessions, A, START);

    clock.advanceMinutes(15);
    const outcomes = await sweeper.sweepTenant(TENANT);
    clock.advanceMinutes(1);
    const again = await sweeper.sweepTenant(TENANT);

    expect(outcomes.map((o) => o.action)).toEqual(['reminder']);
    expect(outcomes[0].trace).toEqual([{ kind: 'inactivity', action: 'reminder', afterMinutes: 15, nodeId: 'menu', sent: true }]);
    expect(again).toEqual([]);
    expect(sent()).toEqual([[A, REMINDER]]);
  });

  it('a los 60 min cierra: manda el mensaje de cierre y borra el paso y lo capturado', async () => {
    const { clock, sessions, sweeper, sent } = setup();
    await waitingCustomer(sessions, A, START);

    clock.advanceMinutes(15);
    await sweeper.sweepTenant(TENANT);
    clock.advanceMinutes(45);
    const outcomes = await sweeper.sweepTenant(TENANT);

    expect(outcomes.map((o) => o.action)).toEqual(['close']);
    expect(outcomes[0].trace).toContainEqual({ kind: 'context_update', key: 'detalle', value: null });
    expect(sent()).toEqual([[A, REMINDER], [A, CLOSE]]);
    const session = sessions.snapshot(TENANT, A)!;
    expect(session.currentNodeId).toBeUndefined();
    expect(session.context).toEqual({});
  });

  it('si se pasó la hora del recordatorio sin barrer, al llegar al cierre solo cierra', async () => {
    const { clock, sessions, sweeper, sent } = setup();
    await waitingCustomer(sessions, A, START);

    clock.advanceMinutes(60);
    await sweeper.sweepTenant(TENANT);

    expect(sent()).toEqual([[A, CLOSE]]);
  });

  it('un cierre sin texto cierra la conversación sin mandar nada', async () => {
    const { clock, sessions, sweeper, sent } = setup({ flow: flow({ close: { after_minutes: 30 } }) });
    await waitingCustomer(sessions, A, START);

    clock.advanceMinutes(30);
    const outcomes = await sweeper.sweepTenant(TENANT);

    expect(outcomes[0]).toMatchObject({ action: 'close', outbound: [] });
    expect(outcomes[0].trace[0]).toMatchObject({ kind: 'inactivity', action: 'close', sent: false });
    expect(sent()).toEqual([]);
    expect(sessions.snapshot(TENANT, A)!.currentNodeId).toBeUndefined();
  });

  it('un mensaje del cliente abre otro silencio: puede haber otro recordatorio', async () => {
    const { clock, sessions, sweeper, sent } = setup();
    await waitingCustomer(sessions, A, START);

    clock.advanceMinutes(15);
    await sweeper.sweepTenant(TENANT);
    clock.advanceMinutes(5);
    await sessions.touchLastInbound(TENANT, A, clock.now());
    clock.advanceMinutes(15);
    await sweeper.sweepTenant(TENANT);

    expect(sent()).toEqual([[A, REMINDER], [A, REMINDER]]);
  });

  it('si el cliente escribe entre la lectura y el reclamo, no sale nada', async () => {
    const { clock, sessions, sweeper, sent } = setup();
    await waitingCustomer(sessions, A, START);
    const list = sessions.listAwaitingReply.bind(sessions);
    jest.spyOn(sessions, 'listAwaitingReply').mockImplementation(async (...args) => {
      const candidates = await list(...args);
      await sessions.touchLastInbound(TENANT, A, clock.now());
      return candidates;
    });

    clock.advanceMinutes(60);
    const outcomes = await sweeper.sweepTenant(TENANT);

    expect(outcomes).toEqual([]);
    expect(sent()).toEqual([]);
    expect(sessions.snapshot(TENANT, A)!.currentNodeId).toBe('menu');
  });

  it.each([
    ['con la baja activa', { optedOutAt: START }],
    ['con una persona atendiendo', { humanPausedUntil: new Date(START.getTime() + 48 * 3_600_000) }],
  ])('%s no se le escribe', async (_caso, extra) => {
    const { clock, sessions, sweeper, sent } = setup();
    await waitingCustomer(sessions, A, START, 'menu', extra);

    clock.advanceMinutes(60);
    await sweeper.sweepTenant(TENANT);

    expect(sent()).toEqual([]);
  });

  it('una conversación que ya terminó no recibe nada', async () => {
    const { clock, sessions, sweeper, sent } = setup();
    await waitingCustomer(sessions, A, START, 'end');

    clock.advanceMinutes(60);
    await sweeper.sweepTenant(TENANT);

    expect(sent()).toEqual([]);
  });

  it('si el negocio cerró en medio, no se le escribe: la sesión ya venció', async () => {
    const { clock, sessions, sweeper, sent } = setup({ hours: { horarioSemana: '09:00-11:10', horarioSabado: '09:00-14:00' } });
    await waitingCustomer(sessions, A, START);

    clock.advanceMinutes(15);
    await sweeper.sweepTenant(TENANT);

    expect(sent()).toEqual([]);
  });

  it('un flow sin inactividad no toca a nadie', async () => {
    const { clock, sessions, sweeper, sent } = setup({ flow: flow(null) });
    await waitingCustomer(sessions, A, START);

    clock.advanceMinutes(90);
    expect(await sweeper.sweepTenant(TENANT)).toEqual([]);
    expect(sent()).toEqual([]);
  });

  it('si no se puede reclamar (p. ej. falta la migración 024), no se manda y sigue con los demás', async () => {
    const { clock, sessions, sweeper, sent } = setup();
    await waitingCustomer(sessions, A, START);
    await waitingCustomer(sessions, B, START);
    const mark = sessions.markInactivityReminder.bind(sessions);
    jest.spyOn(sessions, 'markInactivityReminder').mockImplementation(async (tenantId, phone, last, at) => {
      if (phone === A) throw new Error('column "inactivity_reminded_at" does not exist');
      return mark(tenantId, phone, last, at);
    });

    clock.advanceMinutes(15);
    const outcomes = await sweeper.sweepTenant(TENANT);

    expect(outcomes.map((o) => o.to)).toEqual([B]);
    expect(sent()).toEqual([[B, REMINDER]]);
  });

  it('si el envío falla, ese recordatorio ya cuenta (nunca sale dos veces) y sigue con los demás', async () => {
    const { clock, sessions, messenger, sweeper, sent } = setup();
    await waitingCustomer(sessions, A, START);
    await waitingCustomer(sessions, B, START);
    const send = messenger.send.bind(messenger);
    jest.spyOn(messenger, 'send').mockImplementation(async (tenantId, message) => {
      if (message.to === A) throw new Error('Meta 500');
      return send(tenantId, message);
    });

    clock.advanceMinutes(15);
    await sweeper.sweepTenant(TENANT);
    clock.advanceMinutes(1);
    await sweeper.sweepTenant(TENANT);

    expect(sent()).toEqual([[B, REMINDER]]);
    expect(sessions.snapshot(TENANT, A)!.inactivityRemindedAt).toEqual(new Date(START.getTime() + 15 * 60_000));
  });
});
