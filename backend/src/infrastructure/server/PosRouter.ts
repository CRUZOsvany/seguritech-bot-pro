import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import type pino from 'pino';
import type { PosProductRepository } from '@/domain/ports/pos/PosProductRepository';
import type { PosCategoryRepository } from '@/domain/ports/pos/PosCategoryRepository';
import type { PosTenantConfigRepository } from '@/domain/ports/pos/PosTenantConfigRepository';
import type { PosSaleRepository } from '@/domain/ports/pos/PosSaleRepository';
import type { PosCashSessionRepository } from '@/domain/ports/pos/PosCashSessionRepository';
import { OpenCashSessionUseCase } from '@/application/pos/OpenCashSessionUseCase';
import { CloseCashSessionUseCase } from '@/application/pos/CloseCashSessionUseCase';
import { GetCashSessionSummaryUseCase } from '@/application/pos/GetCashSessionSummaryUseCase';
import { RegisterSaleUseCase } from '@/application/pos/RegisterSaleUseCase';
import { PosOperationError, type PosOperationErrorCode } from '@/application/pos/PosOperationError';

type Mw = (req: Request, res: Response, next: NextFunction) => void | Promise<void>;

/**
 * Router del módulo POS. Sprint 5.1a: lectura del catálogo. POS Lite (T-05):
 * caja y ventas.
 *
 * Orden crítico: /health se monta ANTES de router.use(requirePosSession,
 * requireModule) para que sea público. Todo lo demás requiere cookie POS
 * válida + módulo 'pos' habilitado en el tenant.
 *
 * Mount point: /api/pos (definido en ExpressServer.setupPosRoutes).
 *
 * Endpoints:
 *   GET   /health                     — público; sirve readiness sin auth
 *   GET   /products                   — lista paginada del catálogo
 *   GET   /products/lookup            — búsqueda por nombre/sku/barcode
 *   GET   /products/:id               — detalle
 *   GET   /categories                 — lista de categorías
 *   GET   /config                     — config POS del tenant (mould, business_name, etc.)
 *   POST  /cash-sessions              — abrir caja (idempotente por clientId)
 *   GET   /cash-sessions/current      — caja abierta del cajero, o null
 *   PATCH /cash-sessions/:id/close    — cerrar con arqueo (idempotente)
 *   GET   /cash-sessions/:id/summary  — resumen para la pantalla de cierre
 *   POST  /sales                      — registrar venta (idempotente por clientId)
 *
 * Tenant aislamiento: tenantId se lee de req.posUser.tenantId y cashierId de
 * req.posUser.sub (no se aceptan vía header ni body — la cookie es la única
 * fuente de verdad).
 *
 * Offline-first: los POST idempotentes responden 201 al crear y 200 al
 * reconocer un reintento. El cliente reintenta ante red/5xx; un 4xx es
 * definitivo y se le muestra al cajero.
 */
