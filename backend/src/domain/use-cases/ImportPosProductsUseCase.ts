import type pino from 'pino';
import type { PosProductRepository } from '@/domain/ports/pos/PosProductRepository';
import type { PosCategoryRepository } from '@/domain/ports/pos/PosCategoryRepository';
import type { NewPosProduct } from '@/domain/entities/pos/Product';
import { parsePosCatalogCsv, type CsvRowError } from '@/domain/services/pos/parsePosCatalogCsv';

/**
 * Import masivo de catálogo POS desde un CSV (Bloque 5 del plan de solución
 * de hallazgos — ver .claude/PLAN_SOLUCION_HALLAZGOS_PENDIENTES.md).
 *
 * Resuelve `category` (texto libre del CSV) contra pos_categories por
 * nombre, creando la categoría si no existe — es lo que espera un usuario
 * real subiendo un CSV, no un desarrollador con UUIDs a mano.
 *
 * Upsert por (tenantId, sku): fila nueva → crea, sku ya existente → actualiza.
 * Una fila inválida NUNCA aborta el import completo — se acumula en `errors`
 * con el número de fila y se sigue con las demás (mismo criterio que el
 * resto de la carga: mejor un catálogo 95% cargado que ninguno).
 *
 * dryRun=true: corre exactamente la misma validación y resolución de
 * categorías/SKUs existentes, pero NO escribe nada — usado por el panel
 * para mostrar el preview ("se van a crear X, actualizar Y, N errores")
 * antes de que el operador confirme.
 */
export interface ImportPosProductsResult {
  created: number;
  updated: number;
  errors: CsvRowError[];
}

export class ImportPosProductsUseCase {
  constructor(
    private readonly posProductRepository: PosProductRepository,
    private readonly posCategoryRepository: PosCategoryRepository,
    private readonly logger: pino.Logger,
  ) {}

  async execute(params: {
    tenantId: string;
    csvText: string;
    dryRun?: boolean;
  }): Promise<ImportPosProductsResult> {
    const { tenantId, csvText, dryRun = false } = params;
    const { rows, errors: parseErrors } = parsePosCatalogCsv(csvText);
    const errors: CsvRowError[] = [...parseErrors];
    let created = 0;
    let updated = 0;

    // Cache de categorías resueltas en esta corrida — evita un find/create
    // por fila cuando muchas filas comparten la misma categoría (el caso
    // normal: 500 SKUs, un puñado de categorías).
    const categoryCache = new Map<string, string | null>();

    for (const row of rows) {
      try {
        const categoryId = await this.resolveCategoryId(tenantId, row.category, categoryCache, dryRun);

        if (dryRun) {
          const existing = await this.posProductRepository.findBySku(tenantId, row.sku);
          if (existing) updated += 1;
          else created += 1;
          continue;
        }

        const input: NewPosProduct = {
          tenantId,
          sku: row.sku,
          name: row.name,
          categoryId,
          unitPrice: row.unitPrice,
          stockQty: row.stockQty,
          barcode: row.barcode ?? null,
          description: row.description ?? null,
          costPrice: row.costPrice ?? null,
          ...(row.unitType ? { unitType: row.unitType } : {}),
        };
        const { created: wasCreated } = await this.posProductRepository.upsertBySku(input);
        if (wasCreated) created += 1;
        else updated += 1;
      } catch (err) {
        this.logger.error(
          { err, tenantId, row: row.row, sku: row.sku },
          'ImportPosProductsUseCase: fila falló',
        );
        errors.push({
          row: row.row,
          sku: row.sku,
          message: err instanceof Error ? err.message : 'Error interno procesando la fila',
        });
      }
    }

    this.logger.info(
      { tenantId, created, updated, errorCount: errors.length, dryRun },
      'ImportPosProductsUseCase: import terminado',
    );

    return { created, updated, errors };
  }

  /**
   * Resuelve el nombre de categoría del CSV a un category_id, creándola si
   * no existe. En dryRun NO crea nada (el preview no debe tener efectos
   * secundarios) — devuelve null, que basta para contar created/updated.
   */
  private async resolveCategoryId(
    tenantId: string,
    name: string,
    cache: Map<string, string | null>,
    dryRun: boolean,
  ): Promise<string | null> {
    const key = name.trim().toLowerCase();
    if (cache.has(key)) return cache.get(key)!;

    const existing = await this.posCategoryRepository.findByName(tenantId, name.trim());
    if (existing) {
      cache.set(key, existing.id);
      return existing.id;
    }

    if (dryRun) {
      cache.set(key, null);
      return null;
    }

    const createdCategory = await this.posCategoryRepository.create({ tenantId, name: name.trim() });
    cache.set(key, createdCategory.id);
    return createdCategory.id;
  }
}
