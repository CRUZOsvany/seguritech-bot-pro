/**
 * C-08: palabras de escape por flow (menú, empezar de nuevo, persona, baja),
 * de punta a punta con el motor real (ConversationEngine vía el simulador,
 * el mismo código que atiende el webhook).
 */
import type { BotFlow, Transition } from '@/domain/entities/flow';
import { matchEscape, resolveEscape } from '@/domain/conversation/escapeWords';
import { OPT_OUT_CONFIRMATION } from '@/domain/conversation/ConversationEngine';
import { BusinessHoursService } from '@/domain/services/BusinessHoursService';
import { fuzzyIncludes, normalizePhrase } from '@/domain/services/textMatch';
import { SimulateConversationUseCase, type SimulationStep } from '@/domain/use-cases/SimulateConversationUseCase';
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

const texts = (turn: Awaited<ReturnType<typeof run>>[number], audience: 'customer' | 'owner' = 'customer') =>
  turn.outbound.filter((o) => o.audience === audience).map((o) => ('text' in o.content ? o.content.text : o.content.kind));

const withoutEscape = (flow: BotFlow): BotFlow => {
  const copy = structuredClone(flow);
  delete copy.escape;
  return copy;
};

describe('palabras de escape (C-08)', () => {
  it('persona: pasa al paso de persona desde cualquier paso, avisa al dueño y pausa el bot', async () => {
    const turns = await run(loadMold('cerrajeria'), ['hola', '🚨 Emergencia', '¡Asesor!', 'hola?']);

    const escalation = turns[2];
    expect(texts(escalation)).toEqual(['💬 Claro, te conecto con alguien de Negocio de Prueba.']);
    expect(texts(escalation, 'owner')[0]).toContain('Último mensaje: "¡Asesor!"');
    expect(escalation.outbound.find((o) => o.audience === 'owner')?.to).toBe(HARNESS_OWNER_PHONE);
    expect(escalation.session?.humanPausedUntil).not.toBeNull();
    // El bot se calla mientras atiende la persona.
    expect(turns[3].outbound).toEqual([]);
  });

  it('volver al menú: muestra el menú y conserva lo capturado', async () => {
    const turns = await run(loadMold('cerrajeria'), ['hola', '🚨 Emergencia', 'Apertura de puerta', 'menú']);

    expect(turns[3].session?.currentNodeId).toBe('bienvenida');
    expect(turns[3].session?.context).toMatchObject({ tipo_emergencia: 'Apertura de puerta' });
  });

  it('empezar de nuevo: vuelve al inicio y borra lo capturado', async () => {
    const turns = await run(loadMold('cerrajeria'), ['hola', '🚨 Emergencia', 'Apertura de puerta', 'cancelar']);

    expect(turns[3].session?.currentNodeId).toBe('bienvenida');
    expect(turns[3].session?.context.tipo_emergencia ?? null).toBeNull();
  });

  it('baja con palabra propia del flow; una palabra que el flow no declara no da de baja', async () => {
    const flow = loadMold('cerrajeria');
    flow.escape!.opt_out = { words: ['ya no quiero mensajes'] };

    const turns = await run(flow, ['hola', 'Ya no quiero mensajes.', 'stop']);

    expect(texts(turns[1])).toEqual([OPT_OUT_CONFIRMATION]);
    expect(turns[1].session?.optedOut).toBe(true);
    // "stop" ya no es baja en este flow: es un mensaje normal (y reactiva al cliente).
    expect(texts(turns[2])).not.toContain(OPT_OUT_CONFIRMATION);
  });

  it('la baja nunca cede ante una salida del paso', async () => {
    const flow = loadMold('cerrajeria');
    const menu = flow.nodes.find((n) => n.id === 'bienvenida')!;
    (menu.transitions as Transition[]).unshift({ condition: { type: 'keyword', values: ['baja'] }, next_node_id: 'despedida' });

    const turns = await run(flow, ['hola', 'baja']);

    expect(texts(turns[1])).toEqual([OPT_OUT_CONFIRMATION]);
  });

  it('persona cede ante una salida propia del paso que maneja la palabra', async () => {
    // En la bienvenida de papelería "asesor" es una palabra clave del paso.
    const flow = loadMold('papeleria');
    const menu = flow.nodes.find((n) => n.id === 'bienvenida')!;
    const local = (menu.transitions as Transition[]).find((t) => t.condition.type === 'keyword' && t.condition.values.includes('asesor'))!;
    local.next_node_id = 'despedida';

    const turns = await run(flow, ['hola', 'asesor']);

    expect(turns[1].trace).toContainEqual(expect.objectContaining({ kind: 'escape_word', category: 'human', handledLocally: true }));
    expect(turns[1].session?.currentNodeId).toBe('end');
  });

  it('un flow sin palabras de escape se porta como siempre', async () => {
    const flow = withoutEscape(loadMold('cerrajeria'));

    const turns = await run(flow, ['hola', '🚨 Emergencia', 'Apertura de puerta', 'menu', 'asesor', 'stop']);

    // "menu" reinicia y borra lo capturado, como antes de C-08.
    expect(turns[3].session?.context.tipo_emergencia ?? null).toBeNull();
    // "asesor" no es palabra especial: lo resuelve el paso (no te entendí).
    expect(turns[4].trace).not.toContainEqual(expect.objectContaining({ kind: 'escape_word' }));
    expect(texts(turns[5])).toEqual([OPT_OUT_CONFIRMATION]);
  });
});

describe('resolveEscape / matchEscape', () => {
  it('compara la frase completa, sin acentos ni signos', () => {
    const escape = resolveEscape(loadMold('cerrajeria'));

    expect(matchEscape(escape, '  ¡¡Hablar con ALGUIEN!! ')).toEqual({ category: 'human', word: 'hablar con alguien' });
    expect(matchEscape(escape, 'Menú')).toEqual({ category: 'menu', word: 'menu' });
    expect(matchEscape(escape, 'quiero un asesor')).toBeNull();
    expect(matchEscape(escape, '👍')).toBeNull();
  });

  it('una palabra en dos grupos: gana baja, luego persona, luego empezar de nuevo', () => {
    const escape = resolveEscape({ start_node_id: 's', escape: { restart: { words: ['alto'] }, opt_out: { words: ['alto'] } } });

    expect(matchEscape(escape, 'alto')?.category).toBe('opt_out');
  });

  it('una baja vacía no deja al motor sin baja', () => {
    const escape = resolveEscape({ start_node_id: 's', escape: { opt_out: { words: [] } } });

    expect(matchEscape(escape, 'stop')?.category).toBe('opt_out');
  });
});

describe('normalización de texto', () => {
  it('normalizePhrase quita acentos, signos y espacios de más', () => {
    expect(normalizePhrase('  ¿Cuánto   CUESTA?!  ')).toBe('cuanto cuesta');
  });

  it('una palabra clave corta coincide solo como palabra completa', () => {
    expect(fuzzyIncludes('humano', 'no')).toBe(false);
    expect(fuzzyIncludes('casi', 'si')).toBe(false);
    expect(fuzzyIncludes('pues no, gracias', 'no')).toBe(true);
    expect(fuzzyIncludes('¡Sí!', 'si')).toBe(true);
  });
});
