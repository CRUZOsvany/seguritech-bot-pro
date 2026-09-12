/**
 * SimulateConversation (Fase 1 del Studio): el motor real con adaptadores
 * falsos. Lo que se fija aquí es lo que la especificación exige del simulador
 * además de la paridad (que prueba simulationParity.test.ts): sin efectos
 * externos, determinista, un resultado por evento y la traza del porqué.
 */
import { BusinessHoursService } from '@/domain/services/BusinessHoursService';
import { SimulateConversationUseCase } from '@/domain/use-cases/SimulateConversationUseCase';
import type { SimulationStep } from '@/domain/use-cases/SimulateConversationUseCase';
import type { TenantConfigPort } from '@/domain/ports';
import {
  HARNESS_CUSTOMER_PHONE,
  HARNESS_TENANT_ID,
  loadMold,
  makeInterpreter,
  makeTenantConfig,
  silentLogger,
} from '../utils/conversationHarness';

const START = new Date('2026-09-10T11:00:00-06:00');
const inbound = (content: string, n: number): SimulationStep => ({
  kind: 'inbound',
  content,
  messageId: `wamid.sim.${n}`,
});

function makeUseCase(configPort?: TenantConfigPort) {
  const port: TenantConfigPort = configPort ?? {
    getConfig: jest.fn().mockResolvedValue(makeTenantConfig()),
    invalidate: jest.fn(),
  };
  return {
    port,
    useCase: new SimulateConversationUseCase(
      port,
      makeInterpreter(),
      new BusinessHoursService(),
      48 * 60 * 60 * 1000,
      silentLogger,
    ),
  };
}

function run(steps: SimulationStep[], useCase = makeUseCase().useCase) {
  return useCase.execute({
    tenantId: HARNESS_TENANT_ID,
    flow: loadMold('cerrajeria'),
    from: HARNESS_CUSTOMER_PHONE,
    startAt: START,
    steps,
  });
}

describe('SimulateConversationUseCase', () => {
  it('devuelve un turno por evento', async () => {
    const turns = await run([
      inbound('hola', 1),
      { kind: 'advance_time', minutes: 30 },
      { kind: 'inbound', content: null, messageId: 'wamid.sim.3', ignoredReason: 'mensaje de tipo audio' },
    ]);

    expect(turns).toHaveLength(3);
    expect(turns[1]).toMatchObject({
      outbound: [],
      trace: [{ kind: 'clock_advanced', minutes: 30, now: '2026-09-10T17:30:00.000Z' }],
    });
    expect(turns[2]).toMatchObject({
      outbound: [],
      trace: [{ kind: 'input_ignored', reason: 'unsupported_type', detail: 'mensaje de tipo audio' }],
    });
  });

  it('es determinista: la misma conversación produce exactamente lo mismo', async () => {
    const steps = [inbound('hola', 1), inbound('🚨 Emergencia', 2), inbound('Apertura de puerta', 3)];

    expect(await run(steps)).toEqual(await run(steps));
  });

  it('sin efectos externos: de fuera solo lee la configuración del tenant, y no llama a Meta', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    const { port, useCase } = makeUseCase();

    await run([inbound('hola', 1), inbound('🚨 Emergencia', 2)], useCase);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(port.invalidate).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('cada corrida empieza de cero: no hereda la sesión de la anterior', async () => {
    const { useCase } = makeUseCase();
    await run([inbound('hola', 1), inbound('🚨 Emergencia', 2)], useCase);

    const [first] = await run([inbound('hola', 1)], useCase);

    expect(first.trace).toContainEqual({ kind: 'session_start', startNodeId: 'bienvenida', reason: 'new' });
  });

  it('la traza explica el turno: ventana, inicio, nodo y espera', async () => {
    const [turn] = await run([inbound('hola', 1)]);

    expect(turn.trace.map((s) => s.kind)).toEqual([
      'input',
      'window',
      'typing',
      'session_start',
      'node_entered',
      'wait',
    ]);
    expect(turn.trace[1]).toEqual({ kind: 'window', open: true, expiresAt: '2026-09-11T17:00:00.000Z' });
    expect(turn.session).toMatchObject({ currentNodeId: 'bienvenida', optedOut: false });
    expect(turn.billing).toEqual({ serviceMessages: 1, templates: 0 });
  });

  it('la traza muestra todas las transiciones, cuáles coincidieron y cuál ganó', async () => {
    const [, turn] = await run([inbound('hola', 1), inbound('🚨 Emergencia', 2)]);
    const step = turn.trace.find((s) => s.kind === 'transitions');

    expect(step).toMatchObject({ kind: 'transitions', nodeId: 'bienvenida' });
    if (step?.kind !== 'transitions') throw new Error('sin paso de transiciones');
    const winner = step.candidates[step.winner!];
    // El título del botón coincide con `button` (100) y con la keyword
    // "emergencia" (50): gana el botón por especificidad.
    expect(winner).toMatchObject({ condition: 'button', target: 'menu_emergencia', matched: true, score: 100 });
    expect(step.candidates.filter((c) => c.matched).map((c) => c.condition)).toEqual(
      expect.arrayContaining(['button', 'keyword', 'default']),
    );
  });

  it('paso a humano: alerta al dueño en el turno, traza de escalamiento y silencio después', async () => {
    const turns = await run([
      inbound('hola', 1),
      inbound('🚨 Emergencia', 2),
      inbound('Apertura de puerta', 3),
      inbound('Calle Morelos 12', 4),
      inbound('✅ Sí, correcto', 5),
      inbound('¿ya vienen?', 6),
    ]);

    const escalated = turns[4];
    expect(escalated.outbound.map((m) => m.audience)).toEqual(['customer', 'owner']);
    expect(escalated.trace).toContainEqual({
      kind: 'escalation',
      pausedUntil: '2026-09-12T17:00:00.000Z',
      ownerNotified: true,
    });
    expect(turns[5].outbound).toEqual([]);
    expect(turns[5].trace).toContainEqual(
      expect.objectContaining({ kind: 'gate', gate: 'human_paused' }),
    );
  });

  it('adelantar el reloj a media captura expira la sesión y reinicia con aviso', async () => {
    const turns = await run([
      inbound('hola', 1),
      inbound('🚨 Emergencia', 2),
      { kind: 'advance_time', minutes: 180 },
      inbound('perdón, sigo aquí', 4),
    ]);

    const resumed = turns[3];
    expect(resumed.trace).toContainEqual({ kind: 'gate', gate: 'session_expired' });
    expect(resumed.trace).toContainEqual({ kind: 'session_start', startNodeId: 'bienvenida', reason: 'new' });
  });

  it('sin configuración del tenant el turno no envía nada y la traza lo dice', async () => {
    const { useCase } = makeUseCase({ getConfig: async () => null, invalidate: () => undefined });

    const [turn] = await run([inbound('hola', 1)], useCase);

    expect(turn.outbound).toEqual([]);
    expect(turn.trace).toEqual([{ kind: 'gate', gate: 'no_config' }]);
    expect(turn.session).toBeNull();
  });
});
