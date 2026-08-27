import { Router, Request, Response } from 'express';
import type pino from 'pino';
import { z } from 'zod';
import type { ServiceDirectoryRepository, TenantConfigPort } from '@/domain/ports';
import type { AuditLogService } from '@/infrastructure/services/AuditLogService';
import { requireRole, requireTenantScope } from '@/infrastructure/auth/AuthMiddleware';
import { ctx } from './helpers';

/**
 * Sub-router CRUD del directorio de servicios de un tenant (Capa 2 de la
 * arquitectura híbrida sin IA — ver `.claude/PLAN_V1_BOT_FLOWS_SIN_IA.md`).
 *
 * Rutas bajo /api/admin/tenants/:id/service-directory[...]. El operador
 * carga/edita entradas desde el panel sin tocar código ni el JSON del
 * bot_flow — el flow solo referencia la condición `service_directory_match`.
 *
 * requireTenantScope: admin_operator solo ve/edita su tenant; super_admin
 * ve todos. DELETE requiere super_admin adicionalmente (mismo criterio que
 * whatsappFlowsRouter: borrado permanente de datos operativos).
 *
 * Nota: el matcher (`ServiceDirectoryMatcher`) usa `activo`/`orden` en
 * runtime; este router no filtra por `activo` en el GET de listado — el
 * panel necesita ver también las entradas desactivadas para poder
 * reactivarlas.
 */

// ============================================================================
// SCHEMAS ZOD
// ============================================================================

const CreateEntrySchema = z.object({
  nombre: z.string().min(1, 'nombre requerido').max(200, 'nombre ≤ 200 chars'),
  keywords: z
    .array(z.string().min(1, 'keyword vacía no permitida'))
    .min(1, 'al menos una keyword'),
  respuesta: z.string().min(1, 'respuesta requerida').max(4096, 'respuesta ≤ 4096 chars'),
  precio: z.number().nonnegative().nullable().optional(),
  activo: z.boolean().optional(),
  orden: z.number().int().optional(),
});

const UpdateEntrySchema = z.object({
  nombre: z.string().min(1).max(200).optional(),
  keywords: z.array(z.string().min(1)).min(1).optional(),
  respuesta: z.string().min(1).max(4096).optional(),
  // Nota: a diferencia de flowIdMeta en whatsappFlowsRouter, precio no acepta
  // `null` aquí — el port (ServiceDirectoryRepository.update) tipa precio
  // como `number | undefined`, sin soporte para "limpiar a null" explícito.
  // Si se necesita, extender el port primero.
  precio: z.number().nonnegative().optional(),
  activo: z.boolean().optional(),
  orden: z.number().int().optional(),
});

// ============================================================================
// FACTORY
// ============================================================================

