/**
 * Inactividad (Fase 5) de punta a punta: motor real en el simulador (el
 * reloj se adelanta y corre el mismo barrido que producción), validador y
 * asistente. Es la paridad de tres vías de la funcionalidad.
 */
import type { BotFlow } from '@/domain/entities/flow';
import { BusinessHoursService } from '@/domain/services/BusinessHoursService';
import { SESSION_EXPIRED_NOTICE } from '@/domain/services/SessionTtlPolicy';
import { SimulateConversationUseCase, type SimulationStep } from '@/domain/use-cases/SimulateConversationUseCase';
import { validateFlowDesign } from '@/domain/validation/flowDesignValidator';
import { validateFlow } from '@/domain/validators/flowSchema';
import { compileWizard, readWizardSpec, type WizardSpec } from '@/domain/studio/wizard';
import { STUDIO_MOLDS } from '@/domain/studio/molds';
import {
  HARNESS_CUSTOMER_PHONE,
  HARNESS_TENANT_ID,
  makeInterpreter,
  makeTenantConfig,
  makeTenantConfigPort,
  silentLogger,
} from '../utils/conversationHarness';

const DAY = '2026-09-10T11:00:00-06:00';
const REMINDER = '¿Sigues ahí? Contesta para continuar.';
const CLOSE = 'Cerramos la conversación por ahora. Escríbenos cuando quieras.';
const INACTIVITY: NonNullable<BotFlow['inactivity']> = {
  reminder: { after_minutes: 15, text: REMINDER },
  close: { after_minutes: 60, text: CLOSE },
};

function flow(inactivity: unknown = INACTIVITY): BotFlow {
  return {
    version: '1.0',
    start_node_id: 'menu',
    nodes: [
      {
        id: 'menu',
        type: 'send_buttons',
        content: { text: '¿Qué necesitas?', buttons: [{ id: 'cita', title: 'Agendar' }] },
        transitions: [
          { condition: { type: 'button', value: 'cita' }, next_node_id: 'hora' },
          { condition: { type: 'default' }, next_node_id: 'menu' },
        ],
      },
      {
        id: 'hora',
        type: 'wait_input',
        content: { prompt: '¿A qué hora te acomoda?', save_to_context: 'hora' },
        transitions: [{ condition: { type: 'default' }, next_node_id: 'fin' }],
      },
      { id: 'fin', type: 'end', content: {}, transitions: [] },
    ],
    ...(inactivity ? { inactivity } : {}),
  } as BotFlow;
}

let n = 0;
const say = (content: string): SimulationStep => ({ kind: 'inbound', content, messageId: `wamid.inac.${++n}` });
const wait = (minutes: number): SimulationStep => ({ kind: 'advance_time', minutes });

async function run(f: BotFlow, steps: SimulationStep[]) {
  const useCase = new SimulateConversationUseCase(
    makeTenantConfigPort(makeTenantConfig()),
    makeInterpreter(),
    new BusinessHoursService(),
    48 * 60 * 60 * 1000,
    silentLogger,
  );
  return useCase.execute({ tenantId: HARNESS_TENANT_ID, flow: f, from: HARNESS_CUSTOMER_PHONE, startAt: new Date(DAY), steps });
}

type Turn = Awaited<ReturnType<typeof run>>[number];
const texts = (turn: Turn) => turn.outbound.map((o) => ('text' in o.content ? o.content.text : o.content.kind));

describe('inactividad en el simulador (el mismo barrido que producción)', () => {
  it('a los 15 min sin contestar llega el recordatorio; a los 60, el cierre; el siguiente mensaje empieza de nuevo', async () => {
    const turns = await run(flow(), [say('hola'), say('Agendar'), wait(20), wait(45), say('hola')]);

    expect(texts(turns[2])).toEqual([REMINDER]);
    expect(turns[2].why.join('\n')).toContain('recordatorio');
    expect(turns[2].at).toBe(new Date(new Date(DAY).getTime() + 20 * 60_000).toISOString());

    expect(texts(turns[3])).toEqual([CLOSE]);
    expect(turns[3].session?.currentNodeId ?? null).toBeNull();
    expect(turns[3].session?.context).toEqual({});

    expect(texts(turns[4])).toEqual(['¿Qué necesitas?']);
    expect(texts(turns[4])).not.toContain(SESSION_EXPIRED_NOTICE);
    expect(turns[4].trace).not.toContainEqual({ kind: 'gate', gate: 'session_expired' });
  });

  it('si el reloj salta de una, salen los dos, en orden', async () => {
    const turns = await run(flow(), [say('hola'), wait(90)]);

    expect(texts(turns[1])).toEqual([REMINDER, CLOSE]);
    expect(turns[1].trace.filter((s) => s.kind === 'inactivity').map((s) => (s as { action: string }).action)).toEqual(['reminder', 'close']);
  });

  it('nunca dos recordatorios seguidos: pasado el primero, solo queda el cierre', async () => {
    const turns = await run(flow(), [say('hola'), wait(20), wait(20)]);

    expect(texts(turns[1])).toEqual([REMINDER]);
    expect(texts(turns[2])).toEqual([]);
  });

  it('contestar después del recordatorio abre otro silencio, con su propio recordatorio', async () => {
    const turns = await run(flow(), [say('hola'), wait(20), say('Agendar'), wait(10), wait(10)]);

    expect(texts(turns[1])).toEqual([REMINDER]);
    expect(texts(turns[3])).toEqual([]);
    expect(texts(turns[4])).toEqual([REMINDER]);
  });

  it('sin inactividad configurada, el bot espera sin escribir', async () => {
    const turns = await run(flow(null), [say('hola'), wait(90)]);

    expect(texts(turns[1])).toEqual([]);
  });

  it('una conversación que ya terminó no recibe nada', async () => {
    const turns = await run(flow(), [say('hola'), say('Agendar'), say('a las 5'), wait(90)]);

    expect(texts(turns[3])).toEqual([]);
  });

  it('el cierre a los 120 min (el tope) todavía cierra: la sesión vence después de las 2 h, no a las 2 h', async () => {
    const turns = await run(flow({ close: { after_minutes: 120, text: CLOSE } }), [say('hola'), wait(119), wait(1)]);

    expect(texts(turns[1])).toEqual([]);
    expect(texts(turns[2])).toEqual([CLOSE]);
  });
});

