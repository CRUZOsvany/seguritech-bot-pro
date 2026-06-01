import { Router, Request, Response } from 'express';
import type pino from 'pino';
import { z } from 'zod';
import type { MetaCredentialsRepository } from '@/domain/ports';
import type { AuditLogService } from '@/infrastructure/services/AuditLogService';
import { requireCookieSession, requireRole } from '@/infrastructure/auth/AuthMiddleware';
import { ctx, errMsg } from './helpers';

/**
 * Sub-router de credenciales Meta por tenant. Exige sesión cookie + super_admin:
 * no se permite rotar tokens vía API key ni Cloudflare Access.
 * Rutas: /api/admin/tenants/:id/meta-credentials.
 */
export function createMetaRouter(params: {
  /** Opcional: solo presente cuando META_TOKEN_ENCRYPTION_KEY está configurada. */
  metaCredentialsRepository?: MetaCredentialsRepository;
  audit: AuditLogService;
  logger: pino.Logger;
}): Router {
  const { metaCredentialsRepository, audit, logger } = params;
  const router = Router();

  const UpsertMetaCredsSchema = z.object({
    phoneNumberId: z.string().min(5).max(40),
    wabaId: z.string().min(5).max(40),
    displayPhoneNumber: z.string().min(5).max(20),
    accessToken: z.string().min(20).max(500),
  });

  // POST /api/admin/tenants/:id/meta-credentials  (upsert)
  router.post(
    '/tenants/:id/meta-credentials',
    requireRole('super_admin'),
    requireCookieSession,
    async (req: Request, res: Response) => {
      if (!metaCredentialsRepository) {
        res.status(503).json({
          error:
            'Credenciales Meta no disponibles: configura META_TOKEN_ENCRYPTION_KEY para habilitar el cifrado de tokens.',
        });
        return;
      }
      const tenantId = String(req.params.id);
      const c = ctx(req);
      const parsed = UpsertMetaCredsSchema.safeParse(req.body);
      if (!parsed.success) {
        const first = parsed.error.issues[0];
        res.status(400).json({ error: `${first.path.join('.')}: ${first.message}` });
        return;
      }
      try {
        await metaCredentialsRepository.upsert({ tenantId, ...parsed.data });
        audit.log({
          ...c,
          action: 'meta.rotate',
          targetType: 'meta_credentials',
          targetId: tenantId,
          metadata: {
            phoneNumberId: parsed.data.phoneNumberId,
            displayPhoneNumber: parsed.data.displayPhoneNumber,
            // NUNCA logueamos accessToken
          },
        });
        res.json({ ok: true, rotatedAt: new Date().toISOString() });
      } catch (err: unknown) {
        logger.error({ err, tenantId }, 'POST /tenants/:id/meta-credentials failed');
        res.status(500).json({ error: errMsg(err) || 'Error interno' });
      }
    },
  );

  // DELETE /api/admin/tenants/:id/meta-credentials  (revocar)
  router.delete(
    '/tenants/:id/meta-credentials',
    requireRole('super_admin'),
    requireCookieSession,
    async (req: Request, res: Response) => {
      if (!metaCredentialsRepository) {
        res.status(503).json({
          error: 'Credenciales Meta no disponibles: configura META_TOKEN_ENCRYPTION_KEY.',
        });
        return;
      }
      const tenantId = String(req.params.id);
      const c = ctx(req);
      try {
        await metaCredentialsRepository.revoke(tenantId);
        audit.log({
          ...c,
          action: 'meta.revoke',
          targetType: 'meta_credentials',
          targetId: tenantId,
        });
        res.json({ ok: true });
      } catch (err: unknown) {
        logger.error({ err, tenantId }, 'DELETE /tenants/:id/meta-credentials failed');
        res.status(500).json({ error: errMsg(err) || 'Error interno' });
      }
    },
  );

  return router;
}
