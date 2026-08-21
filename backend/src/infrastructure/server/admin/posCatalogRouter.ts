import { Router, Request, Response, NextFunction } from 'express';
import multer, { MulterError } from 'multer';
import { z } from 'zod';
import type pino from 'pino';
import type { PosProductRepository } from '@/domain/ports/pos/PosProductRepository';
import type { PosCategoryRepository } from '@/domain/ports/pos/PosCategoryRepository';
import type { ImportPosProductsUseCase } from '@/domain/use-cases/ImportPosProductsUseCase';
import type { AuditLogService } from '@/infrastructure/services/AuditLogService';
import { requireTenantScope } from '@/infrastructure/auth/AuthMiddleware';
import { ctx, errMsg } from './helpers';

const UNIT_TYPES = ['piece', 'package', 'box', 'kg', 'liter', 'service'] as const;

const IMPORT_MAX_FILE_BYTES = 5 * 1024 * 1024; // 5MB — sobra para 150-500 SKUs.

/**
 * Sub-router de catálogo POS (Bloque 5 del plan de solución de hallazgos —
 * ver .claude/PLAN_SOLUCION_HALLAZGOS_PENDIENTES.md). Rutas:
 * /api/admin/tenants/:id/pos/products[...].
 *
 * Import masivo por CSV: `multipart/form-data` con el archivo en el campo
 * `file` (memoria, nunca disco — el CSV se procesa y se descarta, no hay
 * razón para persistirlo). Deliberado, no `{ csv: "..." }` en JSON: el
 * body-parser global de ExpressServer limita JSON a 64kb (además de la
 * captura de rawBody para el HMAC del webhook, que también corre sobre
 * TODO request con `Content-Type: application/json`) — subir el límite ahí
 * tocaría una ruta de seguridad crítica (Bloque 1) por un endpoint que no
 * la necesita. `multer` solo intercepta `multipart/form-data`, así que
 * convive sin fricción con esos parsers globales (los saltan por
 * content-type sin tocar el stream).
 */
