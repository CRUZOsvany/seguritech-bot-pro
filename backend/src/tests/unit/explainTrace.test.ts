/**
 * El "Por qué" en español claro. Se prueba sobre conversaciones reales del
 * simulador, no sobre trazas escritas a mano: así las frases describen lo
 * que el motor hace de verdad.
 */
import { explainTrace } from '@/domain/conversation/explain';
import { BusinessHoursService } from '@/domain/services/BusinessHoursService';
import { SimulateConversationUseCase } from '@/domain/use-cases/SimulateConversationUseCase';
import type { SimulationStep } from '@/domain/use-cases/SimulateConversationUseCase';
import {
  HARNESS_CUSTOMER_PHONE,
  HARNESS_TENANT_ID,
  loadMold,
  makeInterpreter,
  makeTenantConfig,
  makeTenantConfigPort,
  silentLogger,
  type Mold,
} from '../utils/conversationHarness';

let n = 0;
const say = (content: string): SimulationStep => ({ kind: 'inbound', content, messageId: `wamid.${++n}` });

async function why(mold: Mold, steps: SimulationStep[], config = makeTenantConfig()) {
  const useCase = new SimulateConversationUseCase(
    makeTenantConfigPort(config),
    makeInterpreter(),
    new BusinessHoursService(),
    48 * 60 * 60 * 1000,
    silentLogger,
  );
  const turns = await useCase.execute({
    tenantId: HARNESS_TENANT_ID,
    flow: loadMold(mold),
    from: HARNESS_CUSTOMER_PHONE,
    startAt: new Date('2026-09-10T11:00:00-06:00'),
    steps,
  });
  return turns.map((t) => t.why);
}

describe('explainTrace', () => {
  it('primer mensaje: qué llegó, dónde empieza, qué recorre y dónde espera', async () => {
    const [first] = await why('securitech', [say('hola')]);

    expect(first).toEqual([
      'Llegó: "hola".',
      'Conversación nueva: empieza en «saludo».',
      'Recorre «saludo» → «menu_principal».',
      'Espera la respuesta del cliente en «menu_principal».',
    ]);
  });

  it('explica qué opción coincidió y por qué ganó sobre otra', async () => {
    const [, tap] = await why('cerrajeria', [say('hola'), say('🚨 Emergencia')]);

    expect(tap[1]).toMatch(
      /^En «bienvenida» coincide el botón "emergencia": sigue a «menu_emergencia»\. También coincidía la palabra clave \(emergencia, emergencias, .+\); gana la más específica\.$/,
    );
  });

  it('respuesta que no coincide con nada: lo dice y dice a dónde va por defecto', async () => {
    const [, lost] = await why('securitech', [say('hola'), say('no sé')]);

    expect(lost).toContain(
      'En «menu_principal» la respuesta no coincide con ninguna opción específica: sigue por la salida por defecto a «no_entendi».',
    );
  });

  it('validación, variable guardada, paso a humano y silencio', async () => {
    const turns = await why('papeleria', [
      say('hola'),
      say('🔍 Buscar producto'),
      say('cuaderno profesional'),
      say('🛒 Agregar a pedido'),
      say('muchos'),
      say('3'),
      say('✅ Sí, correcto'),
      say('¿ya?'),
    ]);

    expect(turns[2]).toContain('Se buscó "cuaderno profesional" en el catálogo y se encontró un producto.');
    expect(turns[4]).toContain('En «pedido_cantidad» se esperaba un número y llegó otra cosa: se vuelve a pedir.');
    expect(turns[5]).toContain('Se guarda {{cantidad_producto}} = "3".');
    expect(turns[6].join(' ')).toMatch(/Pasa a una persona: el bot se calla hasta .+ y se avisa al dueño\./);
    expect(turns[7]).toEqual([
      'Llegó: "¿ya?".',
      expect.stringMatching(/^La conversación la está atendiendo una persona hasta .+: el bot no contesta\.$/),
    ]);
  });

  it('palabra de escape y reinicio', async () => {
    const [, , escape] = await why('cerrajeria', [say('hola'), say('🚨 Emergencia'), say('cancelar')]);

    expect(escape).toContain('"cancelar" es la palabra para empezar de nuevo: se borra lo capturado.');
    expect(escape).toContain('Empieza de nuevo en «bienvenida».');
  });

  it('palabras para volver al menú y para hablar con una persona', async () => {
    const [, , menu, human] = await why('cerrajeria', [say('hola'), say('🚨 Emergencia'), say('menu'), say('Asesor')]);

    expect(menu).toContain('"menu" es la palabra para volver al menú: pasa a «bienvenida» y conserva lo capturado.');
    expect(human).toContain('"asesor" es la palabra para hablar con una persona: pasa a «hablar_persona».');
  });

  it('reloj adelantado, fuera de horario y baja', async () => {
    const config = makeTenantConfig({ horarioSemana: '09:00-19:00', horarioSabado: null });
    // Papelería no atiende cerrado (sin `hours`); cerrajería sí, ver businessHoursFlow.test.
    const turns = await why(
      'papeleria',
      [say('hola'), { kind: 'advance_time', minutes: 600 }, say('¿siguen?'), say('baja')],
      config,
    );

    expect(turns[1][0]).toMatch(/^Reloj adelantado 10 h: ahora es .+\.$/);
    expect(turns[2]).toContain(
      'Está fuera del horario del negocio: se manda el mensaje de "cerrado" y la conversación se queda donde iba.',
    );
    expect(turns[3]).toContain(
      '"baja" es palabra de baja: se registra y se confirma una sola vez. El bot no le vuelve a escribir.',
    );
  });

  it('mensaje no soportado', () => {
    expect(
      explainTrace([{ kind: 'input_ignored', reason: 'unsupported_type', detail: 'mensaje de tipo audio' }]),
    ).toEqual(['Llegó un mensaje de tipo audio: el bot no sabe procesarlo y no contesta.']);
  });

  it('las fechas salen en la hora de México', () => {
    const [line] = explainTrace([
      { kind: 'clock_advanced', minutes: 90, now: '2026-09-10T18:30:00.000Z' },
    ]);

    expect(line).toContain('12:30');
    expect(line).toContain('1 h 30 min');
  });
});
