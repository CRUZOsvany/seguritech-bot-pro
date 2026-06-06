import { Router, Request, Response } from 'express';
import type pino from 'pino';
import { z } from 'zod';
import type { WhatsAppFlowRepository } from '@/domain/ports/WhatsAppFlowRepository';
import type { AuditLogService } from '@/infrastructure/services/AuditLogService';
import { requireRole, requireTenantScope } from '@/infrastructure/auth/AuthMiddleware';
import { ctx, errMsg } from './helpers';

/**
 * Sub-router CRUD de WhatsApp Flows (formularios multipantalla de Meta).
 *
 * Rutas bajo /api/admin/tenants/:id/whatsapp-flows[...].
 * Todos los endpoints requieren autenticación admin (aplicada en AdminRouter).
 * requireTenantScope: admin_operator solo ve su tenant; super_admin ve todos.
 * DELETE requiere super_admin adicionalmente.
 *
 * Audit log en toda mutación (POST, PUT, DELETE).
 */

// ============================================================================
// SCHEMAS ZOD
// ============================================================================

const CreateFlowSchema = z.object({
  name: z.string().min(1, 'name requerido').max(120, 'name ≤ 120 chars'),
  flowIdMeta: z
    .string()
    .min(1)
    .max(100)
    .optional(),
  flowJson: z.record(z.unknown()).optional(),
});

const UpdateFlowSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  flowIdMeta: z.string().min(1).max(100).nullable().optional(),
  flowJson: z.record(z.unknown()).nullable().optional(),
  status: z.enum(['draft', 'active', 'archived']).optional(),
});

// ============================================================================
// FACTORY
// ============================================================================

export function createWhatsappFlowsRouter(params: {
  whatsappFlowRepository: WhatsAppFlowRepository;
  audit: AuditLogService;
  logger: pino.Logger;
}): Router {
  const { whatsappFlowRepository, audit, logger } = params;
  const router = Router();

  // --------------------------------------------------------------------------
  // GET /api/admin/tenants/:id/whatsapp-flows
  // Lista todos los flows del tenant (resumen, sin flowJson).
  // --------------------------------------------------------------------------
  router.get(
    '/tenants/:id/whatsapp-flows',
    requireTenantScope,
    async (req: Request, res: Response) => {
      const tenantId = String(req.params.id);
      try {
        const flows = await whatsappFlowRepository.listByTenant(tenantId);
        res.json({ flows });
      } catch (err) {
        logger.error({ err, tenantId }, 'GET /tenants/:id/whatsapp-flows failed');
        res.status(500).json({ error: 'Error listando WhatsApp Flows' });
      }
    },
  );

  // --------------------------------------------------------------------------
  // GET /api/admin/tenants/:id/whatsapp-flows/:flowId
  // Detalle completo de un flow (incluye flowJson).
  // --------------------------------------------------------------------------
  router.get(
    '/tenants/:id/whatsapp-flows/:flowId',
    requireTenantScope,
    async (req: Request, res: Response) => {
      const tenantId = String(req.params.id);
      const flowId = String(req.params.flowId);
      try {
        const flow = await whatsappFlowRepository.findById(flowId, tenantId);
        if (!flow) {
          res.status(404).json({ error: 'WhatsApp Flow no encontrado' });
          return;
        }
        res.json({ flow });
      } catch (err) {
        logger.error({ err, tenantId, flowId }, 'GET /tenants/:id/whatsapp-flows/:flowId failed');
        res.status(500).json({ error: 'Error obteniendo WhatsApp Flow' });
      }
    },
  );

  // --------------------------------------------------------------------------
  // POST /api/admin/tenants/:id/whatsapp-flows
  // Crea un nuevo WhatsApp Flow para el tenant.
  // --------------------------------------------------------------------------
  router.post(
    '/tenants/:id/whatsapp-flows',
    requireTenantScope,
    async (req: Request, res: Response) => {
      const tenantId = String(req.params.id);
      const c = ctx(req);

      const parsed = CreateFlowSchema.safeParse(req.body);
      if (!parsed.success) {
        const first = parsed.error.issues[0];
        res.status(400).json({ error: `${first.path.join('.')}: ${first.message}` });
        return;
      }

      try {
        const flow = await whatsappFlowRepository.create({
          tenantId,
          name: parsed.data.name,
          flowIdMeta: parsed.data.flowIdMeta,
          flowJson: parsed.data.flowJson,
          createdBy: c.adminId,
        });

        audit.log({
          ...c,
          action: 'whatsapp_flow.create',
          targetType: 'whatsapp_flow',
          targetId: flow.id,
          metadata: { tenantId, name: flow.name, flowIdMeta: flow.flowIdMeta },
        });

        res.status(201).json({ flow });
      } catch (err) {
        logger.error({ err, tenantId }, 'POST /tenants/:id/whatsapp-flows failed');
        res.status(500).json({ error: errMsg(err) || 'Error creando WhatsApp Flow' });
      }
    },
  );

  // --------------------------------------------------------------------------
  // PUT /api/admin/tenants/:id/whatsapp-flows/:flowId
  // Actualiza campos de un flow (PATCH semántico: solo los campos enviados).
  // --------------------------------------------------------------------------
  router.put(
    '/tenants/:id/whatsapp-flows/:flowId',
    requireTenantScope,
    async (req: Request, res: Response) => {
      const tenantId = String(req.params.id);
      const flowId = String(req.params.flowId);
      const c = ctx(req);

      const parsed = UpdateFlowSchema.safeParse(req.body);
      if (!parsed.success) {
        const first = parsed.error.issues[0];
        res.status(400).json({ error: `${first.path.join('.')}: ${first.message}` });
        return;
      }

      try {
        const updated = await whatsappFlowRepository.update(flowId, tenantId, parsed.data);
        if (!updated) {
          res.status(404).json({ error: 'WhatsApp Flow no encontrado' });
          return;
        }

        audit.log({
          ...c,
          action: 'whatsapp_flow.update',
          targetType: 'whatsapp_flow',
          targetId: flowId,
          metadata: { tenantId, changes: Object.keys(parsed.data) },
        });

        res.json({ flow: updated });
      } catch (err) {
        logger.error({ err, tenantId, flowId }, 'PUT /tenants/:id/whatsapp-flows/:flowId failed');
        res.status(500).json({ error: errMsg(err) || 'Error actualizando WhatsApp Flow' });
      }
    },
  );

  // --------------------------------------------------------------------------
  // DELETE /api/admin/tenants/:id/whatsapp-flows/:flowId
  // Elimina permanentemente un flow. Solo super_admin.
  // --------------------------------------------------------------------------
  router.delete(
    '/tenants/:id/whatsapp-flows/:flowId',
    requireRole('super_admin'),
    requireTenantScope,
    async (req: Request, res: Response) => {
      const tenantId = String(req.params.id);
      const flowId = String(req.params.flowId);
      const c = ctx(req);

      try {
        const deleted = await whatsappFlowRepository.delete(flowId, tenantId);
        if (!deleted) {
          res.status(404).json({ error: 'WhatsApp Flow no encontrado' });
          return;
        }

        audit.log({
          ...c,
          action: 'whatsapp_flow.delete',
          targetType: 'whatsapp_flow',
          targetId: flowId,
          metadata: { tenantId },
        });

        res.json({ ok: true });
      } catch (err) {
        logger.error({ err, tenantId, flowId }, 'DELETE /tenants/:id/whatsapp-flows/:flowId failed');
        res.status(500).json({ error: errMsg(err) || 'Error eliminando WhatsApp Flow' });
      }
    },
  );

  return router;
}