describe('inactividad en el validador', () => {
  const codes = (f: unknown) => validateFlowDesign(f).issues.map((i) => i.code);
  const schemaPaths = (f: unknown) => validateFlowDesign(f).schema.issues.map((i) => i.path);

  it('una inactividad bien armada pasa el schema y no da hallazgos de inactividad', () => {
    const report = validateFlowDesign(flow());

    expect(report.schema.ok).toBe(true);
    expect(codes(flow()).filter((c) => ['V-CUMP-03', 'V-CUMP-04'].includes(c))).toEqual([]);
    expect(() => validateFlow(flow())).not.toThrow();
  });

  it('V-CUMP-04: más de un recordatorio es error y no publica', () => {
    const many = flow({ reminder: [{ after_minutes: 10, text: 'a' }, { after_minutes: 20, text: 'b' }], close: { after_minutes: 60 } });

    expect(codes(many)).toContain('V-CUMP-04');
    expect(validateFlowDesign(many).schema.ok).toBe(false);
  });

  it('V-CUMP-03: un cierre que saldría con la ventana de 24 h cerrada es error', () => {
    const late = flow({ close: { after_minutes: 25 * 60, text: CLOSE } });

    expect(codes(late)).toContain('V-CUMP-03');
    expect(validateFlowDesign(late).schema.ok).toBe(false);
  });

  it('el schema no publica un recordatorio a la hora del cierre o después, ni tiempos de más de 120 min', () => {
    expect(schemaPaths(flow({ reminder: { after_minutes: 60, text: REMINDER }, close: { after_minutes: 60 } }))).toContain('inactivity.reminder.after_minutes');
    expect(schemaPaths(flow({ close: { after_minutes: 121 } }))).toContain('inactivity.close.after_minutes');
    expect(schemaPaths(flow({ close: { after_minutes: 0 } }))).toContain('inactivity.close.after_minutes');
  });

  it('V-EST-05: los textos de inactividad no pueden llevar {{variables}}', () => {
    const withVars = flow({ reminder: { after_minutes: 15, text: 'Hola {{nombre_negocio}}, ¿sigues ahí?' }, close: { after_minutes: 60 } });

    expect(codes(withVars)).toContain('V-EST-05');
  });
});

describe('inactividad en el asistente', () => {
  const cerrajeria = (): WizardSpec => structuredClone(STUDIO_MOLDS.find((m) => m.id === 'cerrajeria')!.spec);
  const withInactivity = (): WizardSpec => ({
    ...cerrajeria(),
    inactivity: { reminder: { afterMinutes: 15, text: REMINDER }, close: { afterMinutes: 60, text: CLOSE } },
  });

  it('compila al contrato del motor, pasa el schema y se lee de vuelta', () => {
    const compiled = compileWizard(withInactivity());

    expect(compiled.inactivity).toEqual(INACTIVITY);
    expect(() => validateFlow(compiled)).not.toThrow();
    expect(readWizardSpec(compiled)).toEqual({ ok: true, spec: withInactivity() });
  });

  it('sin recordatorio ni texto de cierre, solo el cierre', () => {
    const spec: WizardSpec = { ...cerrajeria(), inactivity: { close: { afterMinutes: 30 } } };

    expect(compileWizard(spec).inactivity).toEqual({ close: { after_minutes: 30 } });
  });

  it('si alguien cambió la inactividad fuera del asistente, no lo pisa', () => {
    const edited = compileWizard(withInactivity());
    edited.inactivity = { close: { after_minutes: 90 } };

    expect(readWizardSpec(edited)).toEqual({ ok: false, reason: 'edited_elsewhere' });
  });
});
