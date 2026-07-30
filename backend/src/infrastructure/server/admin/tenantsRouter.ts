import { Router, Request, Response } from 'express';
import type pino from 'pino';
import { z } from 'zod';
import type { AssignMoldeUseCase } from '@/domain/use-cases/AssignMoldeUseCase';
import type { SetTenantStatusUseCase } from '@/domain/use-cases/SetTenantStatusUseCase';
import type { SimulateMessageUseCase } from '@/domain/use-cases/SimulateMessageUseCase';
import type { CreateTenantUseCase } from '@/domain/use-cases/CreateTenantUseCase';
import type { TenantRepository, TenantStatus } from '@/domain/ports/TenantRepository';
import type { TenantServiceRepository } from '@/domain/ports/TenantServiceRepository';
import type { BotFlowRepository } from '@/domain/ports/BotFlowRepository';
import type { MessagesRepository } from '@/domain/ports';
import type { AuditLogService } from '@/infrastructure/services/AuditLogService';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requireRole, requireTenantScope } from '@/infrastructure/auth/AuthMiddleware';
import { ctx, errMsg } from './helpers';

/**
 * Sub-router del CRUD base de tenants + endpoints transversales que cuelgan del
 * tenant (templates, molde, status, mensajes, audit-log, simulador).
 * Rutas: /api/admin/tenants[...], /api/admin/templates, /api/admin/audit-log,
 * /api/admin/simulate[...].
 */