export function createServiceDirectoryRouter(params: {
  serviceDirectoryRepository: ServiceDirectoryRepository;
  /**
   * D-01 (auditoría 2026-08-26): serviceDirectory es parte del TenantConfig
   * cacheado (TTL 5 min). Sin invalidar tras cada mutación, una entrada
   * nueva/editada/borrada desde el panel tardaba hasta 5 min en reflejarse
   * en lo que el bot realmente contesta.
   */
  tenantConfigPort?: TenantConfigPort;
  audit: AuditLogService;
  logger: pino.Logger;
}): Router {
  const { serviceDirectoryRepository, tenantConfigPort, audit, logger } = params;
  const router = Router();

  // --------------------------------------------------------------------------
  // GET /api/admin/tenants/:id/service-directory
  // Lista todas las entradas del tenant (activas e inactivas).
  // --------------------------------------------------------------------------
  router.get(
    '/tenants/:id/service-directory',
    requireTenantScope,
    async (req: Request, res: Response) => {
      const tenantId = String(req.params.id);
      try {
        const entries = await serviceDirectoryRepository.listByTenant(tenantId);
        res.json({ entries });
      } catch (err) {
        logger.error({ err, tenantId }, 'GET /tenants/:id/service-directory failed');
        res.status(500).json({ error: 'Error listando directorio de servicios' });
      }
    },
  );

  // --------------------------------------------------------------------------
  // POST /api/admin/tenants/:id/service-directory
  // Crea una nueva entrada del directorio.
  // --------------------------------------------------------------------------
  router.post(
    '/tenants/:id/service-directory',
    requireTenantScope,
    async (req: Request, res: Response) => {
      const tenantId = String(req.params.id);
      const c = ctx(req);

      const parsed = CreateEntrySchema.safeParse(req.body);
      if (!parsed.success) {
        const first = parsed.error.issues[0];
        res.status(400).json({ error: `${first.path.join('.')}: ${first.message}` });
        return;
      }

      try {
        const entry = await serviceDirectoryRepository.create(tenantId, {
          nombre: parsed.data.nombre,
          keywords: parsed.data.keywords,
          respuesta: parsed.data.respuesta,
          precio: parsed.data.precio ?? undefined,
          activo: parsed.data.activo ?? true,
          orden: parsed.data.orden ?? 0,
        });

        tenantConfigPort?.invalidate(tenantId);

        audit.log({
          ...c,
          action: 'service_directory.create',
          targetType: 'service_directory_entry',
          targetId: entry.id,
          metadata: { tenantId, nombre: entry.nombre },
        });

        res.status(201).json({ entry });
      } catch (err) {
        logger.error({ err, tenantId }, 'POST /tenants/:id/service-directory failed');
        res.status(500).json({ error: 'Error creando entrada del directorio' });
      }
    },
  );

  // --------------------------------------------------------------------------
  // PUT /api/admin/tenants/:id/service-directory/:entryId
  // Actualiza campos de una entrada (solo los campos enviados).
  // --------------------------------------------------------------------------
  router.put(
    '/tenants/:id/service-directory/:entryId',
    requireTenantScope,
    async (req: Request, res: Response) => {
      const tenantId = String(req.params.id);
      const entryId = String(req.params.entryId);
      const c = ctx(req);

      const parsed = UpdateEntrySchema.safeParse(req.body);
      if (!parsed.success) {
        const first = parsed.error.issues[0];
        res.status(400).json({ error: `${first.path.join('.')}: ${first.message}` });
        return;
      }

      try {
        const updated = await serviceDirectoryRepository.update(tenantId, entryId, parsed.data);

        tenantConfigPort?.invalidate(tenantId);

        audit.log({
          ...c,
          action: 'service_directory.update',
          targetType: 'service_directory_entry',
          targetId: entryId,
          metadata: { tenantId, changes: Object.keys(parsed.data) },
        });

        res.json({ entry: updated });
      } catch (err) {
        logger.error(
          { err, tenantId, entryId },
          'PUT /tenants/:id/service-directory/:entryId failed',
        );
        res.status(500).json({ error: 'Error actualizando entrada del directorio' });
      }
    },
  );

  // --------------------------------------------------------------------------
  // DELETE /api/admin/tenants/:id/service-directory/:entryId
  // Elimina permanentemente una entrada. Solo super_admin.
  // --------------------------------------------------------------------------
  router.delete(
    '/tenants/:id/service-directory/:entryId',
    requireRole('super_admin'),
    requireTenantScope,
    async (req: Request, res: Response) => {
      const tenantId = String(req.params.id);
      const entryId = String(req.params.entryId);
      const c = ctx(req);

      try {
        await serviceDirectoryRepository.delete(tenantId, entryId);

        tenantConfigPort?.invalidate(tenantId);

        audit.log({
          ...c,
          action: 'service_directory.delete',
          targetType: 'service_directory_entry',
          targetId: entryId,
          metadata: { tenantId },
        });

        res.json({ ok: true });
      } catch (err) {
        logger.error(
          { err, tenantId, entryId },
          'DELETE /tenants/:id/service-directory/:entryId failed',
        );
        res.status(500).json({ error: 'Error eliminando entrada del directorio' });
      }
    },
  );

  return router;
}
