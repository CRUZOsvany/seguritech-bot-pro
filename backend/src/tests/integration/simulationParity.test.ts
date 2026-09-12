/**
 * Criterio de aceptación de la Fase 1 del Studio: con los tres moldes, el
 * simulador produce EXACTAMENTE los mismos payloads que el camino de
 * producción, en conversaciones grabadas (tests/fixtures/conversations/).
 *
 * Producción: webhook de Meta → MetaWhatsAppAdapter.parseIncomingMessage →
 *   BotController.processMessage → MetaWhatsAppAdapter.sendX → fetch.
 *   Se intercepta `fetch` y se guarda cada cuerpo enviado a la Cloud API.
 *
 * Simulador: POST /api/admin/tenants/:id/studio/flows/:flowId/simulate con
 *   los mismos eventos → payloads de la respuesta.
 *
 * Lo común a los dos lados es a propósito lo que no se está probando: el
 * intérprete, la configuración del tenant, un reloj que arranca a la misma
 * hora y sesiones en memoria (producción usa bot_users; aquí no hay BD). Lo
 * que difiere es todo lo demás, que es justo lo que podría divergir: la
 * traducción de eventos a webhooks, el parser, BotController, el paso por
 * NotificationPort y los argumentos de cada sendX.
 *
 * El webhook del lado de producción se arma aquí mismo, sin reutilizar el
 * del simulador, para que un error en ése no se esconda en los dos lados.
 */
import express from 'express';
import request from 'supertest';
import { BotController } from '@/app/controllers/BotController';
import type { BotFlowRepository } from '@/domain/ports/BotFlowRepository';
import type { MetaCredentialsRepository } from '@/domain/ports';
import { BusinessHoursService } from '@/domain/services/BusinessHoursService';
import {
  FakeClock,
  InMemorySessionRepository,
  SequentialIdGenerator,
  noopAudit,
} from '@/domain/conversation/simulation/fakes';
import { SimulateConversationUseCase } from '@/domain/use-cases/SimulateConversationUseCase';
import { MetaWhatsAppAdapter } from '@/infrastructure/adapters/MetaWhatsAppAdapter';
import { createStudioRouter } from '@/infrastructure/server/admin/studioRouter';
import type { SimEvent } from '@/infrastructure/server/admin/studioSimulation';
import {
  HARNESS_CUSTOMER_PHONE,
  HARNESS_OWNER_PHONE,
  HARNESS_TENANT_ID,
  MOLDS,
  loadConversation,
  loadMold,
  makeInterpreter,
  makeTenantConfig,
  makeTenantConfigPort,
  silentLogger,
  type Mold,
} from '../utils/conversationHarness';

const FLOW_ID = 'flow-parity';
const HANDOFF_PAUSE_MS = 48 * 60 * 60 * 1000;

/** Webhook de Meta escrito a mano, con la forma de la doc de la Cloud API. */
function metaWebhook(event: Exclude<SimEvent, { type: 'advance_time' }>, messageId: string) {
  const common = { from: HARNESS_CUSTOMER_PHONE, id: messageId, timestamp: '1757520000' };
  const message =
    event.type === 'text'
      ? { ...common, type: 'text', text: { body: event.text } }
      : event.type === 'button_reply'
        ? { ...common, type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: event.id, title: event.title } } }
        : event.type === 'list_reply'
          ? { ...common, type: 'interactive', interactive: { type: 'list_reply', list_reply: { id: event.id, title: event.title } } }
          : event.type === 'location'
            ? { ...common, type: 'location', location: { latitude: event.latitude, longitude: event.longitude } }
            : { ...common, type: event.mediaType, [event.mediaType]: { id: 'media-1', mime_type: 'application/octet-stream' } };
  return {
    object: 'whatsapp_business_account',
    entry: [{
      id: 'waba-1',
      changes: [{
        field: 'messages',
        value: {
          messaging_product: 'whatsapp',
          metadata: { display_phone_number: '5217470000000', phone_number_id: 'PNID' },
          contacts: [{ wa_id: HARNESS_CUSTOMER_PHONE, profile: { name: 'Cliente' } }],
          messages: [message],
        },
      }],
    }],
  };
}

