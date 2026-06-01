import { Router, Request, Response } from 'express';
import type pino from 'pino';
import { z } from 'zod';
import type { BotFlowRepository } from '@/domain/ports/BotFlowRepository';
import type { AuditLogService } from '@/infrastructure/services/AuditLogService';
import { requireRole, requireTenantScope } from '@/infrastructure/auth/AuthMiddleware';
import { FlowValidationError } from '@/domain/validators/flowSchema';
import { ctx, errMsg } from './helpers';

/**
 * Sub-router del Bot Designer (Bloque A1): draft / publish / versiones / rollback.
 * Rutas: /api/admin/tenants/:id/flows[...]. El canvas/inspector llega en A2.
 */
export function createFlowsRouter(params: {
  botFlowRepository: BotFlowRepository;
  audit: AuditLogService;
  logger: pino.Logger;
}): Router {
  const { botFlowRepository, audit, logger } = params;
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

  // GET /api/admin/tenants/:id/flows/:flowId/draft — draft actual (o null)
  router.get(
    '/tenants/:id/flows/:flowId/draft',
    requireTenantScope,
    async (req: Request, res: Response) => {
      const tenantId = String(req.params.id);
      const flowId = String(req.params.flowId);
      try {
        const draft = await botFlowRepository.getDraft(flowId, tenantId);
        res.json({ draft });
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
      try {
        await botFlowRepository.saveDraft({ flowId, tenantId, flow });
        audit.log({
          ...c,
          action: 'flow.draft.save',
          targetType: 'bot_flow',
          targetId: flowId,
          metadata: { tenantId },
        });
        res.json({ ok: true });
      } catch (err) {
        logger.error({ err, flowId }, 'PUT draft failed');
        res.status(500).json({ error: 'Error guardando draft' });
      }
    },
  );

  // POST /api/admin/tenants/:id/flows/:flowId/publish — valida + versiona + activa
  router.post(
    '/tenants/:id/flows/:flowId/publish',
    requireTenantScope,
    async (req: Request, res: Response) => {
      const c = ctx(req);
      const tenantId = String(req.params.id);
      const flowId = String(req.params.flowId);
      const note = typeof req.body?.note === 'string' ? req.body.note : undefined;
      try {
        const { versionNumber } = await botFlowRepository.publishDraft({
          flowId,
          tenantId,
          createdBy: c.adminId,
          note,
        });
        audit.log({
          ...c,
          action: 'flow.publish',
          targetType: 'bot_flow',
          targetId: flowId,
          metadata: { tenantId, versionNumber },
        });
        res.json({ versionNumber });
      } catch (err) {
        // FlowValidationError: límites Meta, seguro de exponer al panel.
        if (err instanceof FlowValidationError) {
          res.status(400).json({ error: err.message, issues: err.issues });
          return;
        }
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

  // POST /api/admin/tenants/:id/flows/:flowId/rollback — super_admin
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
        const { versionNumber } = await botFlowRepository.rollback({
          flowId,
          tenantId,
          versionNumber: parsed.data.versionNumber,
          createdBy: c.adminId,
        });
        audit.log({
          ...c,
          action: 'flow.rollback',
          targetType: 'bot_flow',
          targetId: flowId,
          metadata: { tenantId, restoredFrom: parsed.data.versionNumber, newVersion: versionNumber },
        });
        res.json({ versionNumber });
      } catch (err) {
        logger.warn({ err: errMsg(err), flowId }, 'POST rollback failed');
        res.status(500).json({ error: 'Error en rollback. Revisa logs del servidor.' });
      }
    },
  );

  return router;
}
