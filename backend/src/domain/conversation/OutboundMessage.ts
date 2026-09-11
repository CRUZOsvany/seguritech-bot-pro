import type { InterpreterOutput } from '@/domain/services/FlowInterpreter';

/**
 * Lo que el bot le manda a alguien, en términos del dominio.
 *
 * Es la salida del intérprete ya lista para enviar: `escape_to_human` se
 * convirtió en sus dos mensajes (respuesta al cliente, alerta al dueño) y la
 * reacción ya sabe a qué mensaje responde. El JSON exacto de la Cloud API lo
 * arma infraestructura (metaPayloads.ts) a partir de esto — el mismo código
 * para el envío real y para el simulador.
 */
export type OutboundContent =
  | Exclude<InterpreterOutput, { kind: 'escape_to_human' } | { kind: 'reaction' }>
  | { kind: 'reaction'; emoji: string; messageId: string };

export interface OutboundMessage {
  to: string;
  /** El dueño recibe alertas de paso a humano y respuestas a sus comandos. */
  audience: 'customer' | 'owner';
  content: OutboundContent;
}

/** Puerto de envío del motor. Un mensaje a la vez, en el orden en que el motor los emite. */
export interface MessengerPort {
  send(tenantId: string, message: OutboundMessage): Promise<void>;
}

/**
 * Texto "representativo" de un mensaje: lo que BotController.processMessage
 * devuelve para el log outbound. Reglas copiadas tal cual del dispatch
 * original; una reacción no cambia el último texto.
 */
export function representativeText(content: OutboundContent): string | null | undefined {
  switch (content.kind) {
  case 'text':
  case 'buttons':
  case 'list':
    return content.text;
  case 'image':
    return content.caption ?? null;
  case 'location':
    return content.name ?? null;
  case 'document':
    return content.caption ?? content.filename;
  case 'cta_url':
  case 'location_request':
  case 'media_carousel':
  case 'call_permission_request':
  case 'whatsapp_flow':
    return content.body;
  case 'reaction':
    return undefined;
  }
}