async function runProduction(mold: Mold): Promise<unknown[]> {
  const conversation = loadConversation(mold);
  const flow = loadMold(mold);
  const config = makeTenantConfig(conversation.tenant);

  const sent: unknown[] = [];
  const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async (_url, init) => {
    sent.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({ messages: [{ id: 'wamid.out' }] }), { status: 200 });
  });

  try {
    const credsRepo = {
      findByTenantId: async () => ({
        tenantId: HARNESS_TENANT_ID,
        phoneNumberId: 'PNID',
        wabaId: 'WABA',
        displayPhoneNumber: '5217470000000',
        accessToken: 'token',
        isActive: true,
      }),
    } as unknown as MetaCredentialsRepository;
    const adapter = new MetaWhatsAppAdapter(silentLogger, credsRepo);
    const clock = new FakeClock(new Date(conversation.startAt));
    const controller = new BotController(
      new InMemorySessionRepository(clock),
      adapter,
      makeTenantConfigPort(config),
      { findActiveByTenant: async () => flow } as unknown as BotFlowRepository,
      makeInterpreter(),
      noopAudit,
      new BusinessHoursService(),
      silentLogger,
      { clock, ids: new SequentialIdGenerator() },
    );

    for (const [i, event] of conversation.events.entries()) {
      if (event.type === 'advance_time') {
        clock.advanceMinutes(event.minutes);
        continue;
      }
      // Mismo id de mensaje que asigna el simulador, para que las reacciones
      // (si algún molde las usara) apunten al mismo mensaje en los dos lados.
      const parsed = adapter.parseIncomingMessage(metaWebhook(event, `wamid.sim.${i + 1}`));
      if (!parsed) continue; // ExpressServer responde 200 y no procesa
      await controller.processMessage(HARNESS_TENANT_ID, parsed.from, parsed.content, parsed.messageId);
    }
  } finally {
    fetchSpy.mockRestore();
  }
  return sent;
}

async function runSimulation(mold: Mold) {
  const conversation = loadConversation(mold);
  const flow = loadMold(mold);
  const config = makeTenantConfig(conversation.tenant);

  const useCase = new SimulateConversationUseCase(
    makeTenantConfigPort(config),
    makeInterpreter(),
    new BusinessHoursService(),
    HANDOFF_PAUSE_MS,
    silentLogger,
  );
  const repo = {
    getEditableFlow: async () => ({ flow, source: 'draft' as const }),
  } as unknown as BotFlowRepository;

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.admin = { sub: 'admin-1', email: 'a@x.test', role: 'super_admin', tenantId: null } as never;
    next();
  });
  app.use(createStudioRouter({ botFlowRepository: repo, simulateConversation: useCase, testCases: { list: async () => [] } as never, audit: { log: jest.fn() } as never, logger: silentLogger }));

  const res = await request(app)
    .post(`/tenants/${HARNESS_TENANT_ID}/studio/flows/${FLOW_ID}/simulate`)
    .send({ events: conversation.events, startAt: conversation.startAt, from: HARNESS_CUSTOMER_PHONE });
  expect(res.status).toBe(200);
  return res.body as { turns: Array<{ outbound: Array<{ payload: unknown; audience: string }> ; trace: Array<{ kind: string; gate?: string }> }> };
}

describe.each(MOLDS)('paridad simulador ↔ producción · %s', (mold) => {
  it('mismos payloads de la Cloud API, en el mismo orden', async () => {
    const production = await runProduction(mold);
    const simulation = await runSimulation(mold);
    const simulated = simulation.turns.flatMap((t) => t.outbound.map((o) => o.payload));

    expect(production.length).toBeGreaterThan(3);
    expect(simulated).toEqual(production);
  });
});

describe('las conversaciones grabadas recorren lo que dicen recorrer', () => {
  // Una paridad perfecta sobre una conversación que no toca nada no probaría
  // nada: estos checks fijan que cada guion pasa por los caminos difíciles.
  it('cerrajería: pausa por humano, reinicio, escape, sesión expirada, fuera de horario (atiende igual) y baja', async () => {
    const { turns } = await runSimulation('cerrajeria');
    const kinds = turns.flatMap((t) => t.trace.map((s) => (s.kind === 'gate' ? `gate:${s.gate}` : s.kind)));

    expect(kinds).toEqual(expect.arrayContaining([
      'escalation',
      'gate:human_paused',
      'escape_word',
      'gate:session_expired',
      // Cerrajería atiende fuera de horario (Fase 5): aviso y el flow sigue.
      'gate:out_of_hours_notice',
      'gate:opt_out',
      'gate:opt_in_implicit',
    ]));
    expect(turns.flatMap((t) => t.outbound).some((o) => o.audience === 'owner')).toBe(true);
  });

  it('papelería: lista dinámica por id, catálogo, validación numérica y mensaje no soportado', async () => {
    const { turns } = await runSimulation('papeleria');
    const kinds = turns.flatMap((t) => t.trace.map((s) => s.kind));
    const text = JSON.stringify(turns.flatMap((t) => t.outbound.map((o) => o.payload)));

    expect(kinds).toEqual(expect.arrayContaining(['catalog_search', 'validation', 'input_ignored', 'escalation']));
    expect(text).toContain('Perfecto, *Engargolado*');
    expect(text).toContain('Cuaderno profesional 100 hojas');
    expect(text).toContain('SIM-0001'); // folio de {{order_id}}, determinista
  });

  it('securitech: dos mensajes en el saludo y alerta al dueño', async () => {
    const { turns } = await runSimulation('securitech');

    expect(turns[0].outbound).toHaveLength(2);
    const owner = turns.flatMap((t) => t.outbound).filter((o) => o.audience === 'owner');
    expect(owner).toHaveLength(1);
    expect(JSON.stringify(owner[0].payload)).toContain(HARNESS_OWNER_PHONE.replace(/^521/, '52'));
  });
});
