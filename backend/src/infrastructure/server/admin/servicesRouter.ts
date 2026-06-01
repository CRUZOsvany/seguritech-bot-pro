import { Router, Request, Response } from 'express';
import type pino from 'pino';
import type { TenantServiceRepository } from '@/domain/ports/TenantServiceRepository';
import {
  assertServiceTransition,
  ServiceTransitionError,
} from '@/domain/services/serviceFsm';
import type { AuditLogService } from '@/infrastructure/services/AuditLogService';
import { requireTenantScope } from '@/infrastructure/auth/AuthMiddleware';
import { ctx } from './helpers';

/**
 * Sub-router de servicios del tenant (FASE 1). `tenant_services` es la única
 * fuente de verdad del servicio habilitado. Rutas: /api/admin/tenants/:id/services[...].
 */
export function createServicesRouter(params: {
  tenantServiceRepository: TenantServiceRepository;
  audit: AuditLogService;
  logger: pino.Logger;
}): Router {
  const { tenantServiceRepository, audit, logger } = params;
  const router = Router();

  // GET /api/admin/tenants/:id/services — lista servicios del tenant
  router.get(
    '/tenants/:id/services',
    requireTenantScope,
    async (req: Request, res: Response) => {
      const tenantId = String(req.params.id);
      try {
        const services = await tenantServiceRepository.listByTenant(tenantId);
        res.json({ services });
      } catch (err) {
        logger.error({ err, tenantId }, 'GET services failed');
        res.status(500).json({ error: 'Error al listar servicios' });
      }
    },
  );

  // POST /api/admin/tenants/:id/services — habilitar un servicio
  router.post(
    '/tenants/:id/services',
    requireTenantScope,
    async (req: Request, res: Response) => {
      const tenantId = String(req.params.id);
      const { serviceType } = req.body ?? {};
      const c = ctx(req);

      const VALID: string[] = ['whatsapp_bot', 'messenger_bot', 'pos'];
      if (!serviceType || !VALID.includes(serviceType)) {
        res.status(400).json({
          error: `serviceType inválido. Permitidos: ${VALID.join(', ')}`,
        });
        return;
      }

      try {
        const service = await tenantServiceRepository.enable(tenantId, serviceType);
        audit.log({
          ...c,
          action: 'service.enable',
          targetType: 'tenant',
          targetId: tenantId,
          metadata: { serviceType },
        });
        res.status(201).json({ service });
      } catch (err) {
        logger.error({ err, tenantId, serviceType }, 'POST service failed');
        res.status(500).json({ error: 'Error al habilitar servicio' });
      }
    },
  );

  // PATCH /api/admin/tenants/:id/services/:serviceType — cambiar status
  router.patch(
    '/tenants/:id/services/:serviceType',
    requireTenantScope,
    async (req: Request, res: Response) => {
      const tenantId = String(req.params.id);
      const serviceType = String(req.params.serviceType);
      const { status } = req.body ?? {};
      const c = ctx(req);

      const VALID_SERVICES: string[] = ['whatsapp_bot', 'messenger_bot', 'pos'];
      const VALID_STATUSES: string[] = [
        'draft',
        'configuring',
        'active',
        'paused',
        'archived',
      ];
      if (!VALID_SERVICES.includes(serviceType)) {
        res.status(400).json({ error: 'serviceType inválido' });
        return;
      }
      if (!status || !VALID_STATUSES.includes(status)) {
        res.status(400).json({
          error: `status inválido. Permitidos: ${VALID_STATUSES.join(', ')}`,
        });
        return;
      }

      try {
        const current = await tenantServiceRepository.findServiceStatus(
          tenantId,
          serviceType as 'whatsapp_bot' | 'messenger_bot' | 'pos',
        );
        if (current === null) {
          res.status(404).json({
            error: 'El servicio no existe para este tenant. Habilítalo primero.',
          });
          return;
        }
        assertServiceTransition(
          current,
          status as 'draft' | 'configuring' | 'active' | 'paused' | 'archived',
        );

        await tenantServiceRepository.setStatus(
          tenantId,
          serviceType as 'whatsapp_bot' | 'messenger_bot' | 'pos',
          status as 'draft' | 'configuring' | 'active' | 'paused' | 'archived',
        );
        audit.log({
          ...c,
          action: 'service.set_status',
          targetType: 'tenant',
          targetId: tenantId,
          metadata: { serviceType, status, from: current },
        });
        res.json({ ok: true });
      } catch (err) {
        if (err instanceof ServiceTransitionError) {
          res.status(409).json({ error: err.message, code: err.code });
          return;
        }
        logger.error({ err, tenantId, serviceType, status }, 'PATCH service failed');
        res.status(500).json({ error: 'Error al cambiar status del servicio' });
      }
    },
  );

  return router;
}
