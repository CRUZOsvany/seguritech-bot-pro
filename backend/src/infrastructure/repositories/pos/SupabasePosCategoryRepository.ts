import type { SupabaseClient } from '@supabase/supabase-js';
import type pino from 'pino';
import type { PosCategoryRepository } from '@/domain/ports/pos/PosCategoryRepository';
import type { PosCategory } from '@/domain/entities/pos/Category';

/**
 * Implementación Supabase del PosCategoryRepository.
 *
 * Sprint 5.1a: solo lectura. CRUD en 5.2.
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
