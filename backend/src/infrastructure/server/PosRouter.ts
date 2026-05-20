import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import type pino from 'pino';
import type { PosProductRepository } from '@/domain/ports/pos/PosProductRepository';
import type { PosCategoryRepository } from '@/domain/ports/pos/PosCategoryRepository';
import type { PosTenantConfigRepository } from '@/domain/ports/pos/PosTenantConfigRepository';

type Mw = (req: Request, res: Response, next: NextFunction) => void | Promise<void>;

/**
 * Router del módulo POS (Sprint 5.1a). Endpoints de lectura del catálogo.
 *
 * Orden crítico: /health se monta ANTES de router.use(requirePosSession,
 * requireModule) para que sea público. Todo lo demás requiere cookie POS
 * válida + módulo 'pos' habilitado en el tenant.
 *
 * Mount point: /api/pos (definido en ExpressServer.setupPosRoutes).
 *
 * Endpoints:
 *   GET /health             — público; sirve readiness sin auth
 *   GET /products           — lista paginada del catálogo
 *   GET /products/lookup    — búsqueda por nombre/sku/barcode
 *   GET /products/:id       — detalle
 *   GET /categories         — lista de categorías
 *   GET /config             — config POS del tenant (mould, business_name, etc.)
 *
 * Tenant aislamiento: tenantId se lee de req.posUser.tenantId (no se acepta
 * vía header ni body — la cookie es la única fuente de verdad).
 */
export function createPosRouter(params: {
  requirePosSession: Mw;
  requireModule: Mw;
  posProducts: PosProductRepository;
  posCategories: PosCategoryRepository;
  posConfig: PosTenantConfigRepository;
  logger: pino.Logger;
}): Router {
  const { requirePosSession, requireModule, posProducts, posCategories, posConfig, logger } =
    params;
  const router = Router();

  // PÚBLICO — antes del middleware de auth.
  router.get('/health', (_req: Request, res: Response) => {
    res.json({ ok: true, module: 'pos', version: '0.1.0' });
  });

  // A partir de aquí, todo requiere sesión POS + módulo habilitado.
  router.use(requirePosSession, requireModule);

  // ----------------------------------------------------------------------
  // GET /api/pos/products
  // ----------------------------------------------------------------------
  router.get('/products', async (req: Request, res: Response) => {
    const tenantId = req.posUser!.tenantId;
    const limit = clampInt(req.query.limit, 100, 1, 500);
    const offset = clampInt(req.query.offset, 0, 0, 100_000);
    const categoryId = typeof req.query.categoryId === 'string' ? req.query.categoryId : undefined;

    try {
      const products = await posProducts.list(tenantId, { categoryId, limit, offset });
      res.json({ products, limit, offset });
    } catch (err) {
      logger.error({ err, tenantId }, 'GET /api/pos/products failed');
      res.status(500).json({ error: 'Error listando productos' });
    }
  });

  // ----------------------------------------------------------------------
  // GET /api/pos/products/lookup?q=...&barcode=...
  // Si viene barcode → match exacto. Si viene q → search ILIKE.
  // ----------------------------------------------------------------------
  const LookupSchema = z.object({
    q: z.string().min(1).max(100).optional(),
    barcode: z.string().min(1).max(100).optional(),
    limit: z.coerce.number().int().min(1).max(50).optional(),
  });

  router.get('/products/lookup', async (req: Request, res: Response) => {
    const parsed = LookupSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: 'q o barcode requerido (1-100 chars)' });
      return;
    }
    const { q, barcode, limit = 20 } = parsed.data;
    const tenantId = req.posUser!.tenantId;

    try {
      if (barcode) {
        const product = await posProducts.findByBarcode(tenantId, barcode);
        res.json({ products: product ? [product] : [] });
        return;
      }
      if (q) {
        const products = await posProducts.search(tenantId, q, limit);
        res.json({ products });
        return;
      }
      res.status(400).json({ error: 'q o barcode requerido' });
    } catch (err) {
      logger.error({ err, tenantId, q, barcode }, 'GET /api/pos/products/lookup failed');
      res.status(500).json({ error: 'Error en lookup' });
    }
  });

  // ----------------------------------------------------------------------
  // GET /api/pos/products/:id
  // ----------------------------------------------------------------------
  router.get('/products/:id', async (req: Request, res: Response) => {
    const tenantId = req.posUser!.tenantId;
    const id = String(req.params.id);

    try {
      const product = await posProducts.findById(tenantId, id);
      if (!product) {
        res.status(404).json({ error: 'Producto no encontrado' });
        return;
      }
      res.json({ product });
    } catch (err) {
      logger.error({ err, tenantId, id }, 'GET /api/pos/products/:id failed');
      res.status(500).json({ error: 'Error obteniendo producto' });
    }
  });

  // ----------------------------------------------------------------------
  // GET /api/pos/categories
  // ----------------------------------------------------------------------
  router.get('/categories', async (req: Request, res: Response) => {
    const tenantId = req.posUser!.tenantId;

    try {
      const categories = await posCategories.list(tenantId);
      res.json({ categories });
    } catch (err) {
      logger.error({ err, tenantId }, 'GET /api/pos/categories failed');
      res.status(500).json({ error: 'Error listando categorías' });
    }
  });

  // ----------------------------------------------------------------------
  // GET /api/pos/config
  // ----------------------------------------------------------------------
  router.get('/config', async (req: Request, res: Response) => {
    const tenantId = req.posUser!.tenantId;

    try {
      const config = await posConfig.getByTenant(tenantId);
      if (!config) {
        res.status(404).json({ error: 'Config POS no encontrada para este tenant' });
        return;
      }
      res.json({ config });
    } catch (err) {
      logger.error({ err, tenantId }, 'GET /api/pos/config failed');
      res.status(500).json({ error: 'Error obteniendo config' });
    }
  });

  return router;
}

function clampInt(
  raw: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}
