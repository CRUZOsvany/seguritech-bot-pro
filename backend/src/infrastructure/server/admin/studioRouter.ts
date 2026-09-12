import { Router, Request, Response } from 'express';
import type pino from 'pino';
import { z } from 'zod';
import type { BotFlowRepository } from '@/domain/ports/BotFlowRepository';
import type { BotFlow } from '@/domain/entities/flow';
import type { SimulateConversationUseCase } from '@/domain/use-cases/SimulateConversationUseCase';
import { validateFlow, FlowValidationError } from '@/domain/validators/flowSchema';
import { requireTenantScope } from '@/infrastructure/auth/AuthMiddleware';
import { DEFAULT_SIM_PHONE, SimEventSchema, eventToStep, toApiTurn } from './studioSimulation';
import { ctx, errMsg } from './helpers';
import type { AuditLogService } from '@/infrastructure/services/AuditLogService';
import { requireRole } from '@/infrastructure/auth/AuthMiddleware';
import { WizardSpecSchema, compileWizard, readWizardSpec } from '@/domain/studio/wizard';
import { STUDIO_MOLDS } from '@/domain/studio/molds';
import { TestExpectationSchema, TestOptionsSchema } from '@/domain/studio/testCases';
import { diffFlows } from '@/domain/studio/diff';
import { TestCasesUnavailableError, type FlowTestCaseRepository } from '@/domain/ports/FlowTestCaseRepository';
import { StudioFlowTestRunner } from '@/infrastructure/studio/StudioFlowTestRunner';
import { StudioFlowExplorer } from '@/infrastructure/studio/StudioFlowExplorer';
import { validateFlowDesign } from '@/domain/validation/flowDesignValidator';
import { WHATSAPP_LIMITS, WHATSAPP_LIMITS_VERIFIED_AT } from '@/domain/whatsapp/limits';


const SourceSchema = z.object({
  source: z.enum(['draft', 'active', 'version']).default('draft'),
  versionId: z.string().min(1).optional(),
});

const SimulateBodySchema = z.object({
  events: z.array(SimEventSchema).min(1).max(100),
  /**
   * 'draft': lo que se está editando (el borrador, o una copia de lo publicado
   * si no hay borrador), igual que el Designer. 'active': lo que el bot real
   * contesta hoy — solo si este flow es el activo del tenant.
   */
  source: z.enum(['draft', 'active', 'version']).default('draft'),
  /** Requerido con source 'version': una versión publicada del historial (id de bot_flow_versions). */
  versionId: z.string().min(1).optional(),
  /** Hora de arranque del reloj simulado (ISO 8601 con zona). Default: ahora. */
  startAt: z.string().datetime({ offset: true }).optional(),
  /** Teléfono del cliente simulado. Si es el del dueño, aplican sus reglas. */
  from: z.string().regex(/^\d{8,15}$/).optional(),
});

/**
 * Endpoints del Studio: simulación (Fase 1), validación y límites (Fase 2),
 * asistente (Fase 3). Rutas bajo
 * /api/admin/tenants/:id/studio/... (decisión D-3): heredan requireTenantScope,
 * así que un admin_operator solo simula flows de su propio tenant.
 *
 * La simulación no muta nada (sin escritura en BD, sin Meta, sin avisos), así
 * que no pasa por el audit log — mismo criterio que POST /simulate sin persist.
 */
