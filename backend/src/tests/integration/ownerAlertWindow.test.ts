/**
 * Decisión 4 de §16 (OVY, 2026-09-12): el aviso de paso a humano llega
 * siempre al panel (la pausa pone la conversación en /escalaciones) y por
 * WhatsApp al dueño solo con su ventana de 24 h abierta. Fuera de ella Meta
 * rechaza el mensaje libre (H-6), así que no se manda: se registra.
 *
 * Motor real (ConversationEngine) con adaptadores en memoria, el simulador y
 * el endpoint del Studio.
 */
import express from 'express';
import request from 'supertest';
import pino from 'pino';
import type { BotFlow } from '@/domain/entities/flow';
import type { UserRepository } from '@/domain/ports';
import type { BotFlowRepository } from '@/domain/ports/BotFlowRepository';
import { BusinessHoursService } from '@/domain/services/BusinessHoursService';
import { ConversationEngine, type EngineTurn } from '@/domain/conversation/ConversationEngine';
import { explainTrace } from '@/domain/conversation/explain';
import {
  CapturingMessenger,
  FakeClock,
  InMemorySessionRepository,
  SequentialIdGenerator,
  noopAudit,
  seedOwnerWindow,
} from '@/domain/conversation/simulation/fakes';
import { SimulateConversationUseCase, type SimulationStep } from '@/domain/use-cases/SimulateConversationUseCase';
import { createStudioRouter } from '@/infrastructure/server/admin/studioRouter';
import {
  HARNESS_CUSTOMER_PHONE as CUSTOMER,
  HARNESS_OWNER_PHONE as OWNER,
  HARNESS_TENANT_ID as TENANT,
  makeInterpreter,
  makeTenantConfig,
  makeTenantConfigPort,
  silentLogger,
} from '../utils/conversationHarness';

/** Jueves 10 de septiembre de 2026, 11:00 en Chilpancingo. */
const START = new Date('2026-09-10T11:00:00-06:00');
const HANDOFF_PAUSE_MS = 48 * 3_600_000;
const USER_RESPONSE = 'Te comunico con alguien del equipo.';

function flow(ownerAlert = 'Cliente {{phone}} quiere hablar con alguien'): BotFlow {
  return {
    version: '1.0',
    start_node_id: 'menu',
    nodes: [
      {
        id: 'menu',
        type: 'send_buttons',
        content: { text: '¿Qué necesitas?', buttons: [{ id: 'persona', title: 'Hablar con alguien' }] },
        transitions: [
          { condition: { type: 'button', value: 'persona' }, next_node_id: 'persona' },
          { condition: { type: 'default' }, next_node_id: 'menu' },
        ],
      },
      {
        id: 'persona',
        type: 'escape_to_human',
        content: { user_response: USER_RESPONSE, owner_alert_template: ownerAlert },
        transitions: [{ condition: { type: 'default' }, next_node_id: 'fin' }],
      },
      { id: 'fin', type: 'end', content: {}, transitions: [] },
    ],
  };
}

function setup(opts: { ownerPhone?: string; flow?: BotFlow } = {}) {
  const clock = new FakeClock(START);
  const sessions = new InMemorySessionRepository(clock);
  const messenger = new CapturingMessenger();
  const logger = pino({ level: 'silent' });
  const ownerPhone = 'ownerPhone' in opts ? opts.ownerPhone : OWNER;
  const engine = new ConversationEngine({
    sessions,
    messenger,
    tenantConfig: makeTenantConfigPort(makeTenantConfig({ ownerPhone })),
    flows: { findActive: async () => opts.flow ?? flow() },
    interpreter: makeInterpreter(),
    businessHours: new BusinessHoursService(),
    audit: noopAudit,
    clock,
    ids: new SequentialIdGenerator(),
    handoffPauseMs: HANDOFF_PAUSE_MS,
    logger,
  });
  /** El cliente abre el menú y pide una persona. Devuelve el segundo turno. */
  const askForPerson = async (from = CUSTOMER): Promise<EngineTurn> => {
    await engine.handle({ tenantId: TENANT, from, content: 'hola', metaMessageId: 'wamid.1' });
    return engine.handle({ tenantId: TENANT, from, content: 'Hablar con alguien', metaMessageId: 'wamid.2' });
  };
  const sentTo = (audience: 'customer' | 'owner') =>
    messenger.sent.filter((s) => s.message.audience === audience).map((s) => s.message);
  return { clock, sessions, messenger, logger, engine, askForPerson, sentTo };
}

/** El dueño le escribió al bot en `at` (así queda en bot_users su último mensaje). */
async function ownerWrote(sessions: UserRepository, phone: string, at: Date) {
  await seedOwnerWindow(sessions, TENANT, phone, CUSTOMER, at);
}

