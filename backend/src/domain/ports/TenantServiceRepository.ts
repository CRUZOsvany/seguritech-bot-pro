/**
 * Servicios que un tenant puede contratar. Modelo modular.
 */
export type ServiceType = 'whatsapp_bot' | 'messenger_bot' | 'pos';

/**
 * FSM del status de un servicio (independiente del status del tenant).
 * draft → configuring → active → paused → archived
 */
export type ServiceStatus =
  | 'draft'
  | 'configuring'
  | 'active'
  | 'paused'
  | 'archived';

export interface TenantService {
  id: string;
  tenantId: string;
  serviceType: ServiceType;
  status: ServiceStatus;
  enabledAt: string | null;
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface TenantServiceRepository {
  /** Lista todos los servicios de un tenant. */
  listByTenant(tenantId: string): Promise<TenantService[]>;

  /** Devuelve un servicio específico o null si no existe. */
  findOne(
    tenantId: string,
    serviceType: ServiceType,
  ): Promise<TenantService | null>;

  /**
   * Habilita un servicio para un tenant (crea la fila si no existe).
   * Status inicial: 'configuring'. Idempotente: si ya existe, lo devuelve sin cambios.
   */
  enable(tenantId: string, serviceType: ServiceType): Promise<TenantService>;

  /** Cambia el status FSM de un servicio. El caller valida la transición. */
  setStatus(
    tenantId: string,
    serviceType: ServiceType,
    status: ServiceStatus,
  ): Promise<void>;

  /**
   * Lookup caliente para el gating del webhook.
   * Devuelve el status del servicio o null si el tenant no tiene ese servicio.
   */
  findServiceStatus(
    tenantId: string,
    serviceType: ServiceType,
  ): Promise<ServiceStatus | null>;
}
