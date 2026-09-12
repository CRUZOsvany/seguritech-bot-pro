/**
 * C-04: validación de capturas de punta a punta con el motor real
 * (ConversationEngine vía el simulador), más lo que revisan el validador de
 * diseño y el schema de publicación.
 */
import type { BotFlow } from '@/domain/entities/flow';
import { CAPTURE_ATTEMPTS_KEY } from '@/domain/conversation/captureValidation';
import { explainTrace } from '@/domain/conversation/explain';
import { BusinessHoursService } from '@/domain/services/BusinessHoursService';
import { SimulateConversationUseCase, type SimulationStep } from '@/domain/use-cases/SimulateConversationUseCase';
import { validateFlowDesign } from '@/domain/validation/flowDesignValidator';
import {
  HARNESS_CUSTOMER_PHONE,
  HARNESS_TENANT_ID,
  makeInterpreter,
  makeTenantConfig,
  makeTenantConfigPort,
  silentLogger,
} from '../utils/conversationHarness';

function phoneFlow(content: Record<string, unknown> = {}): BotFlow {
  return {
    version: '1.0',
    start_node_id: 'pide',
    nodes: [
      {
        id: 'pide',
        type: 'wait_input',
        content: {
          prompt: '¿A qué teléfono te marcamos?',
          save_to_context: 'telefono',
          validation: { type: 'phone_mx' },
          max_attempts: 2,
          on_exhausted: 'persona',
          ...content,
        },
        transitions: [{ condition: { type: 'default' }, next_node_id: 'gracias' }],
      },
      { id: 'gracias', type: 'send_text', content: { text: 'Gracias, te marcamos al {{telefono}}.' }, transitions: [{ condition: { type: 'default' }, next_node_id: 'fin' }] },
      {
        id: 'persona',
        type: 'escape_to_human',
        content: { user_response: 'Te paso con alguien.', owner_alert_template: 'Cliente {{phone}} no pudo dar su teléfono.' },
        transitions: [{ condition: { type: 'default' }, next_node_id: 'fin' }],
      },
      { id: 'fin', type: 'end', content: {}, transitions: [] },
    ],
  } as BotFlow;
}

let n = 0;
const say = (content: string): SimulationStep => ({ kind: 'inbound', content, messageId: `wamid.${++n}` });

async function run(flow: BotFlow, messages: string[]) {
  const useCase = new SimulateConversationUseCase(
    makeTenantConfigPort(makeTenantConfig()),
    makeInterpreter(),
    new BusinessHoursService(),
    48 * 60 * 60 * 1000,
    silentLogger,
  );
  return useCase.execute({
    tenantId: HARNESS_TENANT_ID,
    flow,
    from: HARNESS_CUSTOMER_PHONE,
    startAt: new Date('2026-09-10T11:00:00-06:00'),
    steps: messages.map(say),
  });
}

const texts = (turn: Awaited<ReturnType<typeof run>>[number]) =>
  turn.outbound.filter((o) => o.audience === 'customer').map((o) => ('text' in o.content ? o.content.text : o.content.kind));

describe('capturas con validación (C-04) en el motor', () => {
  it('guarda la respuesta normalizada y la usa en el siguiente paso', async () => {
    const turns = await run(phoneFlow(), ['hola', '+52 1 (747) 123-4567']);

    expect(texts(turns[1])).toEqual(['Gracias, te marcamos al 7471234567.']);
  });

  it('una respuesta que no sirve: vuelve a pedir con el mensaje del tipo y cuenta el intento', async () => {
    const turns = await run(phoneFlow(), ['hola', 'no me acuerdo']);

    expect(texts(turns[1])).toEqual(['Ese número no parece un teléfono de 10 dígitos 🤔. Escríbelo así: *747 123 4567*']);
    expect(turns[1].session?.currentNodeId).toBe('pide');
    expect(turns[1].session?.context[CAPTURE_ATTEMPTS_KEY]).toEqual({ node: 'pide', count: 1 });
    expect(turns[1].why).toContain('En «pide» se esperaba un teléfono de 10 dígitos y llegó otra cosa (intento 1 de 2): se vuelve a pedir.');
  });

  it('al agotar los intentos sigue en on_exhausted y borra el contador', async () => {
    const turns = await run(phoneFlow(), ['hola', 'no sé', 'tampoco']);

    expect(texts(turns[2])).toEqual(['Te paso con alguien.']);
    expect(turns[2].session?.humanPausedUntil).not.toBeNull();
    expect(turns[2].session?.context[CAPTURE_ATTEMPTS_KEY] ?? null).toBeNull();
    expect(explainTrace(turns[2].trace)).toContain('En «pide» se esperaba un teléfono de 10 dígitos y llegó otra cosa por 2ª vez: se acabaron los intentos y sigue en «persona».');
  });

  it('una respuesta buena después de una mala reinicia la cuenta', async () => {
    const turns = await run(phoneFlow(), ['hola', 'no sé', '747 123 4567']);

    expect(texts(turns[2])).toEqual(['Gracias, te marcamos al 7471234567.']);
    expect(turns[2].session?.context[CAPTURE_ATTEMPTS_KEY] ?? null).toBeNull();
  });

  it('con su propio mensaje de error y sin tope: pide siempre, sin contar', async () => {
    const turns = await run(phoneFlow({ validation_error: 'Solo los 10 dígitos, por favor.', max_attempts: undefined, on_exhausted: undefined }), [
      'hola', 'x', 'y', 'z',
    ]);

    expect(texts(turns[3])).toEqual(['Solo los 10 dígitos, por favor.']);
    expect(turns[3].session?.context[CAPTURE_ATTEMPTS_KEY]).toBeUndefined();
  });
});

describe('capturas con validación (C-04) en el validador y el schema', () => {
  it('el flow de ejemplo pasa limpio: al paso de persona se llega al agotar los intentos', () => {
    expect(validateFlowDesign(phoneFlow())).toMatchObject({ ok: true, summary: { errors: 0, warnings: 0 }, schema: { ok: true } });
  });

  it('V-EST-02: on_exhausted a un paso que no existe (y el schema no publica)', () => {
    const report = validateFlowDesign(phoneFlow({ on_exhausted: 'nadie' }));

    expect(report.issues).toContainEqual(expect.objectContaining({ code: 'V-EST-02', nodeId: 'pide' }));
    expect(report.schema.ok).toBe(false);
  });

  it.each([
    ['max_attempts sin on_exhausted', { on_exhausted: undefined }, 'van juntos'],
    ['on_exhausted sin max_attempts', { max_attempts: undefined }, 'van juntos'],
    ['tope de intentos sin validación', { validation: undefined }, 'nunca se agota'],
    ['rango al revés', { validation: { type: 'number', min: 10, max: 1 } }, 'mayor que el máximo'],
    ['tipo que no existe', { validation: { type: 'imagen' } }, 'content.validation'],
  ])('el schema no publica %s', (_name, content, message) => {
    const report = validateFlowDesign(phoneFlow(content));

    expect(report.schema.ok).toBe(false);
    expect(JSON.stringify(report.schema.issues)).toContain(message);
  });
});
