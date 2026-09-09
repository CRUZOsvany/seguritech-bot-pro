import { Router, Request, Response } from 'express';
import type pino from 'pino';
import { assemble, expandBlock, BlockExpansionError } from '@/domain/blocks/expandBlock';
import type { BlockSpec, BlockWiring } from '@/domain/blocks/expandBlock';
import { FlowValidationError } from '@/domain/validators/flowSchema';
import { checkGraphRules } from '@/domain/validators/graphRules';
import { requireTenantScope } from '@/infrastructure/auth/AuthMiddleware';
import { errMsg } from './helpers';

/**
 * Bloques compuestos (F1-a). Rutas: /api/admin/tenants/:id/blocks[...].
 *
 * El generador vive en el backend a propósito. Podría haber vivido en el
 * designer, pero el espejo `flow-types.ts` del frontend se mantiene a mano
 * (DEC-3) y ya está desincronizado del contrato real — le faltan tres tipos de
 * condición. Generar los subgrafos ahí los haría heredar esa divergencia; aquí
 * se validan contra el Zod de verdad antes de salir.
 *
 * NO persiste nada: devuelve el grafo para que el Designer lo cargue en el
 * canvas. Guardar sigue siendo `PUT .../draft`, y publicar sigue siendo
 * `POST .../publish`. Un endpoint que generara Y publicara se saltaría la
 * revisión humana que es justo el punto del paso 6 de la entrevista.
 */
export function createBlocksRouter(params: { logger: pino.Logger }): Router {
  const { logger } = params;
  const router = Router();

  // POST /api/admin/tenants/:id/blocks/expand — un bloque → su subgrafo.
  // Para previsualizar en el canvas mientras el operador rellena el bloque.
  router.post(
    '/tenants/:id/blocks/expand',
    requireTenantScope,
    (req: Request, res: Response) => {
      const spec = req.body?.block as BlockSpec | undefined;
      if (!spec || typeof spec !== 'object') {
        res.status(400).json({ error: 'Body debe incluir `block` (objeto)' });
        return;
      }

      try {
        res.json({ expansion: expandBlock(spec) });
      } catch (err) {
        if (err instanceof BlockExpansionError) {
          // 400, no 500: es un problema de lo que pidió el operador, y el
          // mensaje ya está redactado para que lo lea una persona.
          res.status(400).json({ error: err.message, blockId: err.blockId });
          return;
        }
        logger.error({ err }, 'POST blocks/expand failed');
        res.status(500).json({ error: errMsg(err) });
      }
    },
  );

  // POST /api/admin/tenants/:id/blocks/assemble — bloques + cableado → BotFlow.
  router.post(
    '/tenants/:id/blocks/assemble',
    requireTenantScope,
    (req: Request, res: Response) => {
      const blocks = req.body?.blocks as BlockSpec[] | undefined;
      const wiring = req.body?.wiring as BlockWiring[] | undefined;
      const startBlockId = req.body?.startBlockId as string | undefined;

      if (!Array.isArray(blocks) || !Array.isArray(wiring) || !startBlockId) {
        res.status(400).json({
          error: 'Body debe incluir `blocks` (array), `wiring` (array) y `startBlockId` (string)',
        });
        return;
      }

      try {
        const flow = assemble({ blocks, wiring, startBlockId });
        // Los warnings viajan con el flow: no bloquean, pero el operador debe
        // verlos (nodos huérfanos, ciclos, condiciones duplicadas).
        const warnings = checkGraphRules(flow).filter((i) => i.severity === 'warning');
        res.json({ flow, warnings });
      } catch (err) {
        if (err instanceof BlockExpansionError) {
          res.status(400).json({ error: err.message, blockId: err.blockId });
          return;
        }
        if (err instanceof FlowValidationError) {
          res.status(400).json({ error: err.message, issues: err.issues });
          return;
        }
        logger.error({ err }, 'POST blocks/assemble failed');
        res.status(500).json({ error: errMsg(err) });
      }
    },
  );

  return router;
}
