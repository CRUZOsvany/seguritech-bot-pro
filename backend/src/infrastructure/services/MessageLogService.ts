import { SupabaseClient } from '@supabase/supabase-js';
import pino from 'pino';

/**
 * Registra mensajes inbound/outbound en la tabla `messages`.
 * Provee idempotencia por meta_message_id (índice único en schema 002).
 */
export class MessageLogService {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly logger: pino.Logger,
  ) {}

  /**
   * ¿Ya procesamos este webhook antes? Meta reintenta cuando no respondemos
   * con 200 dentro de ~5s. Sin esto, mensajes duplicados se procesan dos veces.
   */
  async isProcessed(metaMessageId: string | undefined): Promise<boolean> {
    if (!metaMessageId) return false;

    const { data, error } = await this.supabase
      .from('messages')
      .select('id')
      .eq('meta_message_id', metaMessageId)
      .limit(1)
      .maybeSingle();

    if (error) {
      this.logger.warn(
        { error, metaMessageId },
        'Error chequeando idempotencia — fail-open (procesar mensaje)',
      );
      return false;
    }

    return !!data;
  }

  async logInbound(params: {
    tenantId: string;
    fromPhone: string;
    content: string;
    metaMessageId?: string;
  }): Promise<void> {
    const { error } = await this.supabase.from('messages').insert({
      tenant_id: params.tenantId,
      from_phone: params.fromPhone,
      content: params.content,
      direction: 'inbound',
      meta_message_id: params.metaMessageId ?? null,
    });

    if (error) {
      // Code 23505 = unique_violation: ya existía. No es error, es idempotencia.
      if ((error as { code?: string }).code === '23505') {
        this.logger.debug(
          { metaMessageId: params.metaMessageId },
          'Mensaje ya logueado (race condition con isProcessed)',
        );
        return;
      }
      this.logger.error({ error, params }, 'Error loggeando inbound');
    }
  }

  async logOutbound(params: {
    tenantId: string;
    toPhone: string;
    content: string;
  }): Promise<void> {
    const { error } = await this.supabase.from('messages').insert({
      tenant_id: params.tenantId,
      from_phone: params.toPhone,
      content: params.content,
      direction: 'outbound',
    });

    if (error) {
      this.logger.error({ error, params }, 'Error loggeando outbound');
    }
  }
}