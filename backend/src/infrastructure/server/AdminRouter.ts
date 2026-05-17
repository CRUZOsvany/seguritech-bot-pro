import { Router, Request, Response, NextFunction } from 'express';
import type pino from 'pino';
import { config } from '@/config/env';
import type { AssignMoldeUseCase } from '@/domain/use-cases/AssignMoldeUseCase';
import type { SetTenantStatusUseCase } from '@/domain/use-cases/SetTenantStatusUseCase';
import type { SimulateMessageUseCase } from '@/domain/use-cases/SimulateMessageUseCase';
import type { TenantRepository } from '@/domain/ports/TenantRepository';
import type { BotFlowRepository } from '@/domain/ports/BotFlowRepository';

/**
 * Router de API admin interna del panel SegurITech.
 *
 * Todas las rutas requieren el header x-api-key con BACKEND_API_KEY.
 * Si BACKEND_API_KEY no está configurado, todas las rutas responden 503.
 *
 * Rutas:
 *   GET    /api/admin/tenants              → lista todos los tenants con estado
 *   GET    /api/admin/tenants/:id          → un tenant específico
 *   GET    /api/admin/templates            → lista flow_templates disponibles
 *   POST   /api/admin/tenants/:id/molde   → {templateSlug} — asigna molde
 *   DELETE /api/admin/tenants/:id/molde   → desactiva flow activo
 *   PATCH  /api/admin/tenants/:id/status  → {status: 'active'|'paused'}
 */

function requireApiKey(req: Request, res: Response, next: NextFunction): void {
  const apiKey = config.admin.apiKey;

  if (!apiKey) {
    res.status(503).json({
      error: 'API Admin no configurada. Define BACKEND_API_KEY en las variables de entorno.',
    });
    return;
  }

  if (req.headers['x-api-key'] !== apiKey) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  next();
}