const hoursBefore = (hours: number) => new Date(START.getTime() - hours * 3_600_000);
const escalationOf = (turn: EngineTurn) => turn.trace.find((s) => s.kind === 'escalation');

describe('aviso al dueño y su ventana de 24 h (decisión 4 de §16)', () => {
  it('con la ventana abierta (le escribió hace 2 h), el aviso sale por WhatsApp', async () => {
    const { sessions, askForPerson, sentTo } = setup();
    await ownerWrote(sessions, OWNER, hoursBefore(2));

    const turn = await askForPerson();

    expect(sentTo('owner')).toHaveLength(1);
    expect(sentTo('owner')[0].to).toBe(OWNER);
    expect(escalationOf(turn)).toEqual(expect.objectContaining({ ownerNotified: true }));
    expect(escalationOf(turn)).not.toHaveProperty('ownerSkipped');
  });

  it('si el dueño nunca le escribió al bot, no se le manda: se registra y la conversación queda en la bandeja', async () => {
    const { sessions, logger, askForPerson, sentTo } = setup();
    const warn = jest.spyOn(logger, 'warn');

    const turn = await askForPerson();

    expect(sentTo('owner')).toEqual([]);
    expect(sentTo('customer').map((m) => ('text' in m.content ? m.content.text : ''))).toContain(USER_RESPONSE);
    expect(escalationOf(turn)).toEqual(expect.objectContaining({ ownerNotified: false, ownerSkipped: 'window_closed' }));
    expect(warn).toHaveBeenCalledWith(expect.objectContaining({ reason: 'window_closed' }), expect.stringContaining('ventana de 24 h'));
    // Lo que lista la bandeja /escalaciones (GET /api/admin/handoff/paused).
    expect((await sessions.listPaused(TENANT)).map((u) => u.phoneNumber)).toEqual([CUSTOMER]);
  });

  it('con la ventana vencida (le escribió hace 25 h), tampoco', async () => {
    const { sessions, askForPerson, sentTo } = setup();
    await ownerWrote(sessions, OWNER, hoursBefore(25));

    const turn = await askForPerson();

    expect(sentTo('owner')).toEqual([]);
    expect(escalationOf(turn)).toEqual(expect.objectContaining({ ownerSkipped: 'window_closed' }));
  });

  it.each([
    ['el número del dueño capturado como 52… y Meta lo guardó como 521…', '527479990000', '5217479990000'],
    ['capturado como 521… y guardado como 52…', '5217479990000', '527479990000'],
    ['capturado con + y espacios', '+52 1 747 999 0000', '5217479990000'],
  ])('H-9, %s: se encuentra y el aviso sale', async (_caso, configured, stored) => {
    const { sessions, askForPerson, sentTo } = setup({ ownerPhone: configured });
    await ownerWrote(sessions, stored, hoursBefore(1));

    await askForPerson();

    expect(sentTo('owner')).toHaveLength(1);
  });

  it('un #listo del dueño también es un mensaje suyo al bot: le abre la ventana y el siguiente aviso sale', async () => {
    const { engine, askForPerson, sentTo } = setup();
    // Sin conversaciones pausadas: el bot solo le contesta que no hay ninguna.
    await engine.handle({ tenantId: TENANT, from: OWNER, content: '#listo', metaMessageId: 'wamid.0' });

    const turn = await askForPerson();

    const alerts = sentTo('owner').filter((m) => 'text' in m.content && m.content.text.includes('quiere hablar'));
    expect(alerts).toHaveLength(1);
    expect(escalationOf(turn)).toEqual(expect.objectContaining({ ownerNotified: true }));
  });

  it('si el cliente es el propio dueño probando su bot, su mensaje abre la ventana y el aviso sale', async () => {
    const { askForPerson, sentTo } = setup();

    await askForPerson(OWNER);

    expect(sentTo('owner')).toHaveLength(1);
  });

  it('si no se puede revisar la ventana, el aviso no se intenta y el cliente recibe su respuesta', async () => {
    const { sessions, askForPerson, sentTo } = setup();
    await ownerWrote(sessions, OWNER, hoursBefore(1));
    const find = sessions.findByPhoneNumber.bind(sessions);
    jest.spyOn(sessions, 'findByPhoneNumber').mockImplementation(async (tenantId, phone) => {
      if (phone !== CUSTOMER) throw new Error('Supabase caído');
      return find(tenantId, phone);
    });

    const turn = await askForPerson();

    expect(sentTo('owner')).toEqual([]);
    expect(sentTo('customer').length).toBeGreaterThan(0);
    expect(escalationOf(turn)).toEqual(expect.objectContaining({ ownerSkipped: 'window_unknown' }));
  });

  it('si el envío al dueño falla, queda anotado y el cliente recibe su respuesta', async () => {
    const { sessions, messenger, askForPerson, sentTo } = setup();
    await ownerWrote(sessions, OWNER, hoursBefore(1));
    const send = messenger.send.bind(messenger);
    jest.spyOn(messenger, 'send').mockImplementation(async (tenantId, message) => {
      if (message.audience === 'owner') throw new Error('Meta 131047');
      return send(tenantId, message);
    });

    const turn = await askForPerson();

    expect(sentTo('customer').map((m) => ('text' in m.content ? m.content.text : ''))).toContain(USER_RESPONSE);
    expect(escalationOf(turn)).toEqual(expect.objectContaining({ ownerNotified: false, ownerSkipped: 'send_failed' }));
  });

  it('el "Por qué" dice por qué no se avisó y que la conversación queda en la bandeja', async () => {
    const closed = await setup().askForPerson();
    const noPhone = await setup({ ownerPhone: undefined }).askForPerson();
    const noAlert = await setup({ flow: flow('') }).askForPerson();

    expect(explainTrace(closed.trace).join(' ')).toMatch(/no le ha escrito al bot en las últimas 24 h.*bandeja de escalaciones/);
    expect(escalationOf(noPhone)).toEqual(expect.objectContaining({ ownerSkipped: 'no_owner_phone' }));
    expect(explainTrace(noPhone.trace).join(' ')).toContain('no tiene número configurado');
    expect(escalationOf(noAlert)).toEqual(expect.objectContaining({ ownerSkipped: 'no_alert_text' }));
  });
});

