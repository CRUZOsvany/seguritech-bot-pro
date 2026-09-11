/**
 * Rutas de la Fase 4 del Studio, de punta a punta con el motor real:
 * publicar con compuerta (y la forma de los errores que muestra el panel),
 * rollback, casos de prueba, explorador y diff.
 */
import express from 'express';
import request from 'supertest';
import { BusinessHoursService } from '@/domain/services/BusinessHoursService';
import { SimulateConversationUseCase } from '@/domain/use-cases/SimulateConversationUseCase';
import { PublishFlowUseCase } from '@/domain/use-cases/PublishFlowUseCase';
import type { FlowTestCaseRepository } from '@/domain/ports/FlowTestCaseRepository';
import type { FlowTestCase } from '@/domain/studio/testCases';
import { compileWizard } from '@/domain/studio/wizard';
import { STUDIO_MOLDS } from '@/domain/studio/molds';
import { createFlowsRouter } from '@/infrastructure/server/admin/flowsRouter';
import { createStudioRouter } from '@/infrastructure/server/admin/studioRouter';
import { StudioFlowTestRunner } from '@/infrastructure/studio/StudioFlowTestRunner';
import { InMemoryBotFlowRepository } from '../utils/InMemoryBotFlowRepository';
import { HARNESS_TENANT_ID, makeInterpreter, makeTenantConfig, makeTenantConfigPort, silentLogger } from '../utils/conversationHarness';

const FLOW = 'flow-v';
const T = HARNESS_TENANT_ID;
const spec = () => structuredClone(STUDIO_MOLDS[0].spec);

class MemoryTests implements FlowTestCaseRepository {
  rows: FlowTestCase[] = [];
  async list(tenantId: string, flowId: string) { return this.rows.filter((r) => r.tenantId === tenantId && r.flowId === flowId); }
  async create(tenantId: string, input: Parameters<FlowTestCaseRepository['create']>[1]) {
    const row: FlowTestCase = { id: `t${this.rows.length + 1}`, tenantId, flowId: input.flowId, name: input.name, events: input.events, expect: input.expect, options: input.options, createdAt: '', updatedAt: '' };
    this.rows.push(row);
    return row;
  }
  async update(tenantId: string, id: string, patch: Parameters<FlowTestCaseRepository['update']>[2]) {
    const row = this.rows.find((r) => r.id === id && r.tenantId === tenantId);
    if (!row) return null;
    Object.assign(row, patch);
    return row;
  }
  async delete(tenantId: string, id: string) {
    const before = this.rows.length;
    this.rows = this.rows.filter((r) => !(r.id === id && r.tenantId === tenantId));
    return this.rows.length < before;
  }
}

function buildApp(role: 'super_admin' | 'admin_operator' = 'super_admin') {
  const repo = new InMemoryBotFlowRepository(T, FLOW, compileWizard(spec()));
  const tests = new MemoryTests();
  const audit = { log: jest.fn() };
  const simulate = new SimulateConversationUseCase(makeTenantConfigPort(makeTenantConfig()), makeInterpreter(), new BusinessHoursService(), 48 * 3600_000, silentLogger);
  const publishFlow = new PublishFlowUseCase(repo, tests, new StudioFlowTestRunner(simulate, silentLogger), silentLogger);

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.admin = { sub: '00000000-0000-0000-0000-0000000000ad', email: 'a@x.test', role, tenantId: role === 'super_admin' ? null : T } as never;
    next();
  });
  app.use(createFlowsRouter({ botFlowRepository: repo, publishFlow, audit: audit as never, logger: silentLogger }));
  app.use(createStudioRouter({ botFlowRepository: repo, simulateConversation: simulate, testCases: tests, audit: audit as never, logger: silentLogger }));
  return { app, repo, tests, audit };
}

const EMERGENCY_TEST = {
  name: 'Emergencia llega a confirmar',
  events: [
    { type: 'text', text: 'hola' },
    { type: 'button_reply', id: 'btn_0', title: '🚨 Emergencia' },
    { type: 'list_reply', id: 'Apertura de puerta', title: 'Apertura de puerta' },
    { type: 'text', text: 'Calle Morelos 12' },
  ],
  expect: { node: 'emergencia__confirmar', contains: ['Para confirmar'] },
};

