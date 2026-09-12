import type { User } from '@/domain/entities';
import type { FlowInactivity } from '@/domain/entities/flow';
import { SESSION_TTL_MS } from '@/domain/services/SessionTtlPolicy';

/**
 * Inactividad (Studio, Fase 5; §6 de la especificación): qué le toca a una
 * conversación que se quedó esperando al cliente. Puro: la hora y la sesión
 * entran por parámetro, así producción y el simulador deciden igual.
 *
 * - Solo a media conversación: con paso guardado que no sea el final.
 * - Nunca con la baja activa ni con una persona atendiendo.
 * - Nunca con la ventana de 24 h cerrada (V-CUMP-03): el motor no manda
 *   plantillas.
 * - Nunca si la sesión ya venció (2 h, o el negocio cerró en medio): la
 *   respuesta del cliente empezaría de nuevo de todos modos.
 * - Un recordatorio por silencio (V-CUMP-04): cuenta si se mandó después del
 *   último mensaje del cliente.
 * - Si ya tocaba cerrar, se cierra sin recordar antes.
 */

/** Ventana de servicio de Meta: mensajes libres hasta 24 h después del último del cliente. */
export const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Tope de los dos tiempos: a las 2 h la sesión vence sola (SessionTtlPolicy). */
export const INACTIVITY_MAX_MINUTES = SESSION_TTL_MS / 60_000;

export type InactivityAction = 'reminder' | 'close';

type SessionView = Pick<User, 'currentNodeId' | 'lastInboundAt' | 'inactivityRemindedAt' | 'optedOutAt' | 'humanPausedUntil'>;

export function inactivityDue(input: {
  inactivity: FlowInactivity | undefined;
  user: SessionView;
  now: Date;
  /** isSessionExpired entre el último mensaje del cliente y ahora. */
  sessionExpired: boolean;
}): InactivityAction | null {
  const { inactivity, user, now } = input;
  const last = user.lastInboundAt;
  if (!inactivity || !last || !isMidConversation(user.currentNodeId)) return null;
  if (user.optedOutAt) return null;
  if (user.humanPausedUntil && user.humanPausedUntil > now) return null;
  if (!serviceWindowOpen(last, now) || input.sessionExpired) return null;

  const idle = now.getTime() - last.getTime();
  if (idle >= toMs(inactivity.close.after_minutes)) return 'close';
  const reminder = inactivity.reminder;
  if (reminder && idle >= toMs(reminder.after_minutes) && !remindedThisSilence(user)) return 'reminder';
  return null;
}

/**
 * Los momentos en que a esta conversación le toca algo, en orden: el
 * recordatorio (si falta) y el cierre. El simulador adelanta el reloj por
 * ellos para correr el barrido cuando el de producción lo haría.
 */
export function inactivityCheckpoints(inactivity: FlowInactivity | undefined, user: SessionView): Date[] {
  const last = user.lastInboundAt;
  if (!inactivity || !last || !isMidConversation(user.currentNodeId)) return [];
  const at = (minutes: number) => new Date(last.getTime() + toMs(minutes));
  const reminder = inactivity.reminder && !remindedThisSilence(user) ? [at(inactivity.reminder.after_minutes)] : [];
  return [...reminder, at(inactivity.close.after_minutes)];
}

export function serviceWindowOpen(lastInboundAt: Date, now: Date): boolean {
  return now.getTime() < lastInboundAt.getTime() + SERVICE_WINDOW_MS;
}

function isMidConversation(nodeId: string | undefined): boolean {
  return !!nodeId && nodeId !== 'end';
}

function remindedThisSilence(user: SessionView): boolean {
  return !!user.inactivityRemindedAt && !!user.lastInboundAt && user.inactivityRemindedAt >= user.lastInboundAt;
}

const toMs = (minutes: number) => minutes * 60_000;