export function createPosRouter(params: {
  requirePosSession: Mw;
  requireModule: Mw;
  posProducts: PosProductRepository;
  posCategories: PosCategoryRepository;
  posConfig: PosTenantConfigRepository;
  posSales: PosSaleRepository;
  posCashSessions: PosCashSessionRepository;
  logger: pino.Logger;
}): Router {
  const {
    requirePosSession,
    requireModule,
    posProducts,
    posCategories,
    posConfig,
    posSales,
    posCashSessions,
    logger,
  } = params;
  const router = Router();

  const openCashSession = new OpenCashSessionUseCase(posCashSessions);
  const closeCashSession = new CloseCashSessionUseCase(posCashSessions);
  const getCashSessionSummary = new GetCashSessionSummaryUseCase(posCashSessions);
  const registerSale = new RegisterSaleUseCase(posSales, posCashSessions, posProducts);

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

  // ======================================================================
  // POS Lite (T-05) — caja y ventas.
  // cashierId = req.posUser.sub, tenantId = req.posUser.tenantId. Nunca del body.
  // ======================================================================

  // numeric(10,2) → máx 99,999,999.99; numeric(10,3) → máx 9,999,999.999.
  const Money = z.number().finite().min(0).max(99_999_999.99);
  const IdParam = z.string().uuid();

  const OpenCashSessionSchema = z.object({
    clientId: z.string().uuid(),
    openingAmount: Money,
  });

  const CloseCashSessionSchema = z.object({
    closingAmount: Money,
  });

  // 'mixed' existe en el CHECK de pos_sales pero no hay columnas para el
  // desglose efectivo/tarjeta, así que el arqueo no podría cuadrarlo. v1 no lo
  // acepta (la pantalla de venta tampoco lo ofrece).
  const RegisterSaleSchema = z.object({
    clientId: z.string().uuid(),
    cashSessionId: z.string().uuid(),
    items: z
      .array(
        z.object({
          productId: z.string().uuid(),
          quantity: z.number().finite().positive().max(9_999_999.999),
        }),
      )
      .min(1)
      .max(200),
    paymentMethod: z.enum(['cash', 'card', 'transfer']),
    amountPaid: Money,
  });

  // ----------------------------------------------------------------------
  // POST /api/pos/cash-sessions — abrir caja
  // ----------------------------------------------------------------------
  router.post('/cash-sessions', async (req: Request, res: Response) => {
    const parsed = OpenCashSessionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'clientId (uuid) y openingAmount (≥ 0) requeridos' });
      return;
    }
    const tenantId = req.posUser!.tenantId;
    const cashierId = req.posUser!.sub;

    try {
      const { session, created } = await openCashSession.execute({
        tenantId,
        cashierId,
        input: parsed.data,
      });
      res.status(created ? 201 : 200).json({ session });
    } catch (err) {
      sendPosError(res, err, logger, { tenantId, cashierId }, 'POST /api/pos/cash-sessions failed');
    }
  });

  // ----------------------------------------------------------------------
  // GET /api/pos/cash-sessions/current — caja abierta del cajero, o null
  // ----------------------------------------------------------------------
  router.get('/cash-sessions/current', async (req: Request, res: Response) => {
    const tenantId = req.posUser!.tenantId;
    const cashierId = req.posUser!.sub;

    try {
      const session = await posCashSessions.findOpenByCashier(tenantId, cashierId);
      res.json({ session });
    } catch (err) {
      logger.error({ err, tenantId, cashierId }, 'GET /api/pos/cash-sessions/current failed');
      res.status(500).json({ error: 'Error obteniendo la caja actual' });
    }
  });

  // ----------------------------------------------------------------------
  // PATCH /api/pos/cash-sessions/:id/close — cerrar con arqueo
  // ----------------------------------------------------------------------
  router.patch('/cash-sessions/:id/close', async (req: Request, res: Response) => {
    const id = IdParam.safeParse(req.params.id);
    const parsed = CloseCashSessionSchema.safeParse(req.body);
    if (!id.success || !parsed.success) {
      res.status(400).json({ error: 'id (uuid) y closingAmount (≥ 0) requeridos' });
      return;
    }
    const tenantId = req.posUser!.tenantId;
    const cashierId = req.posUser!.sub;

    try {
      const { session, summary } = await closeCashSession.execute({
        tenantId,
        cashierId,
        sessionId: id.data,
        input: parsed.data,
      });
      res.json({ session, summary });
    } catch (err) {
      sendPosError(res, err, logger, { tenantId, cashierId, id: id.data }, 'PATCH /api/pos/cash-sessions/:id/close failed');
    }
  });

  // ----------------------------------------------------------------------
  // GET /api/pos/cash-sessions/:id/summary — resumen de cierre
  // ----------------------------------------------------------------------
  router.get('/cash-sessions/:id/summary', async (req: Request, res: Response) => {
    const id = IdParam.safeParse(req.params.id);
    if (!id.success) {
      res.status(400).json({ error: 'id (uuid) requerido' });
      return;
    }
    const tenantId = req.posUser!.tenantId;
    const cashierId = req.posUser!.sub;

    try {
      const { session, summary } = await getCashSessionSummary.execute({
        tenantId,
        cashierId,
        sessionId: id.data,
      });
      res.json({ session, summary });
    } catch (err) {
      sendPosError(res, err, logger, { tenantId, cashierId, id: id.data }, 'GET /api/pos/cash-sessions/:id/summary failed');
    }
  });

  // ----------------------------------------------------------------------
  // POST /api/pos/sales — registrar venta
  // ----------------------------------------------------------------------
  router.post('/sales', async (req: Request, res: Response) => {
    const parsed = RegisterSaleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Venta inválida', issues: parsed.error.issues });
      return;
    }
    const tenantId = req.posUser!.tenantId;
    const cashierId = req.posUser!.sub;

    try {
      const { sale, created } = await registerSale.execute({
        tenantId,
        cashierId,
        input: parsed.data,
      });
      res.status(created ? 201 : 200).json({ sale });
    } catch (err) {
      sendPosError(res, err, logger, { tenantId, cashierId, clientId: parsed.data.clientId }, 'POST /api/pos/sales failed');
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

const POS_ERROR_STATUS: Record<PosOperationErrorCode, number> = {
  session_not_found: 404,
  product_not_found: 404,
  session_not_owned: 403,
  session_closed: 409,
  session_already_open: 409,
  insufficient_stock: 409,
  empty_cart: 400,
  insufficient_payment: 400,
  invalid_payment: 400,
};

/** PosOperationError → 4xx con `code` para que la PWA decida; el resto → 500. */
function sendPosError(
  res: Response,
  err: unknown,
  logger: pino.Logger,
  ctx: Record<string, unknown>,
  msg: string,
): void {
  if (err instanceof PosOperationError) {
    res.status(POS_ERROR_STATUS[err.code]).json({
      error: err.message,
      code: err.code,
      ...(err.details ? { details: err.details } : {}),
    });
    return;
  }
  logger.error({ err, ...ctx }, msg);
  res.status(500).json({ error: 'Error interno del POS' });
}
