import type { SupabaseClient } from '@supabase/supabase-js';
import type pino from 'pino';
import type { MessagesRepository, MessageRow } from '@/domain/ports';

/**
 * Implementación Supabase de solo-lectura para el tail de mensajes del panel admin.
 * Las escrituras siguen siendo responsabilidad de MessageLogService.
 */
export class SupabaseMessagesRepository implements MessagesRepository {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly logger: pino.Logger,
  ) {}

  async tailByTenant(tenantId: string, limit = 50): Promise<MessageRow[]> {
    const safeLimit = Math.min(Math.max(1, Math.floor(limit)), 200);

    const { data, error } = await this.supabase
      .from('messages')
      .select(
        'id, tenant_id, from_phone, content, response, direction, meta_message_id, timestamp',
      )
      .eq('tenant_id', tenantId)
      .order('timestamp', { ascending: false })
      .limit(safeLimit);

    if (error) {
      this.logger.error({ err: error, tenantId, limit: safeLimit }, '❌ tailByTenant failed');
      throw new Error(`tailByTenant: ${error.message}`);
    }

    type MessageDbRow = {
      id: string;
      tenant_id: string;
      from_phone: string;
      content: string;
      response: string | null;
      direction: MessageRow['direction'];
      meta_message_id: string | null;
      timestamp: string;
    };

    return (data ?? []).map((row: MessageDbRow) => ({
      id: row.id,
      tenantId: row.tenant_id,
      fromPhone: row.from_phone,
      content: row.content,
      response: row.response ?? null,
      direction: row.direction,
      metaMessageId: row.meta_message_id ?? null,
      timestamp: row.timestamp,
    }));
  }
}
