import type { SupabaseClient } from '@supabase/supabase-js';
import type pino from 'pino';
import type {
  PosProductRepository,
  PosProductListOptions,
} from '@/domain/ports/pos/PosProductRepository';
import type { PosProduct, PosUnitType } from '@/domain/entities/pos/Product';

/**
 * Implementación Supabase del PosProductRepository.
 *
 * Sprint 5.1a expone solo lectura. CRUD entra en 5.2.
 *
 * Aislamiento multi-tenant: TODOS los métodos filtran por tenant_id
 * en el WHERE. La RLS es defense-in-depth (el backend usa service_role).
 *
 * search() construye un OR con ILIKE sobre name/sku/barcode. El barcode
 * usa eq (no like) porque típicamente la cajera escanea el código completo.
 */
export class SupabasePosProductRepository implements PosProductRepository {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly logger: pino.Logger,
  ) {}

  async findById(tenantId: string, id: string): Promise<PosProduct | null> {
    const { data, error } = await this.supabase
      .from('pos_products')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .maybeSingle();
    if (error) {
      this.logger.error({ error, tenantId, id }, 'pos.findById failed');
      throw new Error(`pos.findById failed: ${error.message}`);
    }
    return data ? mapRow(data) : null;
  }

  async findByBarcode(tenantId: string, barcode: string): Promise<PosProduct | null> {
    const { data, error } = await this.supabase
      .from('pos_products')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('barcode', barcode)
      .eq('is_active', true)
      .maybeSingle();
    if (error) {
      this.logger.error({ error, tenantId, barcode }, 'pos.findByBarcode failed');
      throw new Error(`pos.findByBarcode failed: ${error.message}`);
    }
    return data ? mapRow(data) : null;
  }

  async findBySku(tenantId: string, sku: string): Promise<PosProduct | null> {
    const { data, error } = await this.supabase
      .from('pos_products')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('sku', sku)
      .maybeSingle();
    if (error) {
      this.logger.error({ error, tenantId, sku }, 'pos.findBySku failed');
      throw new Error(`pos.findBySku failed: ${error.message}`);
    }
    return data ? mapRow(data) : null;
  }

  async search(tenantId: string, query: string, limit = 20): Promise<PosProduct[]> {
    const q = query.trim();
    if (!q) return [];
    // Sanitizar el patrón para evitar inyección en ILIKE — % y _ son
    // metacaracteres. Los escapamos para que el usuario que escribe en la
    // PWA no pueda alterar el alcance del LIKE.
    const safe = q.replace(/[%_]/g, (m) => `\\${m}`);
    const pattern = `%${safe}%`;
    const filter = `name.ilike.${pattern},sku.ilike.${pattern},barcode.eq.${safe}`;

    const { data, error } = await this.supabase
      .from('pos_products')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .or(filter)
      .limit(limit);
    if (error) {
      this.logger.error({ error, tenantId, query }, 'pos.search failed');
      throw new Error(`pos.search failed: ${error.message}`);
    }
    return (data ?? []).map(mapRow);
  }

  async list(
    tenantId: string,
    options: PosProductListOptions = {},
  ): Promise<PosProduct[]> {
    const { categoryId, activeOnly = true, limit = 100, offset = 0 } = options;

    let query = this.supabase
      .from('pos_products')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('name', { ascending: true })
      .range(offset, offset + limit - 1);

    if (activeOnly) {
      query = query.eq('is_active', true);
    }
    if (categoryId) {
      query = query.eq('category_id', categoryId);
    }

    const { data, error } = await query;
    if (error) {
      this.logger.error({ error, tenantId, options }, 'pos.list failed');
      throw new Error(`pos.list failed: ${error.message}`);
    }
    return (data ?? []).map(mapRow);
  }

  async countActive(tenantId: string): Promise<number> {
    const { count, error } = await this.supabase
      .from('pos_products')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('is_active', true);
    if (error) {
      this.logger.error({ error, tenantId }, 'pos.countActive failed');
      throw new Error(`pos.countActive failed: ${error.message}`);
    }
    return count ?? 0;
  }
}

function mapRow(row: Record<string, unknown>): PosProduct {
  return {
    id: row.id as string,
    tenantId: row.tenant_id as string,
    sku: row.sku as string,
    barcode: (row.barcode as string | null) ?? null,
    name: row.name as string,
    description: (row.description as string | null) ?? null,
    categoryId: (row.category_id as string | null) ?? null,
    unitType: row.unit_type as PosUnitType,
    unitPrice: Number(row.unit_price),
    costPrice: row.cost_price !== null ? Number(row.cost_price) : null,
    taxRate: Number(row.tax_rate),
    stockQty: Number(row.stock_qty),
    stockMin: Number(row.stock_min),
    trackStock: row.track_stock as boolean,
    isActive: row.is_active as boolean,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}
