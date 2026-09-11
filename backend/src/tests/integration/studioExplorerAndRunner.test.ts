/**
 * Explorador de ramas y corredor de pruebas del Studio (Fase 4), con el
 * motor real sobre los moldes del repo.
 */
import type { BotFlow } from '@/domain/entities/flow';
import { BusinessHoursService } from '@/domain/services/BusinessHoursService';
import { SimulateConversationUseCase } from '@/domain/use-cases/SimulateConversationUseCase';
import type { FlowTestCase } from '@/domain/studio/testCases';
import { StudioFlowExplorer } from '@/infrastructure/studio/StudioFlowExplorer';
import { StudioFlowTestRunner } from '@/infrastructure/studio/StudioFlowTestRunner';
import {
  HARNESS_TENANT_ID,
  loadMold,
  makeInterpreter,
  makeTenantConfig,
  makeTenantConfigPort,
  silentLogger,
} from '../utils/conversationHarness';

const simulate = () =>
  new SimulateConversationUseCase(makeTenantConfigPort(makeTenantConfig()), makeInterpreter(), new BusinessHoursService(), 48 * 3600_000, silentLogger);

describe('StudioFlowExplorer', () => {
  it('recorre el molde de cerrajería completo: todos los pasos, sin callejones ni errores', async () => {
    const report = await new StudioFlowExplorer(simulate(), silentLogger).explore(HARNESS_TENANT_ID, loadMold('cerrajeria'), { depth: 6 });

    expect(report.coverage).toMatchObject({ percent: 100, unreached: [] });
    expect(report).toMatchObject({ deadEnds: [], errors: [], truncated: false });
    expect(report.maxMessagesPerTurn.count).toBe(1);
  });

  it('en securitech encuentra el turno de dos mensajes (saludo + menú)', async () => {
    const report = await new StudioFlowExplorer(simulate(), silentLogger).explore(HARNESS_TENANT_ID, loadMold('securitech'), { depth: 6 });

    expect(report.maxMessagesPerTurn).toEqual({ count: 2, path: ['"hola"'] });
  });

  it('reporta callejones sin salida y ciclos del motor, con el camino que lleva a ellos', async () => {
    const flow: BotFlow = {
      version: '1.0',
      start_node_id: 'menu',
      nodes: [
        {
          id: 'menu',
          type: 'send_buttons',
          content: { text: 'Elige', buttons: [{ id: 'a', title: 'Callejón' }, { id: 'b', title: 'Círculo' }] },
          transitions: [
            { condition: { type: 'button', value: 'a' }, next_node_id: 'callejon' },
            { condition: { type: 'button', value: 'b' }, next_node_id: 'uno' },
            { condition: { type: 'default' }, next_node_id: 'menu' },
          ],
        },
        { id: 'callejon', type: 'send_text', content: { text: 'Aquí se acaba' }, transitions: [] },
        { id: 'uno', type: 'send_text', content: { text: 'uno' }, transitions: [{ condition: { type: 'default' }, next_node_id: 'dos' }] },
        { id: 'dos', type: 'send_text', content: { text: 'dos' }, transitions: [{ condition: { type: 'default' }, next_node_id: 'uno' }] },
        { id: 'fin', type: 'end', content: {}, transitions: [] },
      ],
    };

    const report = await new StudioFlowExplorer(simulate(), silentLogger).explore(HARNESS_TENANT_ID, flow, { depth: 3 });

    expect(report.deadEnds).toEqual([{ nodeId: 'callejon', path: ['"hola"', '[botón] Callejón'] }]);
    // Tras cortar el ciclo el motor deja al cliente dentro de él, así que el
    // siguiente mensaje lo vuelve a encontrar desde «dos»: son dos puntos del
    // mismo ciclo y los dos se reportan.
    expect(report.errors).toContainEqual({ nodeId: 'uno', reason: 'cycle', path: ['"hola"', '[botón] Círculo'] });
    expect(report.errors.every((e) => e.reason === 'cycle')).toBe(true);
    expect(report.coverage.unreached).toEqual(['fin']);
  });

  it('respeta el tope de corridas y avisa que quedó incompleto', async () => {
    const report = await new StudioFlowExplorer(simulate(), silentLogger).explore(HARNESS_TENANT_ID, loadMold('cerrajeria'), { depth: 6, maxRuns: 3 });

    expect(report.runs).toBe(3);
    expect(report.truncated).toBe(true);
  });
});

describe('StudioFlowTestRunner', () => {
  const base = (overrides: Partial<FlowTestCase>): FlowTestCase => ({
    id: 't',
    tenantId: HARNESS_TENANT_ID,
    flowId: 'f',
    name: 'prueba',
    events: [{ type: 'text', text: 'hola' }],
    expect: { node: 'bienvenida' },
    options: {},
    createdAt: '',
    updatedAt: '',
    ...overrides,
  });

  it('cuenta las que pasan y las que fallan', async () => {
    const report = await new StudioFlowTestRunner(simulate(), silentLogger).run(HARNESS_TENANT_ID, loadMold('cerrajeria'), [
      base({ id: 'ok', name: 'saludo' }),
      base({ id: 'mal', name: 'mal', expect: { contains: ['precio del día'] } }),
    ]);

    expect(report).toMatchObject({ total: 2, passed: 1, failed: 1 });
    expect(report.results[1]).toEqual({ id: 'mal', name: 'mal', passed: false, failures: ['El bot nunca dijo "precio del día".'] });
  });

  it('una prueba con eventos inválidos falla con un motivo claro, sin tumbar las demás', async () => {
    const report = await new StudioFlowTestRunner(simulate(), silentLogger).run(HARNESS_TENANT_ID, loadMold('cerrajeria'), [
      base({ id: 'rota', events: [{ type: 'tap' }] }),
      base({ id: 'ok' }),
    ]);

    expect(report.results.map((r) => [r.id, r.passed])).toEqual([['rota', false], ['ok', true]]);
    expect(report.results[0].failures[0]).toMatch(/no son válidos/);
  });

  it('corre a una hora fija por default, así el horario no la hace pasar o fallar según cuándo se corra', async () => {
    const config = makeTenantConfigPort(makeTenantConfig({ horarioSemana: '09:00-19:00', horarioSabado: '10:00-14:00' }));
    const sim = new SimulateConversationUseCase(config, makeInterpreter(), new BusinessHoursService(), 48 * 3600_000, silentLogger);

    const report = await new StudioFlowTestRunner(sim, silentLogger).run(HARNESS_TENANT_ID, loadMold('cerrajeria'), [base({})]);

    expect(report.passed).toBe(1);
  });
});