export function createTenantsRouter(params: {
  assignMoldeUseCase: AssignMoldeUseCase;
  setTenantStatusUseCase: SetTenantStatusUseCase;
  simulateMessageUseCase: SimulateMessageUseCase;
  createTenantUseCase: CreateTenantUseCase;
  tenantRepository: TenantRepository;
  tenantServiceRepository: TenantServiceRepository;
  botFlowRepository: BotFlowRepository;
  messagesRepository: MessagesRepository;
  audit: AuditLogService;
  supabase: SupabaseClient;
  logger: pino.Logger;
}): Router {
  const {
    assignMoldeUseCase,
    setTenantStatusUseCase,
    simulateMessageUseCase,
    createTenantUseCase,
    tenantRepository,
    tenantServiceRepository,
    botFlowRepository,
    messagesRepository,
    audit,
    supabase,
    logger,
  } = params;
  const router = Router();

  // ============================================================
  // GET /api/admin/tenants
  // super_admin: lista completa. admin_operator: solo su tenant.
  // ============================================================
  router.get('/tenants', async (req: Request, res: Response) => {
    try {
      const tenants = await tenantRepository.findAll();
      if (req.admin?.role === 'admin_operator') {
        const scoped = tenants.filter((t) => t.id === req.admin?.tenantId);
        res.json({ tenants: scoped });
        return;
      }
      res.json({ tenants });
    } catch (err) {
      logger.error({ err }, 'GET /api/admin/tenants failed');
      res.status(500).json({ error: 'Error interno al listar tenants' });
    }
  });

  // ============================================================
  // GET /api/admin/tenants/:id
  // ============================================================
  router.get('/tenants/:id', requireTenantScope, async (req: Request, res: Response) => {
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
  // GET /api/admin/tenants/:id/detail
  // ============================================================
  router.get('/tenants/:id/detail', requireTenantScope, async (req: Request, res: Response) => {
    const id = String(req.params.id);
    try {
      const tenant = await tenantRepository.findFullDetail(id);
      if (!tenant) {
        res.status(404).json({ error: 'Tenant no encontrado' });
        return;
      }
      res.json({ tenant });
    } catch (err) {
      logger.error({ err, id }, 'GET /api/admin/tenants/:id/detail failed');
      res.status(500).json({ error: 'Error interno' });
    }
  });

  // ============================================================
  // POST /api/admin/tenants  (crear atómico — super_admin only)
  // ============================================================
  router.post('/tenants', requireRole('super_admin'), async (req: Request, res: Response) => {
    const c = ctx(req);
    try {
      const { id } = await createTenantUseCase.execute(req.body);
      audit.log({
        ...c,
        action: 'tenant.create',
        targetType: 'tenant',
        targetId: id,
        metadata: { nombre_negocio: req.body?.nombre_negocio, giro: req.body?.giro },
      });
      res.status(201).json({ id });
    } catch (err: unknown) {
      const msg = errMsg(err);
      logger.warn({ err: msg, body: req.body }, 'POST /api/admin/tenants failed');
      const safeToExpose =
        msg.startsWith('Validación:') || msg.includes('template') || msg.includes('no encontrado');
      res.status(400).json({
        error: safeToExpose ? msg : 'Error creando tenant. Revisa logs del servidor.',
      });
    }
  });

  // ============================================================
  // PATCH /api/admin/tenants/:id  (update parcial)
  // ============================================================
  const UpdateTenantSchema = z.object({
    nombre_negocio: z.string().min(2).max(120).optional(),
    giro: z
      .enum([
        'ferreteria',
        'papeleria',
        'cerrajeria',
        'pizzeria',
        'salon',
        'medico',
        'refaccionaria',
        'farmacia',
        'otro',
      ])
      .optional(),
    direccion: z.string().max(300).nullable().optional(),
    horario_semana: z.string().max(120).nullable().optional(),
    horario_sabado: z.string().max(120).nullable().optional(),
    abre_domingo: z.boolean().optional(),
    bot_configuration: z
      .object({
        numero_whatsapp_asignado: z.string().min(8).max(20).optional(),
        nombre_bot: z.string().max(60).optional(),
        tono_bot: z.enum(['formal', 'amigable', 'directo']).optional(),
        mensaje_bienvenida: z.string().max(1024).optional(),
        mensaje_menu_principal: z.string().max(1024).optional(),
        mensaje_fuera_horario: z.string().max(1024).optional(),
        mensaje_no_entendio: z.string().max(1024).optional(),
        mensaje_confirmacion_pedido: z.string().max(1024).optional(),
      })
      .optional(),
  });

  router.patch('/tenants/:id', requireTenantScope, async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const c = ctx(req);
    const parsed = UpdateTenantSchema.safeParse(req.body);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      res.status(400).json({ error: `${first.path.join('.')}: ${first.message}` });
      return;
    }
    try {
      await tenantRepository.update(id, parsed.data);
      audit.log({
        ...c,
        action: 'tenant.update',
        targetType: 'tenant',
        targetId: id,
        metadata: { keys: Object.keys(parsed.data) },
      });
      res.json({ ok: true });
    } catch (err: unknown) {
      logger.error({ err, id }, 'PATCH /api/admin/tenants/:id failed');
      res.status(500).json({ error: errMsg(err) || 'Error interno' });
    }
  });

  // ============================================================
  // DELETE /api/admin/tenants/:id  (soft-delete — super_admin only)
  // ============================================================
  router.delete('/tenants/:id', requireRole('super_admin'), async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const c = ctx(req);
    try {
      await tenantRepository.softDelete(id);
      audit.log({
        ...c,
        action: 'tenant.delete',
        targetType: 'tenant',
        targetId: id,
      });
      res.json({ ok: true });
    } catch (err: unknown) {
      logger.error({ err, id }, 'DELETE /api/admin/tenants/:id failed');
      res.status(500).json({ error: errMsg(err) || 'Error interno' });
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
  // ============================================================
  router.post('/tenants/:id/molde', requireTenantScope, async (req: Request, res: Response) => {
    const tenantId = String(req.params.id);
    const { templateSlug } = req.body ?? {};
    const c = ctx(req);

    if (!templateSlug || typeof templateSlug !== 'string') {
      res.status(400).json({ error: 'templateSlug requerido (string)' });
      return;
    }

    try {
      await assignMoldeUseCase.execute({ tenantId, templateSlug });
      audit.log({
        ...c,
        action: 'flow.assign_molde',
        targetType: 'tenant',
        targetId: tenantId,
        metadata: { templateSlug },
      });
      res.json({ success: true, tenantId, templateSlug });
    } catch (err: unknown) {
      const msg = errMsg(err);
      logger.error({ err, tenantId, templateSlug }, 'POST /api/admin/tenants/:id/molde failed');
      const status = msg.includes('no existe') ? 404 : 400;
      res.status(status).json({ error: msg || 'Error asignando molde' });
    }
  });

  // ============================================================
  // DELETE /api/admin/tenants/:id/molde
  // ============================================================
  router.delete('/tenants/:id/molde', requireTenantScope, async (req: Request, res: Response) => {
    const tenantId = String(req.params.id);
    const c = ctx(req);

    try {
      await botFlowRepository.deactivateForTenant(tenantId);
      audit.log({
        ...c,
        action: 'flow.remove_molde',
        targetType: 'tenant',
        targetId: tenantId,
      });
      res.json({ success: true, tenantId });
    } catch (err: unknown) {
      logger.error({ err, tenantId }, 'DELETE /api/admin/tenants/:id/molde failed');
      res.status(500).json({ error: errMsg(err) || 'Error removiendo molde' });
    }
  });

  // ============================================================
  // PATCH /api/admin/tenants/:id/status
  // ============================================================
  router.patch('/tenants/:id/status', requireTenantScope, async (req: Request, res: Response) => {
    const tenantId = String(req.params.id);
    const { status } = req.body ?? {};
    const c = ctx(req);

    const VALID_STATUSES: TenantStatus[] = ['draft', 'sandbox', 'live', 'paused', 'archived'];
    if (!VALID_STATUSES.includes(status)) {
      res.status(400).json({
        error: `status inválido. Valores permitidos: ${VALID_STATUSES.join(', ')}`,
      });
      return;
    }

    try {
      await setTenantStatusUseCase.execute({ tenantId, status });
      // DEC-D: suspender/archivar el tenant cascada a sus servicios.
      // Activar (live/sandbox/draft) NO reactiva servicios (granular por servicio).
      if (status === 'paused' || status === 'archived') {
        const svcs = await tenantServiceRepository.listByTenant(tenantId);
        for (const svc of svcs) {
          if (status === 'archived' && svc.status !== 'archived') {
            await tenantServiceRepository.setStatus(
              tenantId,
              svc.serviceType,
              'archived',
            );
          } else if (status === 'paused' && svc.status === 'active') {
            await tenantServiceRepository.setStatus(
              tenantId,
              svc.serviceType,
              'paused',
            );
          }
        }
      }
      audit.log({
        ...c,
        action: 'tenant.status.change',
        targetType: 'tenant',
        targetId: tenantId,
        metadata: { status },
      });
      res.json({ success: true, tenantId, status });
    } catch (err: unknown) {
      logger.error({ err, tenantId, status }, 'PATCH /api/admin/tenants/:id/status failed');
      res.status(500).json({ error: errMsg(err) || 'Error actualizando status' });
    }
  });

  // ============================================================
  // GET /api/admin/tenants/:id/messages?limit=50
  // ============================================================
  router.get('/tenants/:id/messages', requireTenantScope, async (req: Request, res: Response) => {
    const tenantId = String(req.params.id);
    const limit = parseInt(String(req.query.limit ?? '50'), 10) || 50;
    try {
      const messages = await messagesRepository.tailByTenant(tenantId, limit);
      res.json({ messages });
    } catch (err: unknown) {
      logger.error({ err, tenantId, limit }, 'GET /tenants/:id/messages failed');
      res.status(500).json({ error: errMsg(err) || 'Error interno' });
    }
  });

  // ============================================================
  // GET /api/admin/audit-log?limit=N&action=...&targetId=...
  // super_admin only. Lectura del audit append-only.
  // ============================================================
  router.get('/audit-log', requireRole('super_admin'), async (req: Request, res: Response) => {
    const limit = Math.min(parseInt(String(req.query.limit ?? '100'), 10) || 100, 500);
    const action = typeof req.query.action === 'string' ? req.query.action : null;
    const targetId = typeof req.query.targetId === 'string' ? req.query.targetId : null;

    try {
      let q = supabase
        .from('admin_audit_log')
        .select('id, admin_id, admin_email, action, target_type, target_id, ip, user_agent, metadata, created_at')
        .order('id', { ascending: false })
        .limit(limit);
      if (action) q = q.eq('action', action);
      if (targetId) q = q.eq('target_id', targetId);

      const { data, error } = await q;
      if (error) {
        logger.error({ err: error }, 'GET /api/admin/audit-log failed');
        res.status(500).json({ error: 'Error consultando audit log' });
        return;
      }
      res.json({ events: data ?? [] });
    } catch (err) {
      logger.error({ err }, 'GET /api/admin/audit-log failed');
      res.status(500).json({ error: 'Error interno' });
    }
  });

  // ============================================================
  // POST /api/admin/simulate
  // ============================================================
  router.post('/simulate', async (req: Request, res: Response) => {
    const { tenantId, phoneNumber, content, persist, source, flowId, versionId, state } = req.body ?? {};

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
    // Bloque A1: selección de fuente del flow (opcional, default 'active').
    if (source !== undefined && !['active', 'draft', 'version'].includes(source)) {
      res.status(400).json({ error: "source debe ser 'active' | 'draft' | 'version'" });
      return;
    }
    if (source === 'draft' && (typeof flowId !== 'string' || flowId.trim() === '')) {
      res.status(400).json({ error: "source='draft' requiere flowId (string)" });
      return;
    }
    if (source === 'version' && (typeof versionId !== 'string' || versionId.trim() === '')) {
      res.status(400).json({ error: "source='version' requiere versionId (string)" });
      return;
    }
    // Estado encadenado del turno anterior (modo efímero). Opcional y, de venir,
    // debe ser un objeto plano; `currentNodeId`/`context` se validan por forma.
    if (state !== undefined && (typeof state !== 'object' || state === null || Array.isArray(state))) {
      res.status(400).json({ error: 'state debe ser un objeto { currentNodeId?, context? }' });
      return;
    }

    try {
      const result = await simulateMessageUseCase.execute({
        tenantId,
        phoneNumber,
        content,
        persist: persist === true,
        source,
        flowId,
        versionId,
        state: state as { currentNodeId?: string; context?: Record<string, unknown> } | undefined,
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
