/**
 * Horario (Fase 5): qué hace el bot fuera del horario del negocio, de punta
 * a punta con el motor real (ConversationEngine vía el simulador).
 *
 * - `block` (o sin `hours`): solo el mensaje de "cerrado", como siempre.
 * - `continue`: el flow atiende; una conversación nueva empieza con el aviso
 *   y el paso a persona usa su texto de fuera de horario.
 */
import type { BotFlow } from '@/domain/entities/flow';
import { BusinessHoursService } from '@/domain/services/BusinessHoursService';
import { SimulateConversationUseCase, type SimulationStep } from '@/domain/use-cases/SimulateConversationUseCase';
import { validateFlowDesign } from '@/domain/validation/flowDesignValidator';
import {
  HARNESS_CUSTOMER_PHONE,
  HARNESS_OWNER_PHONE,
  HARNESS_TENANT_ID,
  loadMold,
  makeInterpreter,
  makeTenantConfig,
  makeTenantConfigPort,
  silentLogger,
} from '../utils/conversationHarness';

const CLOSED_NOTICE = 'Ahorita estamos cerrados, te contestamos en cuanto abramos.';
const HOURS = { horarioSemana: '09:00-18:00', horarioSabado: '09:00-14:00' };
/** Jueves 10 de septiembre de 2026. */
const NIGHT = '2026-09-10T22:00:00-06:00';
const DAY = '2026-09-10T11:00:00-06:00';

function flow(extra: Partial<BotFlow> = {}, closedText: string | null = 'Te marcamos mañana a primera hora.'): BotFlow {
  return {
    version: '1.0',
    start_node_id: 'menu',
    nodes: [
      {
        id: 'menu',
        type: 'send_buttons',
        content: { text: '¿Qué necesitas?', buttons: [{ id: 'cita', title: 'Agendar' }] },
        transitions: [
          { condition: { type: 'button', value: 'cita' }, next_node_id: 'persona' },
          { condition: { type: 'default' }, next_node_id: 'menu' },
        ],
      },
      {
        id: 'persona',
        type: 'escape_to_human',
        content: {
          user_response: 'Te marcamos en unos minutos.',
          ...(closedText ? { user_response_closed: closedText } : {}),
          owner_alert_template: 'Cita de {{phone}}',
        },
        transitions: [{ condition: { type: 'default' }, next_node_id: 'fin' }],
      },
      { id: 'fin', type: 'end', content: {}, transitions: [] },
    ],
    ...extra,
  };
}

let n = 0;
const say = (content: string): SimulationStep => ({ kind: 'inbound', content, messageId: `wamid.${++n}` });

async function run(f: BotFlow, messages: string[], startAt: string, from = HARNESS_CUSTOMER_PHONE) {
  const useCase = new SimulateConversationUseCase(
    makeTenantConfigPort(makeTenantConfig(HOURS)),
    makeInterpreter(),
    new BusinessHoursService(),
    48 * 60 * 60 * 1000,
    silentLogger,
  );
  return useCase.execute({ tenantId: HARNESS_TENANT_ID, flow: f, from, startAt: new Date(startAt), steps: messages.map(say) });
}

type Turn = Awaited<ReturnType<typeof run>>[number];
const texts = (turn: Turn, audience: 'customer' | 'owner' = 'customer') =>
  turn.outbound.filter((o) => o.audience === audience).map((o) => ('text' in o.content ? o.content.text : o.content.kind));

describe('fuera de horario en el motor', () => {
  it('sin `hours` (block): solo el mensaje de cerrado, el flow no corre', async () => {
    const turns = await run(flow(), ['hola', 'cita'], NIGHT);

    expect(texts(turns[0])).toEqual([CLOSED_NOTICE]);
    expect(texts(turns[1])).toEqual([CLOSED_NOTICE]);
    expect(turns[1].session?.currentNodeId ?? null).toBeNull();
  });

  it('continue: la conversación nueva empieza con el aviso y el flow atiende', async () => {
    const turns = await run(flow({ hours: { when_closed: 'continue' } }), ['hola'], NIGHT);

    expect(texts(turns[0])).toEqual([CLOSED_NOTICE, '¿Qué necesitas?']);
    expect(turns[0].why).toContain('Está fuera del horario del negocio, pero este flujo sigue atendiendo: primero va el mensaje de "cerrado" y la conversación empieza.');
  });

  it('continue: el paso a persona usa su texto de fuera de horario, y el dueño recibe el aviso igual', async () => {
    const turns = await run(flow({ hours: { when_closed: 'continue' } }), ['hola', 'cita'], NIGHT);

    expect(texts(turns[1])).toEqual(['Te marcamos mañana a primera hora.']);
    expect(texts(turns[1], 'owner')).toHaveLength(1);
    expect(turns[1].why).toContain('Fuera de horario, el paso a persona usa su texto de fuera de horario. El aviso al dueño se manda igual.');
  });

  it('continue, a media conversación: no repite el aviso', async () => {
    const turns = await run(flow({ hours: { when_closed: 'continue' } }), ['hola', 'otra cosa'], NIGHT);

    expect(texts(turns[1])).toEqual(['¿Qué necesitas?']);
  });

  it('continue sin texto de fuera de horario: usa el de siempre', async () => {
    const turns = await run(flow({ hours: { when_closed: 'continue' } }, null), ['hola', 'cita'], NIGHT);

    expect(texts(turns[1])).toEqual(['Te marcamos en unos minutos.']);
  });

  it('abierto: ni aviso ni texto de cerrado', async () => {
    const turns = await run(flow({ hours: { when_closed: 'continue' } }), ['hola', 'cita'], DAY);

    expect(texts(turns[0])).toEqual(['¿Qué necesitas?']);
    expect(texts(turns[1])).toEqual(['Te marcamos en unos minutos.']);
  });

  it('el dueño prueba su bot a cualquier hora: sin aviso', async () => {
    const turns = await run(flow({ hours: { when_closed: 'continue' } }), ['hola'], NIGHT, HARNESS_OWNER_PHONE);

    expect(texts(turns[0])).toEqual(['¿Qué necesitas?']);
  });

  it('el molde de cerrajería atiende emergencias de noche, como promete su mensaje de cerrado', async () => {
    const turns = await run(loadMold('cerrajeria'), ['hola', '🚨 Emergencia'], NIGHT);

    expect(texts(turns[0])[0]).toBe(CLOSED_NOTICE);
    expect(turns[1].session?.currentNodeId).toBe('menu_emergencia');
  });
});

describe('V-CUMP-05', () => {
  it('con el flow atendiendo cerrado, avisa el paso a persona sin texto de fuera de horario', () => {
    const report = validateFlowDesign(flow({ hours: { when_closed: 'continue' } }, null));

    expect(report.issues).toEqual([expect.objectContaining({ code: 'V-CUMP-05', level: 'warning', nodeId: 'persona' })]);
  });

  it('no avisa si lo trae, ni en modo block (ahí el flow no corre cerrado)', () => {
    expect(validateFlowDesign(flow({ hours: { when_closed: 'continue' } })).issues).toEqual([]);
    expect(validateFlowDesign(flow({}, null)).issues).toEqual([]);
  });

  it('el schema no publica un modo que no existe', () => {
    expect(validateFlowDesign(flow({ hours: { when_closed: 'siempre' } } as never)).schema.ok).toBe(false);
  });
});
