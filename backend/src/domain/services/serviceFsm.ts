import type { ServiceStatus } from '@/domain/ports/TenantServiceRepository';

/**
 * Grafo de transiciones permitidas del FSM de un servicio.
 * draft → configuring → active ⇄ paused, todos → archived, archived → configuring (revivir).
 * La transición a sí mismo (from === to) es un no-op idempotente válido.
 */
const ALLOWED: Record<ServiceStatus, ServiceStatus[]> = {
  draft: ['configuring', 'archived'],
  configuring: ['active', 'draft', 'archived'],
  active: ['paused', 'archived'],
  paused: ['active', 'archived'],
  archived: ['configuring'],
};

/** Error de transición FSM inválida. La capa HTTP lo mapea a 409. */
export class ServiceTransitionError extends Error {
  readonly code = 'invalid_service_transition';
  constructor(
    public readonly from: ServiceStatus,
    public readonly to: ServiceStatus,
  ) {
    super(`Transición de servicio inválida: ${from} → ${to}`);
    this.name = 'ServiceTransitionError';
  }
}

/** True si from → to es válida (incluye el no-op from === to). */
export function isValidServiceTransition(
  from: ServiceStatus,
  to: ServiceStatus,
): boolean {
  if (from === to) return true;
  return ALLOWED[from].includes(to);
}

/** Lanza ServiceTransitionError si la transición no es válida. */
export function assertServiceTransition(
  from: ServiceStatus,
  to: ServiceStatus,
): void {
  if (!isValidServiceTransition(from, to)) {
    throw new ServiceTransitionError(from, to);
  }
}
