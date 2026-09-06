import type { BusinessHoursService, BusinessHours } from '@/domain/services/BusinessHoursService';

/**
 * DEC-07 (auditoría 2026-08-26): TTL de sesión conversacional a media
 * captura. Compartido entre BotController (mensajes reales) y
 * SimulateMessageUseCase (panel de simulación) — depuración motor+
 * simulador Fase 3 — para que ambos usen EXACTAMENTE el mismo umbral y el
 * mismo texto de aviso. Antes solo vivía en BotController y el simulador
 * no lo probaba en absoluto.
 */
export const SESSION_TTL_MS = 2 * 60 * 60 * 1000;

export const SESSION_EXPIRED_NOTICE =
  'Pasó un rato desde tu último mensaje, empezamos de nuevo 🙂';

/**
 * true si, entre `from` y `to`, pasó suficiente tiempo (TTL) o el negocio
 * estuvo cerrado en algún momento del intervalo — cualquiera de las dos
 * condiciones resetea una sesión a media captura.
 */
export function isSessionExpired(
  businessHoursService: BusinessHoursService,
  hours: BusinessHours,
  from: Date,
  to: Date,
): boolean {
  const ttlExpired = to.getTime() - from.getTime() > SESSION_TTL_MS;
  const closedBetween = businessHoursService.hadClosureBetween(hours, from, to);
  return ttlExpired || closedBetween;
}