export function createPosCatalogRouter(params: {
  posProductRepository: PosProductRepository;
  posCategoryRepository: PosCategoryRepository;
  importPosProductsUseCase: ImportPosProductsUseCase;
  audit: AuditLogService;
  logger: pino.Logger;
}): Router {
  const { posProductRepository, posCategoryRepository, importPosProductsUseCase, audit, logger } = params;
  const router = Router();

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: IMPORT_MAX_FILE_BYTES },
  });

  /** Traduce errores de multer (archivo demasiado grande, campo inesperado, etc.) a 400 en vez de 500. */
  function handleUploadErrors(err: unknown, _req: Request, res: Response, next: NextFunction): void {
    if (err instanceof MulterError) {
      const message =
        err.code === 'LIMIT_FILE_SIZE'
          ? `Archivo demasiado grande (máx ${IMPORT_MAX_FILE_BYTES / (1024 * 1024)}MB)`
          : `Error subiendo el archivo: ${err.message}`;
      res.status(400).json({ error: message });
      return;
    }
    next(err);
  }

  // ----------------------------------------------------------------------
  // POST /api/admin/tenants/:id/pos/products/import
  // multipart/form-data: campo `file` (CSV) + campo opcional `dryRun` ("true"/"false").
  // ----------------------------------------------------------------------
  router.post(
    '/tenants/:id/pos/products/import',
    requireTenantScope,
    upload.single('file'),
    handleUploadErrors,
    async (req: Request, res: Response) => {
      const tenantId = String(req.params.id);

      if (!req.file) {
        res.status(400).json({ error: 'Falta el archivo CSV (campo "file")' });
        return;
      }
      const csv = req.file.buffer.toString('utf-8');
      const dryRun = req.body?.dryRun === 'true' || req.body?.dryRun === true;
      const c = ctx(req);

      try {
        const result = await importPosProductsUseCase.execute({ tenantId, csvText: csv, dryRun });

        // El preview (dryRun) no muta nada — no se audita, solo el import real.
        if (!dryRun) {
          audit.log({
            ...c,
            action: 'pos.products.import',
            targetType: 'tenant',
            targetId: tenantId,
            metadata: {
              created: result.created,
              updated: result.updated,
              errorCount: result.errors.length,
            },
          });
        }

        res.json(result);
      } catch (err) {
        logger.error({ err, tenantId }, 'POST pos/products/import failed');
        res.status(500).json({ error: 'Error importando catálogo' });
      }
    },
  );

  // ----------------------------------------------------------------------
  // Fase 2 — creación/edición individual (correcciones puntuales sin
  // re-subir el CSV completo).
  // ----------------------------------------------------------------------
  const ProductBodySchema = z.object({
    sku: z.string().trim().min(1).max(64),
    name: z.string().trim().min(1).max(200),
    category: z.string().trim().min(1).max(120).optional(),
    unitPrice: z.number().min(0),
    stockQty: z.number().min(0).optional(),
    barcode: z.string().trim().min(1).max(64).optional(),
    description: z.string().trim().min(1).max(1000).optional(),
    costPrice: z.number().min(0).optional(),
    unitType: z.enum(UNIT_TYPES).optional(),
    trackStock: z.boolean().optional(),
  });

  const ProductPatchSchema = ProductBodySchema.partial();

  /** Resuelve `category` (nombre) a category_id, creándola si no existe. `undefined` = no tocar. */
  async function resolveCategoryId(tenantId: string, category: string | undefined): Promise<string | null | undefined> {
    if (category === undefined) return undefined;
    const existing = await posCategoryRepository.findByName(tenantId, category);
    if (existing) return existing.id;
    const created = await posCategoryRepository.create({ tenantId, name: category });
    return created.id;
  }

  // POST /api/admin/tenants/:id/pos/products
  router.post(
    '/tenants/:id/pos/products',
    requireTenantScope,
    async (req: Request, res: Response) => {
      const tenantId = String(req.params.id);
      const parsed = ProductBodySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Body inválido' });
        return;
      }
      const c = ctx(req);
      const { sku, name, category, unitPrice, stockQty, barcode, description, costPrice, unitType, trackStock } =
        parsed.data;

      try {
        const categoryId = (await resolveCategoryId(tenantId, category)) ?? null;
        const product = await posProductRepository.create({
          tenantId,
          sku,
          name,
          categoryId,
          unitPrice,
          stockQty,
          barcode: barcode ?? null,
          description: description ?? null,
          costPrice: costPrice ?? null,
          unitType,
          trackStock,
        });
        audit.log({
          ...c,
          action: 'pos.product.create',
          targetType: 'pos_product',
          targetId: product.id,
          metadata: { tenantId, sku: product.sku },
        });
        res.status(201).json({ product });
      } catch (err) {
        logger.error({ err, tenantId, sku }, 'POST pos/products failed');
        res.status(500).json({ error: `Error creando producto: ${errMsg(err)}` });
      }
    },
  );

  // PATCH /api/admin/tenants/:id/pos/products/:productId
  router.patch(
    '/tenants/:id/pos/products/:productId',
    requireTenantScope,
    async (req: Request, res: Response) => {
      const tenantId = String(req.params.id);
      const productId = String(req.params.productId);
      const parsed = ProductPatchSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Body inválido' });
        return;
      }
      const c = ctx(req);

      try {
        const existing = await posProductRepository.findById(tenantId, productId);
        if (!existing) {
          res.status(404).json({ error: 'Producto no encontrado' });
          return;
        }

        const { category, ...rest } = parsed.data;
        const categoryId = await resolveCategoryId(tenantId, category);

        const updated = await posProductRepository.update(tenantId, productId, {
          ...rest,
          ...(categoryId !== undefined ? { categoryId } : {}),
        });
        audit.log({
          ...c,
          action: 'pos.product.update',
          targetType: 'pos_product',
          targetId: productId,
          metadata: { tenantId },
        });
        res.json({ product: updated });
      } catch (err) {
        logger.error({ err, tenantId, productId }, 'PATCH pos/products/:id failed');
        res.status(500).json({ error: `Error actualizando producto: ${errMsg(err)}` });
      }
    },
  );

  return router;
}
