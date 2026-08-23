import type { SupabaseClient } from '@supabase/supabase-js';
import type pino from 'pino';
import type { ServiceDirectoryEntry } from '@/domain/entities';
import type { ServiceDirectoryRepository } from '@/domain/ports';

/**
 * Implementación Supabase del ServiceDirectoryRepository (Capa 2).
 *
 * Aislamiento multi-tenant: filtro `tenant_id` explícito en cada query
 * (defensa en profundidad, no confiar solo en RLS) — mismo patrón que
 * `SupabaseBotFlowRepository.ts`.
 */
export class SupabaseServiceDirectoryRepository implements ServiceDirectoryRepository {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly logger: pino.Logger,
  ) {}

  private map(row: Record<string, unknown>): ServiceDirectoryEntry {
    return {
      id: row.id as string,
      tenantId: row.tenant_id as string,
      nombre: row.nombre as string,
      keywords: (row.keywords as string[] | null) ?? [],
      respuesta: row.respuesta as string,
      precio: row.precio != null ? Number(row.precio) : undefined,
      activo: row.activo as boolean,
      orden: Number(row.orden ?? 0),
    };
  }

  async listByTenant(
    tenantId: string,
    opts?: { onlyActive?: boolean },
  ): Promise<ServiceDirectoryEntry[]> {
    let query = this.supabase
      .from('tenant_service_directory')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('orden', { ascending: true });

    if (opts?.onlyActive) query = query.eq('activo', true);

    const { data, error } = await query;
    if (error) {
      this.logger.error({ error, tenantId }, 'listByTenant (service directory) failed');
      throw new Error(`listByTenant failed: ${error.message}`);
    }
    return (data ?? []).map((r) => this.map(r));
  }

  async create(
    tenantId: string,
    entry: Omit<ServiceDirectoryEntry, 'id' | 'tenantId'>,
  ): Promise<ServiceDirectoryEntry> {
    const { data, error } = await this.supabase
      .from('tenant_service_directory')
      .insert({
        tenant_id: tenantId,
        nombre: entry.nombre,
        keywords: entry.keywords,
        respuesta: entry.respuesta,
        precio: entry.precio ?? null,
        activo: entry.activo,
        orden: entry.orden,
      })
      .select('*')
      .single();
    if (error) {
      this.logger.error({ error, tenantId }, 'create (service directory) failed');
      throw new Error(`create failed: ${error.message}`);
    }
    return this.map(data);
  }

  async update(
    tenantId: string,
    id: string,
    patch: Partial<Omit<ServiceDirectoryEntry, 'id' | 'tenantId'>>,
  ): Promise<ServiceDirectoryEntry> {
    const row: Record<string, unknown> = {};
    if (patch.nombre !== undefined) row.nombre = patch.nombre;
    if (patch.keywords !== undefined) row.keywords = patch.keywords;
    if (patch.respuesta !== undefined) row.respuesta = patch.respuesta;
    if (patch.precio !== undefined) row.precio = patch.precio;
    if (patch.activo !== undefined) row.activo = patch.activo;
    if (patch.orden !== undefined) row.orden = patch.orden;

    const { data, error } = await this.supabase
      .from('tenant_service_directory')
      .update(row)
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .select('*')
      .single();
    if (error) {
      this.logger.error({ error, tenantId, id }, 'update (service directory) failed');
      throw new Error(`update failed: ${error.message}`);
    }
    return this.map(data);
  }

  async delete(tenantId: string, id: string): Promise<void> {
    const { error } = await this.supabase
      .from('tenant_service_directory')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('id', id);
    if (error) {
      this.logger.error({ error, tenantId, id }, 'delete (service directory) failed');
      throw new Error(`delete failed: ${error.message}`);
    }
  }
}
