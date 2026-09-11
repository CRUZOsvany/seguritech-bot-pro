/**
 * Criterios de aceptación de la Fase 4 del Studio:
 *   - es imposible publicar con un error del validador o una prueba fallida;
 *   - tras publicar, el bot real responde con la versión nueva sin reiniciar;
 *   - el rollback funciona.
 *
 * Todo con el motor real: el corredor de pruebas usa SimulateConversation y
 * el "bot real" es BotController con el mismo repositorio de flows.
 */
import { BotController } from '@/app/controllers/BotController';
import type { NotificationPort } from '@/domain/ports';
import type { FlowTestCaseRepository } from '@/domain/ports/FlowTestCaseRepository';
import { BusinessHoursService } from '@/domain/services/BusinessHoursService';
import { FakeClock, InMemorySessionRepository, SequentialIdGenerator, noopAudit } from '@/domain/conversation/simulation/fakes';
import { SimulateConversationUseCase } from '@/domain/use-cases/SimulateConversationUseCase';
import { PublishFlowUseCase } from '@/domain/use-cases/PublishFlowUseCase';
import { compileWizard, type WizardSpec } from '@/domain/studio/wizard';
import { STUDIO_MOLDS } from '@/domain/studio/molds';
import type { FlowTestCase } from '@/domain/studio/testCases';
import { StudioFlowTestRunner } from '@/infrastructure/studio/StudioFlowTestRunner';
import { InMemoryBotFlowRepository } from '../utils/InMemoryBotFlowRepository';
import {
  HARNESS_TENANT_ID,
  makeInterpreter,
  makeTenantConfig,
  makeTenantConfigPort,
  silentLogger,
} from '../utils/conversationHarness';

const FLOW_ID = 'flow-publish';
const spec = (): WizardSpec => structuredClone(STUDIO_MOLDS[0].spec);

function setup(tests: FlowTestCase[] = []) {
  const repo = new InMemoryBotFlowRepository(HARNESS_TENANT_ID, FLOW_ID, compileWizard(spec()));
  const config = makeTenantConfigPort(makeTenantConfig());
  const interpreter = makeInterpreter();
  const simulate = new SimulateConversationUseCase(config, interpreter, new BusinessHoursService(), 48 * 3600_000, silentLogger);
  const testRepo = { list: jest.fn().mockResolvedValue(tests) } as unknown as FlowTestCaseRepository;
  const useCase = new PublishFlowUseCase(repo, testRepo, new StudioFlowTestRunner(simulate, silentLogger), silentLogger);

  const sent: string[] = [];
  const notifications = new Proxy({}, {
    // Guarda todo lo que llega a cada sendX (cuerpo, botones, filas…).
    get: () => async (_t: string, _to: string, ...rest: unknown[]) => { sent.push(JSON.stringify(rest)); },
  }) as NotificationPort;
  const clock = new FakeClock(new Date('2026-01-05T11:00:00-06:00'));
  const bot = new BotController(new InMemorySessionRepository(clock), notifications, config, repo, interpreter, noopAudit, new BusinessHoursService(), silentLogger, { clock, ids: new SequentialIdGenerator() });

  return { repo, useCase, bot, sent };
}

const testCase = (overrides: Partial<FlowTestCase>): FlowTestCase => ({
  id: 't1',
  tenantId: HARNESS_TENANT_ID,
  flowId: FLOW_ID,
  name: 'Emergencia llega a confirmar',
  events: [
    { type: 'text', text: 'hola' },
    { type: 'button_reply', id: 'btn_0', title: '🚨 Emergencia' },
    { type: 'list_reply', id: 'Apertura de puerta', title: 'Apertura de puerta' },
    { type: 'text', text: 'Calle Morelos 12' },
  ],
  expect: { node: 'emergencia__confirmar', vars: { tipo_emergencia: 'Apertura de puerta' }, contains: ['Para confirmar'] },
  options: {},
  createdAt: '',
  updatedAt: '',
  ...overrides,
});

