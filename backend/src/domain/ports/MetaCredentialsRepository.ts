/**
 * Credenciales de Meta WhatsApp Cloud API por tenant.
 * El access_token llega DESCIFRADO al dominio. El cifrado/descifrado
 * es responsabilidad de la capa de infraestructura.
 */
export interface MetaCredentials {
  tenantId: string;
  phoneNumberId: string;
  wabaId: string;
  displayPhoneNumber: string;
  accessToken: string; // descifrado en memoria
  isActive: boolean;
}

export interface MetaCredentialsRepository {
  /**
   * Busca credenciales activas para un tenant.
   * Devuelve null si no hay registro o si está marcado inactivo.
   */
  findByTenantId(tenantId: string): Promise<MetaCredentials | null>;

  /**
   * Invalida la caché en memoria para un tenant.
   * Útil tras rotación de credenciales desde el panel.
   */
  invalidate(tenantId: string): void;
}