/**
 * B-02: desambiguación de punta a punta con el motor real (ConversationEngine
 * vía el simulador). Si un mensaje coincide con palabras clave de salidas del
 * mismo nivel a destinos distintos, el bot pregunta en vez de adivinar.
 */
import type { BotFlow, Transition } from '@/domain/entities/flow';
import { DISAMBIGUATION_KEY, questionText } from '@/domain/conversation/disambiguation';
import { BusinessHoursService } from '@/domain/services/BusinessHoursService';
import { SimulateConversationUseCase, type SimulationStep } from '@/domain/use-cases/SimulateConversationUseCase';
import {
  HARNESS_CUSTOMER_PHONE,
  HARNESS_TENANT_ID,
  makeInterpreter,
  makeTenantConfig,
  makeTenantConfigPort,
  silentLogger,
} from '../utils/conversationHarness';

function menuFlow(extra: Transition[] = []): BotFlow {
  return {
    version: '1.0',
    start_node_id: 'menu',
    nodes: [
      {
        id: 'menu',
        type: 'send_buttons',
        content: { text: '¿Qué necesitas?', buttons: [{ id: 'info', title: 'Información' }, { id: 'cita', title: 'Agendar cita' }] },
        transitions: [
          { condition: { type: 'button', value: 'info' }, next_node_id: 'info' },
          { condition: { type: 'button', value: 'cita' }, next_node_id: 'cita' },
          { condition: { type: 'keyword', values: ['precio', 'horario'] }, next_node_id: 'info' },
          { condition: { type: 'keyword', values: ['precio', 'agendar'] }, next_node_id: 'cita' },
          ...extra,
          { condition: { type: 'default' }, next_node_id: 'menu' },
        ],
      },
      { id: 'info', type: 'send_text', content: { text: 'Abrimos de 9 a 7.' }, transitions: [{ condition: { type: 'default' }, next_node_id: 'fin' }] },
      { id: 'cita', type: 'send_text', content: { text: '¿Qué día te acomoda?' }, transitions: [{ condition: { type: 'default' }, next_node_id: 'fin' }] },
      { id: 'otro', type: 'send_text', content: { text: 'Otra cosa.' }, transitions: [{ condition: { type: 'default' }, next_node_id: 'fin' }] },
      { id: 'fin', type: 'end', content: {}, transitions: [] },
    ],
  };
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

const sent = (turn: Awaited<ReturnType<typeof run>>[number]) => turn.outbound.filter((o) => o.audience === 'customer').map((o) => o.content);

describe('desambiguación (B-02)', () => {
  it('empate de palabras clave: pregunta con los títulos de los botones del paso', async () => {
    const turns = await run(menuFlow(), ['hola', '¿qué precio tienen?']);

    expect(sent(turns[1])).toEqual([
      {
        kind: 'buttons',
        text: '¿Te refieres a «Información» o a «Agendar cita»?',
        buttons: [{ id: 'desambiguar_1', title: 'Información' }, { id: 'desambiguar_2', title: 'Agendar cita' }],
      },
    ]);
    expect(turns[1].session?.currentNodeId).toBe('menu');
    expect(turns[1].why).toContain('Coinciden «Información» y «Agendar cita» con la misma prioridad: en vez de adivinar, el bot pregunta cuál.');
    expect(turns[1].why.some((l) => l.includes('no coincide con ninguna opción'))).toBe(false);
  });

  it('el cliente toca un botón de la pregunta: sigue a esa opción y la pregunta se borra', async () => {
    const turns = await run(menuFlow(), ['hola', 'precio', 'desambiguar_2']);

    expect(sent(turns[2])).toEqual([{ kind: 'text', text: '¿Qué día te acomoda?' }]);
    expect(turns[2].session?.context[DISAMBIGUATION_KEY] ?? null).toBeNull();
    expect(turns[2].why).toContain('El cliente eligió «Agendar cita»: sigue a «cita».');
  });

  it('o escribe el título de la opción', async () => {
    const turns = await run(menuFlow(), ['hola', 'precio', '¡información!']);

    expect(sent(turns[2])).toEqual([{ kind: 'text', text: 'Abrimos de 9 a 7.' }]);
  });

  it('otra respuesta descarta la pregunta y el paso se evalúa normal', async () => {
    const turns = await run(menuFlow(), ['hola', 'precio', 'agendar']);

    expect(sent(turns[2])).toEqual([{ kind: 'text', text: '¿Qué día te acomoda?' }]);
    expect(turns[2].trace).not.toContainEqual(expect.objectContaining({ kind: 'disambiguated' }));
  });

  it('dos palabras clave al mismo destino no son un empate', async () => {
    const turns = await run(menuFlow([{ condition: { type: 'keyword', values: ['horario'] }, next_node_id: 'info' }]), ['hola', 'horario']);

    expect(sent(turns[1])).toEqual([{ kind: 'text', text: 'Abrimos de 9 a 7.' }]);
  });

  it('con más destinos que botones, pregunta por los primeros tres', async () => {
    const flow = menuFlow([
      { condition: { type: 'keyword', values: ['precio'] }, next_node_id: 'otro' },
      { condition: { type: 'keyword', values: ['precio'] }, next_node_id: 'fin' },
    ]);

    const turns = await run(flow, ['hola', 'precio']);

    const question = sent(turns[1])[0] as { buttons: unknown[]; text: string };
    expect(question.buttons).toHaveLength(3);
    expect(question.text).toBe('¿Te refieres a «Información», «Agendar cita» o «Precio»?');
  });

  it('una captura no pregunta: ahí el texto es la respuesta', async () => {
    const flow: BotFlow = {
      version: '1.0',
      start_node_id: 'pide',
      nodes: [
        {
          id: 'pide',
          type: 'wait_input',
          content: { prompt: '¿Qué buscas?', save_to_context: 'busca' },
          transitions: [
            { condition: { type: 'keyword', values: ['precio'] }, next_node_id: 'uno' },
            { condition: { type: 'keyword', values: ['precio'] }, next_node_id: 'dos' },
          ],
        },
        { id: 'uno', type: 'send_text', content: { text: 'Uno.' }, transitions: [{ condition: { type: 'default' }, next_node_id: 'fin' }] },
        { id: 'dos', type: 'send_text', content: { text: 'Dos.' }, transitions: [{ condition: { type: 'default' }, next_node_id: 'fin' }] },
        { id: 'fin', type: 'end', content: {}, transitions: [] },
      ],
    };

    const turns = await run(flow, ['hola', 'precio']);

    expect(sent(turns[1])).toEqual([{ kind: 'text', text: 'Uno.' }]);
  });

  it('el texto de la pregunta con tres opciones', () => {
    expect(questionText([
      { id: 'a', title: 'A', target: 'a' },
      { id: 'b', title: 'B', target: 'b' },
      { id: 'c', title: 'C', target: 'c' },
    ])).toBe('¿Te refieres a «A», «B» o «C»?');
  });
});
