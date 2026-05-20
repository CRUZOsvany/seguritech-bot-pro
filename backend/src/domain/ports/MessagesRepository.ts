/**
 * Mensaje individual (fila de tabla messages, normalizada al dominio).
 */
export interface MessageRow {
  id: string;
  tenantId: string;
  fromPhone: string;
  content: string;
  response: string | null;
  direction: 'inbound' | 'outbound';
  metaMessageId: string | null;
  timestamp: string; // ISO
}

/**
 * Puerto de SOLO-LECTURA para auditoría desde el panel admin.
 * Las escrituras a `messages` siguen siendo responsabilidad de MessageLogService.
 */
export interface MessagesRepository {
  /**
   * Devuelve los últimos N mensajes del tenant ordenados desc por timestamp.
   * Limit default 50, clamp [1, 200].
   */
  tailByTenant(tenantId: string, limit?: number): Promise<MessageRow[]>;
}