describe('publicar pasa por la compuerta', () => {
  it('sin borrador no hay nada que publicar', async () => {
    const { useCase } = setup();

    expect(await useCase.publish({ tenantId: HARNESS_TENANT_ID, flowId: FLOW_ID, createdBy: null })).toEqual({
      ok: false,
      reason: 'nothing_to_publish',
    });
  });

  it('con un error del validador no se publica', async () => {
    const { repo, useCase } = setup();
    const broken = compileWizard(spec());
    (broken.nodes[0].content as { text: string }).text = '{{welcome_message}}\n\n{{menu_message}} {{variable_fantasma}}';
    delete (broken as { config_bound?: unknown }).config_bound;
    await repo.saveDraft({ flowId: FLOW_ID, tenantId: HARNESS_TENANT_ID, flow: broken });

    const outcome = await useCase.publish({ tenantId: HARNESS_TENANT_ID, flowId: FLOW_ID, createdBy: null });

    expect(outcome).toMatchObject({ ok: false, reason: 'validation' });
    expect(repo.versions).toHaveLength(0);
  });

  it('con una prueba fallida no se publica, y el reporte dice por qué', async () => {
    const { repo, useCase } = setup([testCase({ expect: { node: 'fin' } })]);
    await repo.saveDraft({ flowId: FLOW_ID, tenantId: HARNESS_TENANT_ID, flow: compileWizard(spec()) });

    const outcome = await useCase.publish({ tenantId: HARNESS_TENANT_ID, flowId: FLOW_ID, createdBy: null });

    expect(outcome).toMatchObject({
      ok: false,
      reason: 'tests',
      testReport: { total: 1, failed: 1, results: [{ passed: false, failures: ['Terminó en «emergencia__confirmar» y se esperaba «fin».'] }] },
    });
    expect(repo.versions).toHaveLength(0);
  });

  it('con todo en verde publica, y la versión guarda sus reportes', async () => {
    const { repo, useCase } = setup([testCase({})]);
    await repo.saveDraft({ flowId: FLOW_ID, tenantId: HARNESS_TENANT_ID, flow: compileWizard(spec()) });

    const outcome = await useCase.publish({ tenantId: HARNESS_TENANT_ID, flowId: FLOW_ID, createdBy: 'admin', note: 'primera' });

    expect(outcome).toMatchObject({ ok: true, versionNumber: 1, testReport: { total: 1, passed: 1, failed: 0 } });
    expect(repo.versions[0]).toMatchObject({ note: 'primera', validationReport: { ok: true }, testReport: { passed: 1 } });
    expect(repo.draft).toBeNull();
  });

  it('si el borrador cambió mientras se corrían las pruebas, no publica lo que nadie revisó', async () => {
    const { repo } = setup([testCase({})]);
    await repo.saveDraft({ flowId: FLOW_ID, tenantId: HARNESS_TENANT_ID, flow: compileWizard(spec()) });
    const list = jest.fn(async () => {
      await repo.saveDraft({ flowId: FLOW_ID, tenantId: HARNESS_TENANT_ID, flow: compileWizard(spec()) });
      return [];
    });
    const racing = new PublishFlowUseCase(repo, { list } as unknown as FlowTestCaseRepository, { run: async () => ({ total: 0, passed: 0, failed: 0, results: [] }) }, silentLogger);

    await expect(racing.publish({ tenantId: HARNESS_TENANT_ID, flowId: FLOW_ID, createdBy: null })).rejects.toThrow('El borrador cambió');
    expect(repo.versions).toHaveLength(0);
  });
});

describe('después de publicar', () => {
  it('el bot real contesta con la versión nueva desde el siguiente mensaje, sin reiniciar nada', async () => {
    const { repo, useCase, bot, sent } = setup();
    await bot.processMessage(HARNESS_TENANT_ID, '5217471234567', 'hola');
    expect(sent.join('\n')).not.toContain('Hablar con alguien');

    const next = spec();
    next.options.push({ id: 'asesor', title: 'Hablar con alguien', kind: 'human', keywords: ['asesor'], handoff: { userResponse: 'Te comunico.', ownerAlert: 'Asesor {{phone}}' } });
    await repo.saveDraft({ flowId: FLOW_ID, tenantId: HARNESS_TENANT_ID, flow: compileWizard(next) });
    await useCase.publish({ tenantId: HARNESS_TENANT_ID, flowId: FLOW_ID, createdBy: null });

    sent.length = 0;
    await bot.processMessage(HARNESS_TENANT_ID, '5217479999999', 'hola');
    expect(sent.join('\n')).toContain('Hablar con alguien');
  });

  it('el rollback vuelve a la versión anterior como versión nueva, y el bot la usa', async () => {
    const { repo, useCase, bot, sent } = setup();
    await repo.saveDraft({ flowId: FLOW_ID, tenantId: HARNESS_TENANT_ID, flow: compileWizard(spec()) });
    await useCase.publish({ tenantId: HARNESS_TENANT_ID, flowId: FLOW_ID, createdBy: null }); // v1
    const next = spec();
    next.farewell.text = 'Adiós y gracias';
    const info = next.options.find((o) => o.id === 'info')!;
    if (info.kind === 'info') info.text = 'Versión dos de la información';
    await repo.saveDraft({ flowId: FLOW_ID, tenantId: HARNESS_TENANT_ID, flow: compileWizard(next) });
    await useCase.publish({ tenantId: HARNESS_TENANT_ID, flowId: FLOW_ID, createdBy: null }); // v2

    const outcome = await useCase.rollback({ tenantId: HARNESS_TENANT_ID, flowId: FLOW_ID, versionNumber: 1, createdBy: null });

    expect(outcome).toMatchObject({ ok: true, versionNumber: 3 });
    expect(repo.versions[2]).toMatchObject({ note: 'rollback a v1', testReport: null });
    await bot.processMessage(HARNESS_TENANT_ID, '5217470000001', 'hola');
    await bot.processMessage(HARNESS_TENANT_ID, '5217470000001', 'quiero info');
    expect(sent.join('\n')).toContain('En Negocio de Prueba hacemos');
    expect(sent.join('\n')).not.toContain('Versión dos');
  });

  it('rollback a una versión que no existe', async () => {
    const { useCase } = setup();

    expect(await useCase.rollback({ tenantId: HARNESS_TENANT_ID, flowId: FLOW_ID, versionNumber: 9, createdBy: null })).toEqual({
      ok: false,
      reason: 'not_found',
    });
  });
});
