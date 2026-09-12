import { Router, Request, Response } from 'express';
import type pino from 'pino';
import { z } from 'zod';
import type { BotFlowRepository } from '@/domain/ports/BotFlowRepository';
import type { BotFlow } from '@/domain/entities/flow';
import type { SimulateConversationUseCase } from '@/domain/use-cases/SimulateConversationUseCase';
import { validateFlow, FlowValidationError } from '@/domain/validators/flowSchema';
import { requireTenantScope } from '@/infrastructure/auth/AuthMiddleware';
import { SimEventSchema, eventToStep, toApiTurn } from './studioSimulation';
import { errMsg } from './helpers';
import { validateFlowDesign } from '@/domain/validation/flowDesignValidator';
import { WHATSAPP_LIMITS, WHATSAPP_LIMITS_VERIFIED_AT } from '@/domain/whatsapp/limits';

/** Mismo teléfono de prueba que el simulador del panel. */
const DEFAULT_SIM_PHONE = '5210000000000';

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
 * Endpoints del Studio: simulación (Fase 1), validación y límites (Fase 2). Rutas bajo
 * /api/admin/tenants/:id/studio/... (decisión D-3): heredan requireTenantScope,
 * así que un admin_operator solo simula flows de su propio tenant.
 *
 * La simulación no muta nada (sin escritura en BD, sin Meta, sin avisos), así
 * que no pasa por el audit log — mismo criterio que POST /simulate sin persist.
 */
export function createStudioRouter(params: {
  botFlowRepository: BotFlowRepository;
  simulateConversation: SimulateConversationUseCase;
  logger: pino.Logger;
}): Router {
  const { botFlowRepository, simulateConversation, logger } = params;
  const router = Router();

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

  return router;
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