describe('la ventana del dueño en el simulador', () => {
  const say = (content: string, n: number): SimulationStep => ({ kind: 'inbound', content, messageId: `wamid.dueno.${n}` });
  const conversation: SimulationStep[] = [say('hola', 1), say('Hablar con alguien', 2)];

  async function simulate(steps: SimulationStep[], ownerWindowOpen?: boolean) {
    const useCase = new SimulateConversationUseCase(
      makeTenantConfigPort(makeTenantConfig()),
      makeInterpreter(),
      new BusinessHoursService(),
      HANDOFF_PAUSE_MS,
      silentLogger,
    );
    const turns = await useCase.execute({ tenantId: TENANT, flow: flow(), from: CUSTOMER, startAt: START, steps, ownerWindowOpen });
    return { turns, owner: turns.flatMap((t) => t.outbound).filter((o) => o.audience === 'owner') };
  }

  it('por default supone que el dueño le escribió al bot al empezar: la vista previa muestra el aviso', async () => {
    const { owner } = await simulate(conversation);

    expect(owner).toHaveLength(1);
  });

  it('con ownerWindowOpen: false muestra que no se le avisa, y el porqué', async () => {
    const { turns, owner } = await simulate(conversation, false);

    expect(owner).toEqual([]);
    expect(turns[1].why.join(' ')).toContain('bandeja de escalaciones');
  });

  it('la ventana simulada vence a las 24 h, como la real', async () => {
    const { owner } = await simulate([{ kind: 'advance_time', minutes: 25 * 60 }, ...conversation]);

    expect(owner).toEqual([]);
  });

  it('el endpoint del Studio acepta ownerWindowOpen y lo respeta', async () => {
    const useCase = new SimulateConversationUseCase(
      makeTenantConfigPort(makeTenantConfig()),
      makeInterpreter(),
      new BusinessHoursService(),
      HANDOFF_PAUSE_MS,
      silentLogger,
    );
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.admin = { sub: 'admin-1', email: 'a@x.test', role: 'super_admin', tenantId: null } as never;
      next();
    });
    app.use(
      createStudioRouter({
        botFlowRepository: { getEditableFlow: async () => ({ flow: flow(), source: 'draft' as const }) } as unknown as BotFlowRepository,
        simulateConversation: useCase,
        testCases: { list: async () => [] } as never,
        audit: { log: jest.fn() } as never,
        logger: silentLogger,
      }),
    );
    const events = [{ type: 'text', text: 'hola' }, { type: 'button_reply', id: 'btn_0', title: 'Hablar con alguien' }];
    const post = (ownerWindowOpen?: boolean) =>
      request(app).post(`/tenants/${TENANT}/studio/flows/f1/simulate`).send({ events, startAt: START.toISOString(), from: CUSTOMER, ownerWindowOpen });
    const ownerMessages = (body: { turns: Array<{ outbound: Array<{ audience: string }> }> }) =>
      body.turns.flatMap((t) => t.outbound).filter((o) => o.audience === 'owner');

    const open = await post();
    const closed = await post(false);

    expect(open.status).toBe(200);
    expect(ownerMessages(open.body)).toHaveLength(1);
    expect(closed.status).toBe(200);
    expect(ownerMessages(closed.body)).toEqual([]);
  });
});