export function createStudioRouter(params: {
  botFlowRepository: BotFlowRepository;
  simulateConversation: SimulateConversationUseCase;
  /** Casos de prueba guardados (flow_test_cases, migración 023). */
  testCases: FlowTestCaseRepository;
  audit: AuditLogService;
  logger: pino.Logger;
}): Router {
  const { botFlowRepository, simulateConversation, testCases, audit, logger } = params;
  const router = Router();
  const runner = new StudioFlowTestRunner(simulateConversation, logger);
  const explorer = new StudioFlowExplorer(simulateConversation, logger);

  router.post(
    '/tenants/:id/studio/flows/:flowId/simulate',
    requireTenantScope,
    async (req: Request, res: Response) => {
      const tenantId = String(req.params.id);
      const flowId = String(req.params.flowId);
      const parsed = SimulateBodySchema.safeParse(req.body);
      if (!parsed.success) {
        const first = parsed.error.issues[0];
        res.status(400).json({ error: `${first.path.join('.')}: ${first.message}` });
        return;
      }
      const body = parsed.data;
      if (body.source === 'version' && !body.versionId) {
        res.status(400).json({ error: "versionId: requerido con source 'version'" });
        return;
      }

      try {
        const resolved = await resolveFlow(
          botFlowRepository,
          tenantId,
          flowId,
          body.source,
          body.versionId,
        );
        if (!resolved.ok) {
          res.status(resolved.status).json(resolved.body);
          return;
        }

        const from = body.from ?? DEFAULT_SIM_PHONE;
        const startAt = body.startAt ? new Date(body.startAt) : new Date();
        const steps = body.events.map((e, i) => eventToStep(e, i, from, logger));

        const turns = await simulateConversation.execute({
          tenantId,
          flow: resolved.flow,
          from,
          startAt,
          steps,
        });

        res.json({
          source: body.source,
          flowId,
          from,
          startAt: startAt.toISOString(),
          turns: turns.map(toApiTurn),
        });
      } catch (err) {
        logger.error({ err: errMsg(err), tenantId, flowId }, 'POST studio simulate failed');
        res.status(500).json({ error: 'Error simulando la conversación' });
      }
    },
  );

  // POST /tenants/:id/studio/flows/:flowId/validate — reporte del validador
  // de diseño (Fase 2). Informa; la publicación la sigue decidiendo el schema.
  // El borrador se valida tal cual está, sin exigir antes que pase el schema:
  // es justo lo que se quiere revisar.
  router.post(
    '/tenants/:id/studio/flows/:flowId/validate',
    requireTenantScope,
    async (req: Request, res: Response) => {
      const tenantId = String(req.params.id);
      const flowId = String(req.params.flowId);
      const parsed = SourceSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        const first = parsed.error.issues[0];
        res.status(400).json({ error: `${first.path.join('.')}: ${first.message}` });
        return;
      }
      const { source, versionId } = parsed.data;
      if (source === 'version' && !versionId) {
        res.status(400).json({ error: "versionId: requerido con source 'version'" });
        return;
      }
      try {
        const loaded = await loadFlow(botFlowRepository, tenantId, flowId, source, versionId);
        if (!loaded.ok) {
          res.status(loaded.status).json(loaded.body);
          return;
        }
        res.json({ source, flowId, report: validateFlowDesign(loaded.flow) });
      } catch (err) {
        logger.error({ err: errMsg(err), tenantId, flowId }, 'POST studio validate failed');
        res.status(500).json({ error: 'Error validando el flujo' });
      }
    },
  );

  // GET /studio/limits — los límites de WhatsApp que usa el validador, para
  // que el panel no escriba ningún número a mano (regla 4).
  router.get('/studio/limits', (_req: Request, res: Response) => {
    res.json({ verifiedAt: WHATSAPP_LIMITS_VERIFIED_AT, limits: WHATSAPP_LIMITS });
  });

  // ==========================================================================
  // Asistente (Fase 3)
  // ==========================================================================

  // GET /studio/molds — moldes del asistente: especificación + textos sugeridos.
  router.get('/studio/molds', (_req: Request, res: Response) => {
    res.json({ molds: STUDIO_MOLDS });
  });

  // POST /tenants/:id/studio/wizard/preview — compila y valida sin guardar.
  // Es la validación en vivo del asistente.
  router.post('/tenants/:id/studio/wizard/preview', requireTenantScope, (req: Request, res: Response) => {
    const parsed = WizardSpecSchema.safeParse(req.body?.spec);
    if (!parsed.success) {
      res.status(400).json({ error: 'La especificación no es válida', issues: specIssues(parsed.error.issues) });
      return;
    }
    const flow = compileWizard(parsed.data);
    res.json({ flow, report: validateFlowDesign(flow) });
  });

  // GET /tenants/:id/studio/flows/:flowId/wizard — la especificación del
  // asistente guardada en el flow editable, o por qué no se puede abrir.
  router.get(
    '/tenants/:id/studio/flows/:flowId/wizard',
    requireTenantScope,
    async (req: Request, res: Response) => {
      const tenantId = String(req.params.id);
      const flowId = String(req.params.flowId);
      try {
        const [editable, meta] = await Promise.all([
          botFlowRepository.getEditableFlow(flowId, tenantId),
          botFlowRepository.getDraftMeta(flowId, tenantId),
        ]);
        if (!editable) {
          res.status(404).json({ error: 'Flow no encontrado' });
          return;
        }
        const read = readWizardSpec(editable.flow);
        res.json({
          spec: read.ok ? read.spec : null,
          ...(read.ok ? {} : { reason: read.reason }),
          source: editable.source,
          draftUpdatedAt: meta?.draftUpdatedAt ?? null,
        });
      } catch (err) {
        logger.error({ err: errMsg(err), tenantId, flowId }, 'GET studio wizard failed');
        res.status(500).json({ error: 'Error leyendo el asistente' });
      }
    },
  );

  // PUT /tenants/:id/studio/flows/:flowId/wizard — compila y guarda como
  // borrador. Cambiar la estructura del bot es de super_admin (§13 de la
  // especificación); publicar sigue siendo POST .../publish.
  router.put(
    '/tenants/:id/studio/flows/:flowId/wizard',
    requireRole('super_admin'),
    async (req: Request, res: Response) => {
      const c = ctx(req);
      const tenantId = String(req.params.id);
      const flowId = String(req.params.flowId);
      const parsed = WizardSpecSchema.safeParse(req.body?.spec);
      if (!parsed.success) {
        res.status(400).json({ error: 'La especificación no es válida', issues: specIssues(parsed.error.issues) });
        return;
      }
      const expectedDraftUpdatedAt =
        req.body && 'expectedDraftUpdatedAt' in req.body
          ? (req.body.expectedDraftUpdatedAt as string | null)
          : undefined;
      try {
        const flow = compileWizard(parsed.data);
        const result = await botFlowRepository.saveDraft({ flowId, tenantId, flow, expectedDraftUpdatedAt });
        if (result.conflict) {
          res.status(409).json({ error: 'Este flujo cambió desde que lo cargaste. Recarga antes de guardar.' });
          return;
        }
        audit.log({
          ...c,
          action: 'flow.draft.save',
          targetType: 'bot_flow',
          targetId: flowId,
          metadata: { tenantId, via: 'studio_wizard', options: parsed.data.options.length },
        });
        res.json({ draftUpdatedAt: result.draftUpdatedAt, report: validateFlowDesign(flow) });
      } catch (err) {
        logger.error({ err: errMsg(err), tenantId, flowId }, 'PUT studio wizard failed');
        res.status(500).json({ error: 'Error guardando el asistente' });
      }
    },
  );

  // ==========================================================================
  // Pruebas, explorador y diff (Fase 4)
  // ==========================================================================

  const base = '/tenants/:id/studio/flows/:flowId';
  const ids = (req: Request) => ({ tenantId: String(req.params.id), flowId: String(req.params.flowId) });

  // GET …/tests — casos de prueba guardados del flow.
  router.get(`${base}/tests`, requireTenantScope, async (req: Request, res: Response) => {
    const { tenantId, flowId } = ids(req);
    try {
      res.json({ tests: await testCases.list(tenantId, flowId) });
    } catch (err) {
      logger.error({ err: errMsg(err), tenantId, flowId }, 'GET studio tests failed');
      res.status(500).json({ error: 'Error leyendo las pruebas' });
    }
  });

  // POST …/tests — guardar una conversación como prueba. Crear pruebas es de
  // cualquier admin de su tenant (§13 de la especificación).
  router.post(`${base}/tests`, requireTenantScope, async (req: Request, res: Response) => {
    const c = ctx(req);
    const { tenantId, flowId } = ids(req);
    const parsed = TestBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'La prueba no es válida', issues: specIssues(parsed.error.issues) });
      return;
    }
    try {
      // El flow tiene que ser de este tenant: sin esto quedaría una prueba
      // colgada de un flow ajeno (la tabla no cruza tenant_id con el flow).
      if (!(await botFlowRepository.getEditableFlow(flowId, tenantId))) {
        res.status(404).json({ error: 'Flow no encontrado' });
        return;
      }
      const test = await testCases.create(tenantId, { flowId, ...parsed.data, createdBy: c.adminId });
      audit.log({ ...c, action: 'flow.test.create', targetType: 'flow_test_case', targetId: test.id, metadata: { tenantId, flowId } });
      res.status(201).json({ test });
    } catch (err) {
      sendTestError(err, res, logger, 'POST studio test failed');
    }
  });

  router.put(`${base}/tests/:testId`, requireTenantScope, async (req: Request, res: Response) => {
    const c = ctx(req);
    const { tenantId, flowId } = ids(req);
    const testId = String(req.params.testId);
    const parsed = TestBodySchema.partial().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'La prueba no es válida', issues: specIssues(parsed.error.issues) });
      return;
    }
    try {
      const test = await testCases.update(tenantId, testId, parsed.data);
      if (!test) {
        res.status(404).json({ error: 'Prueba no encontrada' });
        return;
      }
      audit.log({ ...c, action: 'flow.test.update', targetType: 'flow_test_case', targetId: testId, metadata: { tenantId, flowId } });
      res.json({ test });
    } catch (err) {
      sendTestError(err, res, logger, 'PUT studio test failed');
    }
  });

  router.delete(`${base}/tests/:testId`, requireTenantScope, async (req: Request, res: Response) => {
    const c = ctx(req);
    const { tenantId, flowId } = ids(req);
    const testId = String(req.params.testId);
    try {
      if (!(await testCases.delete(tenantId, testId))) {
        res.status(404).json({ error: 'Prueba no encontrada' });
        return;
      }
      audit.log({ ...c, action: 'flow.test.delete', targetType: 'flow_test_case', targetId: testId, metadata: { tenantId, flowId } });
      res.json({ ok: true });
    } catch (err) {
      sendTestError(err, res, logger, 'DELETE studio test failed');
    }
  });

  // POST …/tests/run — corre todas las pruebas contra el borrador (o lo
  // activo, o una versión). No publica nada.
  router.post(`${base}/tests/run`, requireTenantScope, async (req: Request, res: Response) => {
    const { tenantId, flowId } = ids(req);
    const parsed = SourceSchema.safeParse(req.body ?? {});
    if (!parsed.success || (parsed.data.source === 'version' && !parsed.data.versionId)) {
      res.status(400).json({ error: 'Fuente inválida' });
      return;
    }
    try {
      const resolved = await resolveFlow(botFlowRepository, tenantId, flowId, parsed.data.source, parsed.data.versionId);
      if (!resolved.ok) {
        res.status(resolved.status).json(resolved.body);
        return;
      }
      const cases = await testCases.list(tenantId, flowId);
      res.json({ report: await runner.run(tenantId, resolved.flow, cases) });
    } catch (err) {
      logger.error({ err: errMsg(err), tenantId, flowId }, 'POST studio tests/run failed');
      res.status(500).json({ error: 'Error corriendo las pruebas' });
    }
  });

  // POST …/explore — explorador de ramas.
  router.post(`${base}/explore`, requireTenantScope, async (req: Request, res: Response) => {
    const { tenantId, flowId } = ids(req);
    const parsed = SourceSchema.extend({ depth: z.number().int().min(1).max(8).default(5) }).safeParse(req.body ?? {});
    if (!parsed.success || (parsed.data.source === 'version' && !parsed.data.versionId)) {
      res.status(400).json({ error: 'Parámetros inválidos' });
      return;
    }
    try {
      const resolved = await resolveFlow(botFlowRepository, tenantId, flowId, parsed.data.source, parsed.data.versionId);
      if (!resolved.ok) {
        res.status(resolved.status).json(resolved.body);
        return;
      }
      res.json({ report: await explorer.explore(tenantId, resolved.flow, { depth: parsed.data.depth }) });
    } catch (err) {
      logger.error({ err: errMsg(err), tenantId, flowId }, 'POST studio explore failed');
      res.status(500).json({ error: 'Error explorando el flujo' });
    }
  });

  // GET …/diff?against=<n> — qué cambió en lo editable respecto a lo
  // publicado (la versión más nueva) o a una versión del historial.
  router.get(`${base}/diff`, requireTenantScope, async (req: Request, res: Response) => {
    const { tenantId, flowId } = ids(req);
    const against = req.query.against === undefined ? null : Number(req.query.against);
    if (against !== null && (!Number.isInteger(against) || against < 1)) {
      res.status(400).json({ error: 'against: número de versión inválido' });
      return;
    }
    try {
      const [editable, versions] = await Promise.all([
        botFlowRepository.getEditableFlow(flowId, tenantId),
        botFlowRepository.listVersions(flowId, tenantId),
      ]);
      if (!editable) {
        res.status(404).json({ error: 'Flow no encontrado' });
        return;
      }
      const target = against === null ? versions[0] : versions.find((v) => v.versionNumber === against);
      if (against !== null && !target) {
        res.status(404).json({ error: 'Versión no encontrada' });
        return;
      }
      const before = target ? await botFlowRepository.getVersionFlow(target.id, tenantId) : null;
      const after = editable.flow as BotFlow;
      if (!Array.isArray((after as { nodes?: unknown }).nodes)) {
        res.status(400).json({ error: 'El borrador no tiene la forma de un flujo' });
        return;
      }
      res.json({ against: target?.versionNumber ?? null, source: editable.source, diff: diffFlows(before, after) });
    } catch (err) {
      logger.error({ err: errMsg(err), tenantId, flowId }, 'GET studio diff failed');
      res.status(500).json({ error: 'Error calculando los cambios' });
    }
  });

  return router;
}

const TestBodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  events: z.array(SimEventSchema).min(1).max(100),
  expect: TestExpectationSchema,
  options: TestOptionsSchema.default({}),
});

function sendTestError(err: unknown, res: Response, logger: pino.Logger, msg: string): void {
  if (err instanceof TestCasesUnavailableError) {
    res.status(503).json({ error: err.message });
    return;
  }
  logger.error({ err: errMsg(err) }, msg);
  res.status(500).json({ error: 'Error guardando la prueba' });
}

/** Issues de Zod en la forma que muestra el panel: ruta legible + mensaje. */
function specIssues(issues: z.ZodIssue[]): Array<{ path: string; message: string }> {
  return issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
}

type Loaded =
  | { ok: true; flow: unknown }
  | { ok: false; status: number; body: Record<string, unknown> };

/** El JSON del flow según la fuente, sin validarlo. */
async function loadFlow(
  repo: BotFlowRepository,
  tenantId: string,
  flowId: string,
  source: 'draft' | 'active' | 'version',
  versionId?: string,
): Promise<Loaded> {
  if (source === 'version') {
    // getVersionFlow filtra por tenant: una versión de otro tenant no existe aquí.
    const flow = await repo.getVersionFlow(versionId!, tenantId);
    if (!flow) return { ok: false, status: 404, body: { error: 'Versión no encontrada' } };
    return { ok: true, flow };
  }

  if (source === 'draft') {
    const editable = await repo.getEditableFlow(flowId, tenantId);
    if (!editable) return { ok: false, status: 404, body: { error: 'Flow no encontrado' } };
    return { ok: true, flow: editable.flow };
  }

  const flows = await repo.listFlowsByTenant(tenantId);
  const target = flows.find((f) => f.id === flowId);
  if (!target) return { ok: false, status: 404, body: { error: 'Flow no encontrado' } };
  if (!target.isActive) {
    return {
      ok: false,
      status: 409,
      body: { error: 'Este flow no es el que atiende al tenant. Simula su borrador o publícalo.' },
    };
  }
  const active = await repo.findActiveByTenant(tenantId);
  if (!active) return { ok: false, status: 404, body: { error: 'El tenant no tiene flow publicado' } };
  return { ok: true, flow: active };
}

/**
 * Para simular, un borrador tiene que pasar el schema (el motor no corre un
 * flow mal formado). Lo publicado y las versiones ya lo pasaron al publicarse.
 */
async function resolveFlow(
  repo: BotFlowRepository,
  tenantId: string,
  flowId: string,
  source: 'draft' | 'active' | 'version',
  versionId?: string,
): Promise<{ ok: true; flow: BotFlow } | { ok: false; status: number; body: Record<string, unknown> }> {
  const loaded = await loadFlow(repo, tenantId, flowId, source, versionId);
  if (!loaded.ok) return loaded;
  if (source !== 'draft') return { ok: true, flow: loaded.flow as BotFlow };
  try {
    return { ok: true, flow: validateFlow(loaded.flow) };
  } catch (err) {
    if (err instanceof FlowValidationError) {
      return {
        ok: false,
        status: 400,
        body: { error: `El borrador no es válido: ${err.message}`, issues: err.issues },
      };
    }
    throw err;
  }
}
