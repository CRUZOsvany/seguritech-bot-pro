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

/**
 * Input para registrar/rotar credenciales Meta desde el panel admin.
 * El accessToken llega EN CLARO sobre HTTPS y el repo lo cifra antes de persistir.
 */
export interface UpsertMetaCredentialsInput {
  tenantId: string;
  phoneNumberId: string;
  wabaId: string;
  displayPhoneNumber: string;
  accessToken: string;
}

export interface MetaCredentialsRepository {
  /**
   * Busca credenciales activas para un tenant.
   * Devuelve null si no hay registro o si está marcado inactivo.
   */
  findByTenantId(tenantId: string): Promise<MetaCredentials | null>;

  /**
   * Inserta o rota credenciales. Cifra el access_token con TokenCrypto antes
   * de persistir. Si ya existe registro para ese tenant hace UPDATE; si no, INSERT.
   * Invalida la caché en memoria al terminar.
   */
  upsert(input: UpsertMetaCredentialsInput): Promise<void>;

  /**
   * Marca como inactivas (is_active = false). NO borra el registro, queda
   * el ciphertext histórico. Invalida la caché.
   */
  revoke(tenantId: string): Promise<void>;

  /**
   * Invalida la caché en memoria para un tenant.
   * Útil tras rotación de credenciales desde el panel.
   */
  invalidate(tenantId: string): void;
}
