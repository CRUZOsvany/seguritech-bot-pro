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

/** Mismo teléfono de prueba que el simulador del panel. */
const DEFAULT_SIM_PHONE = '5210000000000';

const SimulateBodySchema = z.object({
  events: z.array(SimEventSchema).min(1).max(100),
  /**
   * 'draft': lo que se está editando (el borrador, o una copia de lo publicado
   * si no hay borrador), igual que el Designer. 'active': lo que el bot real
   * contesta hoy — solo si este flow es el activo del tenant.
   */
  source: z.enum(['draft', 'active']).default('draft'),
  /** Hora de arranque del reloj simulado (ISO 8601 con zona). Default: ahora. */
  startAt: z.string().datetime({ offset: true }).optional(),
  /** Teléfono del cliente simulado. Si es el del dueño, aplican sus reglas. */
  from: z.string().regex(/^\d{8,15}$/).optional(),
});

/**
 * Endpoints del Studio (Fase 1: simulación). Rutas bajo
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

      try {
        const resolved = await resolveFlow(botFlowRepository, tenantId, flowId, body.source);
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

  return router;
}

type Resolved =
  | { ok: true; flow: BotFlow }
  | { ok: false; status: number; body: Record<string, unknown> };

async function resolveFlow(
  repo: BotFlowRepository,
  tenantId: string,
  flowId: string,
  source: 'draft' | 'active',
): Promise<Resolved> {
  if (source === 'draft') {
    const editable = await repo.getEditableFlow(flowId, tenantId);
    if (!editable) return { ok: false, status: 404, body: { error: 'Flow no encontrado' } };
    try {
      return { ok: true, flow: validateFlow(editable.flow) };
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
