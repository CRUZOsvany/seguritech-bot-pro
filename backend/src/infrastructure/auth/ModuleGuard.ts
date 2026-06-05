import { Request, Response, NextFunction } from 'express';
import type pino from 'pino';
import type { TenantRepository } from '@/domain/ports/TenantRepository';

/**
 * Middleware que valida que el módulo está habilitado para el tenant del
 * request (Sprint 5.1a).
 *
 * Strict: NO bypass para super_admin. Razón: un super_admin sin el servicio
 * 'pos' en estado 'active' en tenant_services no debería poder operar el POS.
 * Si lo necesita para debug, debe activar el servicio del tenant explícitamente.
 *
 * Lee tenantId de req.posUser (preferente) o req.admin. Si ambos faltan
 * o el tenantId es null (super_admin sin tenant) → 403.
 *
 * Uso típico (ej. PosRouter):
 *   router.use(requirePosSession, createRequireModule(tenants, 'pos'))
 */
export function createRequireModule(
  tenantRepository: TenantRepository,
  module: 'pos' | 'bot',
  logger?: pino.Logger,
) {
  return async function requireModule(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    const tenantId = req.posUser?.tenantId ?? req.admin?.tenantId ?? null;
    if (!tenantId) {
      res.status(403).json({
        error: `Módulo '${module}' requiere tenant_id en la sesión`,
      });
      return;
    }

    try {
      const enabled = await tenantRepository.isModuleEnabled(tenantId, module);
      if (!enabled) {
        res.status(403).json({
          error: `Módulo '${module}' no habilitado para este tenant`,
        });
        return;
      }
      next();
    } catch (err: unknown) {
      logger?.error({ err, tenantId, module }, 'requireModule check failed');
      res.status(500).json({ error: 'Error validando módulo del tenant' });
    }
  };
}
