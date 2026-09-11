import { Router, Request, Response } from 'express';
import type pino from 'pino';
import { z } from 'zod';
import { DraftChangedError, type BotFlowRepository } from '@/domain/ports/BotFlowRepository';
import type { PublishFlowUseCase, PublishOutcome } from '@/domain/use-cases/PublishFlowUseCase';
import type { AuditLogService } from '@/infrastructure/services/AuditLogService';
import { requireRole, requireTenantScope } from '@/infrastructure/auth/AuthMiddleware';
import { FlowValidationError } from '@/domain/validators/flowSchema';
import { RestrictedGiroGuardrailError } from '@/domain/validators/restrictedGiroCatalogGuardrail';
import { ctx, errMsg } from './helpers';

/**
 * Sub-router del Bot Designer (Bloque A1): draft / publish / versiones / rollback.
 * Rutas: /api/admin/tenants/:id/flows[...]. El canvas/inspector llega en A2.
 */
export function createFlowsRouter(params: {
  botFlowRepository: BotFlowRepository;
  /** Publicar y hacer rollback pasan por la compuerta del Studio (Fase 4). */
  publishFlow: PublishFlowUseCase;
  audit: AuditLogService;
  logger: pino.Logger;
}): Router {
  const { botFlowRepository, publishFlow, audit, logger } = params;
  const router = Router();

  // GET /api/admin/tenants/:id/flows — lista flows del tenant (resuelve flowId)
  router.get('/tenants/:id/flows', requireTenantScope, async (req: Request, res: Response) => {
    const tenantId = String(req.params.id);
    try {
      const flows = await botFlowRepository.listFlowsByTenant(tenantId);
      res.json({ flows });
    } catch (err) {
      logger.error({ err, tenantId }, 'GET /tenants/:id/flows failed');
      res.status(500).json({ error: 'Error listando flows' });
    }
  });

  // GET /api/admin/tenants/:id/flows/:flowId/draft — lo editable: el draft
  // si existe, si no una copia de lo publicado (ver getEditableFlow).
  // P7: la respuesta incluye `draftUpdatedAt` además de `draft` — campo extra,
  // no rompe al Designer (useDraft solo lee `res.draft`). El Guion lo usa
  // para saber qué timestamp tenía cargado antes de guardar (concurrencia
  // optimista abajo, en el PUT).
  router.get(
    '/tenants/:id/flows/:flowId/draft',
    requireTenantScope,
    async (req: Request, res: Response) => {
      const tenantId = String(req.params.id);
      const flowId = String(req.params.flowId);
      try {
        const [editable, meta] = await Promise.all([
          botFlowRepository.getEditableFlow(flowId, tenantId),
          botFlowRepository.getDraftMeta(flowId, tenantId),
        ]);
        // `source` dice si lo que va en `draft` es un borrador de verdad o una
        // copia de lo publicado (ver getEditableFlow). El Designer lo usa para
        // avisarlo; los clientes viejos que solo leen `draft` no se rompen.
        res.json({
          draft: editable?.flow ?? null,
          draftUpdatedAt: meta?.draftUpdatedAt ?? null,
          source: editable?.source ?? null,
        });
      } catch (err) {
        logger.error({ err, flowId }, 'GET draft failed');
        res.status(500).json({ error: 'Error obteniendo draft' });
      }
    },
  );

  // PUT /api/admin/tenants/:id/flows/:flowId/draft — guarda draft (sin validar)
  router.put(
    '/tenants/:id/flows/:flowId/draft',
    requireTenantScope,
    async (req: Request, res: Response) => {
      const c = ctx(req);
      const tenantId = String(req.params.id);
      const flowId = String(req.params.flowId);
      const body = req.body ?? {};
      // Acepta { flow: {...} } o el objeto del flow directo en el body.
      const flow = body.flow ?? body;
      if (flow == null || typeof flow !== 'object' || Array.isArray(flow)) {
        res.status(400).json({ error: 'Body debe incluir el draft del flow (objeto)' });
        return;
      }
      // P7: concurrencia optimista OPCIONAL — solo viaja cuando el caller
      // (el Guion) sabe qué draft_updated_at tenía cargado. El Designer no lo
      // manda: sigue sobrescribiendo sin condición, como siempre.
      const expectedDraftUpdatedAt =
        'expectedDraftUpdatedAt' in body
          ? (body.expectedDraftUpdatedAt as string | null)
          : undefined;
      try {
        const result = await botFlowRepository.saveDraft({
          flowId,
          tenantId,
          flow,
          expectedDraftUpdatedAt,
        });
        if (result.conflict) {
          res.status(409).json({
            error: 'Este flujo cambió desde que lo cargaste. Recarga antes de guardar.',
          });
          return;
        }
        audit.log({
          ...c,
          action: 'flow.draft.save',
          targetType: 'bot_flow',
          targetId: flowId,
          metadata: { tenantId },
        });
        res.json({ ok: true, draftUpdatedAt: result.draftUpdatedAt });
      } catch (err) {
        logger.error({ err, flowId }, 'PUT draft failed');
        res.status(500).json({ error: 'Error guardando draft' });
      }
    },
  );

  // POST /api/admin/tenants/:id/flows/:flowId/publish — la compuerta de la
  // Fase 4 del Studio: validador de diseño + schema + pruebas guardadas, y
  // solo entonces publicación atómica (PublishFlowUseCase).
  // super_admin ONLY (D5): admin_operator puede guardar draft y ver el
  // historial, pero empujar a producción y deshacerlo quedan bajo el mismo
  // candado.
  router.post(
    '/tenants/:id/flows/:flowId/publish',
    requireRole('super_admin'),
    async (req: Request, res: Response) => {
      const c = ctx(req);
      const tenantId = String(req.params.id);
      const flowId = String(req.params.flowId);
      const note = typeof req.body?.note === 'string' ? req.body.note : undefined;
      try {
        const outcome = await publishFlow.publish({ tenantId, flowId, createdBy: c.adminId, note });
        if (!outcome.ok) {
          sendRejection(res, outcome);
          return;
        }
        audit.log({
          ...c,
          action: 'flow.publish',
          targetType: 'bot_flow',
          targetId: flowId,
          metadata: {
            tenantId,
            versionNumber: outcome.versionNumber,
            warnings: outcome.report.summary.warnings,
            tests: outcome.testReport?.total ?? 0,
          },
        });
        res.json({ versionNumber: outcome.versionNumber, report: outcome.report, testReport: outcome.testReport });
      } catch (err) {
        if (handleKnownError(err, res)) return;
        logger.warn({ err: errMsg(err), flowId }, 'POST publish failed');
        res.status(500).json({ error: 'Error publicando flow. Revisa logs del servidor.' });
      }
    },
  );

  // GET /api/admin/tenants/:id/flows/:flowId/versions — historial publicado
  router.get(
    '/tenants/:id/flows/:flowId/versions',
    requireTenantScope,
    async (req: Request, res: Response) => {
      const tenantId = String(req.params.id);
      const flowId = String(req.params.flowId);
      try {
        const versions = await botFlowRepository.listVersions(flowId, tenantId);
        res.json({ versions });
      } catch (err) {
        logger.error({ err, flowId }, 'GET versions failed');
        res.status(500).json({ error: 'Error listando versiones' });
      }
    },
  );

  // GET /api/admin/tenants/:id/flows/:flowId/versions/:versionId — flow_json
  // de una versión histórica. Wrapper mínimo sobre getVersionFlow() (ya
  // existente): P6 lo necesita para "restaurar como draft" — cargar una
  // versión al canvas SIN publicarla, algo que rollback no permite (rollback
  // publica de inmediato). requireTenantScope, no super_admin: leer una
  // versión histórica para decidir si se restaura no es una mutación.
  router.get(
    '/tenants/:id/flows/:flowId/versions/:versionId',
    requireTenantScope,
    async (req: Request, res: Response) => {
      const tenantId = String(req.params.id);
      const versionId = String(req.params.versionId);
      try {
        const flow = await botFlowRepository.getVersionFlow(versionId, tenantId);
        if (!flow) {
          res.status(404).json({ error: 'Versión no encontrada' });
          return;
        }
        res.json({ flow });
      } catch (err) {
        logger.error({ err, versionId }, 'GET version flow failed');
        res.status(500).json({ error: 'Error obteniendo versión' });
      }
    },
  );

  // POST /api/admin/tenants/:id/flows/:flowId/rollback — super_admin.
  // Publica el contenido de una versión anterior como versión nueva, pasando
  // por el validador (no por las pruebas: ver PublishFlowUseCase.rollback).
  router.post(
    '/tenants/:id/flows/:flowId/rollback',
    requireRole('super_admin'),
    async (req: Request, res: Response) => {
      const c = ctx(req);
      const tenantId = String(req.params.id);
      const flowId = String(req.params.flowId);
      const parsed = z
        .object({ versionNumber: z.number().int().positive() })
        .safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'versionNumber (entero positivo) requerido' });
        return;
      }
      try {
        const outcome = await publishFlow.rollback({
          tenantId,
          flowId,
          versionNumber: parsed.data.versionNumber,
          createdBy: c.adminId,
        });
        if (!outcome.ok) {
          sendRejection(res, outcome);
          return;
        }
        audit.log({
          ...c,
          action: 'flow.rollback',
          targetType: 'bot_flow',
          targetId: flowId,
          metadata: { tenantId, restoredFrom: parsed.data.versionNumber, newVersion: outcome.versionNumber },
        });
        res.json({ versionNumber: outcome.versionNumber });
      } catch (err) {
        if (handleKnownError(err, res)) return;
        logger.warn({ err: errMsg(err), flowId }, 'POST rollback failed');
        res.status(500).json({ error: 'Error en rollback. Revisa logs del servidor.' });
      }
    },
  );

  return router;
}

