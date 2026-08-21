import type { SupabaseClient } from '@supabase/supabase-js';
import type pino from 'pino';
import type { PosCategoryRepository } from '@/domain/ports/pos/PosCategoryRepository';
import type { NewPosCategory, PosCategory } from '@/domain/entities/pos/Category';

/**
 * Implementación Supabase del PosCategoryRepository.
 *
 * Sprint 5.1a: solo lectura. Sprint 5.2 (Bloque 5) agrega findByName/create.
 */
export class SupabasePosCategoryRepository implements PosCategoryRepository {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly logger: pino.Logger,
  ) {}

  async findById(tenantId: string, id: string): Promise<PosCategory | null> {
    const { data, error } = await this.supabase
      .from('pos_categories')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .maybeSingle();
    if (error) {
      this.logger.error({ error, tenantId, id }, 'pos.category.findById failed');
      throw new Error(`pos.category.findById failed: ${error.message}`);
    }
    return data ? mapRow(data) : null;
  }

  async findByName(tenantId: string, name: string): Promise<PosCategory | null> {
    const { data, error } = await this.supabase
      .from('pos_categories')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('name', name)
      .maybeSingle();
    if (error) {
      this.logger.error({ error, tenantId, name }, 'pos.category.findByName failed');
      throw new Error(`pos.category.findByName failed: ${error.message}`);
    }
    return data ? mapRow(data) : null;
  }

  async create(category: NewPosCategory): Promise<PosCategory> {
    const { data, error } = await this.supabase
      .from('pos_categories')
      .insert({
        tenant_id: category.tenantId,
        name: category.name,
        parent_id: category.parentId ?? null,
        display_order: category.displayOrder ?? 0,
      })
      .select('*')
      .single();
    if (error) {
      this.logger.error({ error, tenantId: category.tenantId, name: category.name }, 'pos.category.create failed');
      throw new Error(`pos.category.create failed: ${error.message}`);
    }
    return mapRow(data);
  }

  async list(tenantId: string, activeOnly = true): Promise<PosCategory[]> {
    let query = this.supabase
      .from('pos_categories')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('display_order', { ascending: true })
      .order('name', { ascending: true });

    if (activeOnly) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;
    if (error) {
      this.logger.error({ error, tenantId }, 'pos.category.list failed');
      throw new Error(`pos.category.list failed: ${error.message}`);
    }
    return (data ?? []).map(mapRow);
  }
}

function mapRow(row: Record<string, unknown>): PosCategory {
  return {
    id: row.id as string,
    tenantId: row.tenant_id as string,
    name: row.name as string,
    parentId: (row.parent_id as string | null) ?? null,
    displayOrder: Number(row.display_order),
    isActive: row.is_active as boolean,
    createdAt: new Date(row.created_at as string),
  };
}
