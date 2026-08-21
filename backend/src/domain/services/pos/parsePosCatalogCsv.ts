import { parse } from 'csv-parse/sync';
import { z } from 'zod';
import type { PosUnitType } from '@/domain/entities/pos/Product';

/**
 * Parser + validación del CSV de carga de catálogo (Bloque 5 del plan de
 * solución de hallazgos). Columnas mínimas: sku, name, category, unit_price,
 * stock_qty. Opcionales: barcode, description, cost_price, unit_type.
 *
 * Puro (sin I/O) para que sea trivial de testear — el use-case es quien lo
 * combina con los repositorios.
 */

export interface ParsedCatalogRow {
  /** Fila de datos, 1-indexado, SIN contar el encabezado. */
  row: number;
  sku: string;
  name: string;
  category: string;
  unitPrice: number;
  stockQty: number;
  barcode?: string;
  description?: string;
  costPrice?: number;
  unitType?: PosUnitType;
}

export interface CsvRowError {
  row: number;
  sku?: string;
  message: string;
}

export interface ParseCatalogCsvResult {
  rows: ParsedCatalogRow[];
  errors: CsvRowError[];
}

const REQUIRED_HEADERS = ['sku', 'name', 'category', 'unit_price', 'stock_qty'] as const;

const UNIT_TYPES = ['piece', 'package', 'box', 'kg', 'liter', 'service'] as const;

const CsvRowSchema = z.object({
  sku: z.string().trim().min(1, 'sku requerido'),
  name: z.string().trim().min(1, 'name requerido'),
  category: z.string().trim().min(1, 'category requerido'),
  unit_price: z.coerce.number({ invalid_type_error: 'unit_price debe ser numérico' }).min(0, 'unit_price debe ser >= 0'),
  stock_qty: z.coerce.number({ invalid_type_error: 'stock_qty debe ser numérico' }).min(0, 'stock_qty debe ser >= 0'),
  barcode: z.string().trim().min(1).optional(),
  description: z.string().trim().min(1).optional(),
  cost_price: z.coerce.number({ invalid_type_error: 'cost_price debe ser numérico' }).min(0, 'cost_price debe ser >= 0').optional(),
  unit_type: z.enum(UNIT_TYPES, { errorMap: () => ({ message: `unit_type debe ser uno de: ${UNIT_TYPES.join(', ')}` }) }).optional(),
});

/** Celdas vacías → undefined, para que los campos opcionales no fallen validando '' y los requeridos den un mensaje claro de "falta". */
function cleanRow(raw: Record<string, string>): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(raw)) {
    const trimmed = typeof value === 'string' ? value.trim() : value;
    out[key] = trimmed === '' ? undefined : trimmed;
  }
  return out;
}

export function parsePosCatalogCsv(csvText: string): ParseCatalogCsvResult {
  let records: Record<string, string>[];
  try {
    records = parse(csvText, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      bom: true,
    });
  } catch (err) {
    return {
      rows: [],
      errors: [{ row: 0, message: `CSV inválido: ${err instanceof Error ? err.message : String(err)}` }],
    };
  }

  if (records.length === 0) {
    return { rows: [], errors: [{ row: 0, message: 'El CSV no tiene filas de datos' }] };
  }

  const headers = Object.keys(records[0]);
  const missingHeaders = REQUIRED_HEADERS.filter((h) => !headers.includes(h));
  if (missingHeaders.length > 0) {
    return {
      rows: [],
      errors: [{ row: 0, message: `Faltan columnas requeridas: ${missingHeaders.join(', ')}` }],
    };
  }

  const rows: ParsedCatalogRow[] = [];
  const errors: CsvRowError[] = [];
  const seenSkus = new Map<string, number>(); // sku normalizado -> primera fila donde apareció

  records.forEach((raw, idx) => {
    const rowNum = idx + 1;
    const cleaned = cleanRow(raw);
    const parsed = CsvRowSchema.safeParse(cleaned);
    if (!parsed.success) {
      const message = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
      errors.push({ row: rowNum, sku: cleaned.sku, message });
      return;
    }

    const skuKey = parsed.data.sku.toLowerCase();
    const firstRow = seenSkus.get(skuKey);
    if (firstRow !== undefined) {
      errors.push({
        row: rowNum,
        sku: parsed.data.sku,
        message: `SKU duplicado en este mismo archivo — ya aparece en la fila ${firstRow}`,
      });
      return;
    }
    seenSkus.set(skuKey, rowNum);

    rows.push({
      row: rowNum,
      sku: parsed.data.sku,
      name: parsed.data.name,
      category: parsed.data.category,
      unitPrice: parsed.data.unit_price,
      stockQty: parsed.data.stock_qty,
      barcode: parsed.data.barcode,
      description: parsed.data.description,
      costPrice: parsed.data.cost_price,
      unitType: parsed.data.unit_type,
    });
  });

  return { rows, errors };
}