/**
 * Por qué no se publicó, en la forma que ya muestra el Designer:
 * { error, issues: [{ path, message }] } + el reporte completo.
 */
function sendRejection(res: Response, outcome: Exclude<PublishOutcome, { ok: true }>): void {
  switch (outcome.reason) {
  case 'not_found':
    res.status(404).json({ error: 'Flow o versión no encontrada' });
    return;
  case 'nothing_to_publish':
    res.status(409).json({ error: 'No hay cambios sin publicar: lo editable es igual a lo publicado.' });
    return;
  case 'validation': {
    const issues = [
      ...outcome.report.issues
        .filter((i) => i.level === 'error')
        .map((i) => ({ path: i.nodeId ?? i.code, message: `${i.code}: ${i.message}` })),
      ...outcome.report.schema.issues,
    ];
    res.status(400).json({ error: `No se puede publicar: el flujo tiene ${issues.length} error(es).`, issues, report: outcome.report });
    return;
  }
  case 'tests': {
    const failed = outcome.testReport.results.filter((r) => !r.passed);
    res.status(400).json({
      error: `No se puede publicar: fallan ${failed.length} prueba(s).`,
      issues: failed.map((r) => ({ path: r.name, message: r.failures.join(' ') })),
      report: outcome.report,
      testReport: outcome.testReport,
    });
  }
  }
}

/** Errores conocidos de publicar: se contestan con su motivo en vez de un 500. */
function handleKnownError(err: unknown, res: Response): boolean {
  // FlowValidationError: límites Meta, seguro de exponer al panel.
  if (err instanceof FlowValidationError) {
    res.status(400).json({ error: err.message, issues: err.issues });
    return true;
  }
  // RestrictedGiroGuardrailError (DEC-12): giro médico/farmacia con
  // categorías de catálogo restringidas.
  if (err instanceof RestrictedGiroGuardrailError) {
    res.status(400).json({ error: err.message, offendingCategories: err.offendingCategories });
    return true;
  }
  if (err instanceof DraftChangedError) {
    res.status(409).json({ error: err.message });
    return true;
  }
  return false;
}