export function createAdminRouter(params: {
  assignMoldeUseCase: AssignMoldeUseCase;
  setTenantStatusUseCase: SetTenantStatusUseCase;
  simulateMessageUseCase: SimulateMessageUseCase;
  tenantRepository: TenantRepository;
  botFlowRepository: BotFlowRepository;
  logger: pino.Logger;
}): Router {
  const {
    assignMoldeUseCase,
    setTenantStatusUseCase,
    simulateMessageUseCase,
    tenantRepository,
    botFlowRepository,
    logger,
  } = params;
  const router = Router();

  router.use(requireApiKey);

  // ============================================================
  // GET /api/admin/tenants
  // ============================================================
  router.get('/tenants', async (_req: Request, res: Response) => {
    try {
      const tenants = await tenantRepository.findAll();
      res.json({ tenants });
    } catch (err) {
      logger.error({ err }, 'GET /api/admin/tenants failed');
      res.status(500).json({ error: 'Error interno al listar tenants' });
    }
  });

  // ============================================================
  // GET /api/admin/tenants/:id
  // ============================================================
  router.get('/tenants/:id', async (req: Request, res: Response) => {
    const id = String(req.params.id);
    try {
      const tenant = await tenantRepository.findById(id);
      if (!tenant) {
        res.status(404).json({ error: 'Tenant no encontrado' });
        return;
      }
      res.json({ tenant });
    } catch (err) {
      logger.error({ err, id }, 'GET /api/admin/tenants/:id failed');
      res.status(500).json({ error: 'Error interno' });
    }
  });

  // ============================================================
  // GET /api/admin/templates
  // ============================================================
  router.get('/templates', async (_req: Request, res: Response) => {
    try {
      const templates = await botFlowRepository.listTemplates();
      res.json({ templates });
    } catch (err) {
      logger.error({ err }, 'GET /api/admin/templates failed');
      res.status(500).json({ error: 'Error al listar templates' });
    }
  });

  // ============================================================
  // POST /api/admin/tenants/:id/molde
  // Body: { templateSlug: string }
  // ============================================================
  router.post('/tenants/:id/molde', async (req: Request, res: Response) => {
    const tenantId = String(req.params.id);
    const { templateSlug } = req.body ?? {};

    if (!templateSlug || typeof templateSlug !== 'string') {
      res.status(400).json({ error: 'templateSlug requerido (string)' });
      return;
    }

    try {
      await assignMoldeUseCase.execute({ tenantId, templateSlug });
      res.json({ success: true, tenantId, templateSlug });
    } catch (err: any) {
      logger.error({ err, tenantId, templateSlug }, 'POST /api/admin/tenants/:id/molde failed');
      const status = err.message?.includes('no existe') ? 404 : 400;
      res.status(status).json({ error: err.message ?? 'Error asignando molde' });
    }
  });

  // ============================================================
  // DELETE /api/admin/tenants/:id/molde
  // ============================================================
  router.delete('/tenants/:id/molde', async (req: Request, res: Response) => {
    const tenantId = String(req.params.id);

    try {
      await botFlowRepository.deactivateForTenant(tenantId);
      res.json({ success: true, tenantId });
    } catch (err: any) {
      logger.error({ err, tenantId }, 'DELETE /api/admin/tenants/:id/molde failed');
      res.status(500).json({ error: err.message ?? 'Error removiendo molde' });
    }
  });

  // ============================================================
  // PATCH /api/admin/tenants/:id/status
  // Body: { status: 'active' | 'paused' }
  // ============================================================
  router.patch('/tenants/:id/status', async (req: Request, res: Response) => {
    const tenantId = String(req.params.id);
    const { status } = req.body ?? {};

    if (!['active', 'paused'].includes(status)) {
      res.status(400).json({ error: 'status debe ser "active" o "paused"' });
      return;
    }

    try {
      await setTenantStatusUseCase.execute({ tenantId, status });
      res.json({ success: true, tenantId, status });
    } catch (err: any) {
      logger.error({ err, tenantId, status }, 'PATCH /api/admin/tenants/:id/status failed');
      res.status(500).json({ error: err.message ?? 'Error actualizando status' });
    }
  });

  // ============================================================
  // POST /api/admin/simulate
  // Body: { tenantId, phoneNumber, content, persist?: boolean }
  // ============================================================
  router.post('/simulate', async (req: Request, res: Response) => {
    const { tenantId, phoneNumber, content, persist } = req.body ?? {};

    if (typeof tenantId !== 'string' || tenantId.trim() === '') {
      res.status(400).json({ error: 'tenantId requerido (string)' });
      return;
    }
    if (typeof phoneNumber !== 'string' || phoneNumber.trim() === '') {
      res.status(400).json({ error: 'phoneNumber requerido (string)' });
      return;
    }
    if (typeof content !== 'string' || content.trim() === '') {
      res.status(400).json({ error: 'content requerido (string)' });
      return;
    }

    try {
      const result = await simulateMessageUseCase.execute({
        tenantId,
        phoneNumber,
        content,
        persist: persist === true,
      });

      if (result.error) {
        res.status(404).json({ error: result.error });
        return;
      }

      res.json({
        outputs: result.outputs,
        nextNodeId: result.nextNodeId,
        context: result.context,
        flowEnded: result.flowEnded,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error en simulate';
      logger.error({ err, tenantId, phoneNumber }, 'POST /api/admin/simulate failed');
      res.status(500).json({ error: message });
    }
  });

  // ============================================================
  // POST /api/admin/simulate/reset
  // Body: { tenantId, phoneNumber }
  // ============================================================
  router.post('/simulate/reset', async (req: Request, res: Response) => {
    const { tenantId, phoneNumber } = req.body ?? {};

    if (typeof tenantId !== 'string' || typeof phoneNumber !== 'string') {
      res.status(400).json({ error: 'tenantId y phoneNumber requeridos' });
      return;
    }

    try {
      await simulateMessageUseCase.reset(tenantId, phoneNumber);
      res.json({ success: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error reseteando';
      logger.error({ err, tenantId, phoneNumber }, 'POST /api/admin/simulate/reset failed');
      res.status(500).json({ error: message });
    }
  });

  return router;
}