describe('POST …/flows/:flowId/publish (compuerta)', () => {
  it('sin borrador: 409', async () => {
    const { app } = buildApp();

    const res = await request(app).post(`/tenants/${T}/flows/${FLOW}/publish`).send({});

    expect(res.status).toBe(409);
  });

  it('con errores del validador: 400 con issues legibles para el panel, sin publicar', async () => {
    const { app, repo } = buildApp();
    const broken = compileWizard(spec());
    broken.nodes = broken.nodes.filter((n) => n.id !== 'fin');
    await repo.saveDraft({ flowId: FLOW, tenantId: T, flow: broken });

    const res = await request(app).post(`/tenants/${T}/flows/${FLOW}/publish`).send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/^No se puede publicar: el flujo tiene \d+ error/);
    expect(res.body.issues[0]).toEqual({ path: expect.any(String), message: expect.stringMatching(/^V-/) });
    expect(repo.versions).toHaveLength(0);
  });

  it('con una prueba fallida: 400 con el nombre de la prueba y por qué falló', async () => {
    const { app, repo, tests } = buildApp();
    await tests.create(T, { flowId: FLOW, ...EMERGENCY_TEST, expect: { node: 'fin' }, options: {}, createdBy: null } as never);
    await repo.saveDraft({ flowId: FLOW, tenantId: T, flow: compileWizard(spec()) });

    const res = await request(app).post(`/tenants/${T}/flows/${FLOW}/publish`).send({});

    expect(res.status).toBe(400);
    expect(res.body.issues).toEqual([{ path: 'Emergencia llega a confirmar', message: 'Terminó en «emergencia__confirmar» y se esperaba «fin».' }]);
    expect(repo.versions).toHaveLength(0);
  });

  it('todo en verde: publica, audita y devuelve los reportes', async () => {
    const { app, repo, tests, audit } = buildApp();
    await tests.create(T, { flowId: FLOW, ...EMERGENCY_TEST, options: {}, createdBy: null } as never);
    await repo.saveDraft({ flowId: FLOW, tenantId: T, flow: compileWizard(spec()) });

    const res = await request(app).post(`/tenants/${T}/flows/${FLOW}/publish`).send({ note: 'v1' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ versionNumber: 1, report: { ok: true }, testReport: { passed: 1, failed: 0 } });
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'flow.publish', metadata: expect.objectContaining({ versionNumber: 1, tests: 1 }) }));
  });

  it('un admin_operator no puede publicar', async () => {
    const { app } = buildApp('admin_operator');

    expect((await request(app).post(`/tenants/${T}/flows/${FLOW}/publish`).send({})).status).toBe(403);
  });

  it('rollback: vuelve a v1 como versión nueva', async () => {
    const { app, repo } = buildApp();
    await repo.saveDraft({ flowId: FLOW, tenantId: T, flow: compileWizard(spec()) });
    await request(app).post(`/tenants/${T}/flows/${FLOW}/publish`).send({});
    const next = spec();
    next.farewell.text = 'Adiós';
    await repo.saveDraft({ flowId: FLOW, tenantId: T, flow: compileWizard(next) });
    await request(app).post(`/tenants/${T}/flows/${FLOW}/publish`).send({});

    const res = await request(app).post(`/tenants/${T}/flows/${FLOW}/rollback`).send({ versionNumber: 1 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ versionNumber: 3 });
    expect(repo.versions[2].note).toBe('rollback a v1');
  });
});

describe('casos de prueba', () => {
  const url = `/tenants/${T}/studio/flows/${FLOW}/tests`;

  it('crear, listar, editar, correr y borrar', async () => {
    const { app, audit } = buildApp('admin_operator');

    const created = await request(app).post(url).send(EMERGENCY_TEST);
    expect(created.status).toBe(201);
    const id = created.body.test.id;
    expect((await request(app).get(url)).body.tests).toHaveLength(1);

    const run = await request(app).post(`${url}/run`).send({ source: 'active' });
    expect(run.body.report).toMatchObject({ total: 1, passed: 1 });

    const edited = await request(app).put(`${url}/${id}`).send({ expect: { node: 'fin' } });
    expect(edited.status).toBe(200);
    const rerun = await request(app).post(`${url}/run`).send({ source: 'active' });
    expect(rerun.body.report).toMatchObject({ failed: 1 });

    expect((await request(app).delete(`${url}/${id}`)).status).toBe(200);
    expect((await request(app).delete(`${url}/${id}`)).status).toBe(404);
    expect(audit.log.mock.calls.map((c) => c[0].action)).toEqual(['flow.test.create', 'flow.test.update', 'flow.test.delete']);
  });

  it('rechaza una prueba sin expectativas o con eventos inválidos', async () => {
    const { app } = buildApp();

    expect((await request(app).post(url).send({ ...EMERGENCY_TEST, expect: {} })).status).toBe(400);
    expect((await request(app).post(url).send({ ...EMERGENCY_TEST, events: [{ type: 'tap' }] })).status).toBe(400);
  });
});

describe('explorador y diff', () => {
  it('explora el flow activo', async () => {
    const { app } = buildApp();

    const res = await request(app).post(`/tenants/${T}/studio/flows/${FLOW}/explore`).send({ source: 'active', depth: 6 });

    expect(res.status).toBe(200);
    expect(res.body.report.coverage.percent).toBe(100);
  });

  it('diff del borrador contra lo publicado', async () => {
    const { app, repo } = buildApp();
    await repo.saveDraft({ flowId: FLOW, tenantId: T, flow: compileWizard(spec()) });
    await request(app).post(`/tenants/${T}/flows/${FLOW}/publish`).send({});
    const next = spec();
    next.farewell.text = 'Adiós y gracias';
    await repo.saveDraft({ flowId: FLOW, tenantId: T, flow: compileWizard(next) });

    const res = await request(app).get(`/tenants/${T}/studio/flows/${FLOW}/diff`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ against: 1, source: 'draft', diff: { same: false } });
    expect(res.body.diff.changed).toEqual([{ nodeId: 'despedida', changes: [expect.stringContaining('«Adiós y gracias»')] }]);
  });

  it('diff contra una versión que no existe: 404', async () => {
    const { app } = buildApp();

    expect((await request(app).get(`/tenants/${T}/studio/flows/${FLOW}/diff?against=7`)).status).toBe(404);
  });
});
