import { apiFetch } from './client';

/**
 * Cliente del simulador del Studio:
 * POST /api/admin/tenants/:id/studio/flows/:flowId/simulate
 *
 * El backend corre el motor real con adaptadores falsos y devuelve, por cada
 * evento, el JSON exacto que se mandaría a WhatsApp y el "Por qué" en español.
 * Contrato completo: docs/studio/FASE_1_MOTOR_OBSERVABLE.md §2. Espejo a mano
 * de los tipos de backend/src/infrastructure/server/admin/studioSimulation.ts.
 */

/** Qué flow se prueba: el borrador, lo que el bot contesta hoy o una versión del historial. */
export type SimulateSource = 'active' | 'draft' | 'version';

/** Lo que hace el cliente simulado, en el vocabulario del webhook de Meta. */
export type SimEvent =
  | { type: 'text'; text: string }
  | { type: 'button_reply'; id: string; title: string }
  | { type: 'list_reply'; id: string; title: string }
  | { type: 'location'; latitude: number; longitude: number; name?: string; address?: string }
  | { type: 'media'; mediaType: 'image' | 'audio' | 'video' | 'document' | 'sticker' | 'contacts' | 'reaction' }
  | { type: 'advance_time'; minutes: number };

/** JSON de la Cloud API. Se tipa suelto: lo interpreta studioView.bubbleFromPayload. */
export type MetaPayload = { type: string; to: string } & Record<string, unknown>;

export interface SimOutbound {
  to: string;
  audience: 'customer' | 'owner';
  payload: MetaPayload | null;
  rejected?: string;
}

export interface SimSession {
  currentNodeId: string | null;
  context: Record<string, unknown>;
  lastInboundAt: string | null;
  humanPausedUntil: string | null;
  optedOut: boolean;
}

export interface SimTurn {
  at: string;
  outbound: SimOutbound[];
  /** Traza cruda, por si hace falta el detalle. La interfaz muestra `why`. */
  trace: Array<{ kind: string } & Record<string, unknown>>;
  why: string[];
  session: SimSession | null;
  billing: { serviceMessages: number; templates: number };
}

export interface SimulateConversationResult {
  source: SimulateSource;
  flowId: string;
  from: string;
  startAt: string;
  turns: SimTurn[];
}

export function simulateConversation(
  tenantId: string,
  flowId: string,
  body: {
    events: SimEvent[];
    source: SimulateSource;
    versionId?: string;
    startAt?: string;
    from?: string;
  },
): Promise<SimulateConversationResult> {
  return apiFetch<SimulateConversationResult>(
    'POST',
    `/api/admin/tenants/${tenantId}/studio/flows/${flowId}/simulate`,
    body,
  );
}
