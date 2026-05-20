import { User, TenantConfig } from '../entities';

/**
 * Puerto para persistencia de usuario.
 * IMPORTANTE: Todos los métodos aceptan tenantId para garantizar aislamiento.
 */
export interface UserRepository {
  save(user: User): Promise<void>;
  findById(tenantId: string, id: string): Promise<User | null>;
  findByPhoneNumber(tenantId: string, phoneNumber: string): Promise<User | null>;
  update(user: User): Promise<void>;
  resetUserState(tenantId: string, phoneNumber: string): Promise<void>;
}

/**
 * Puerto para persistencia de productos
 */
export interface ProductRepository {
  findAll(tenantId: string): Promise<any[]>;
  findById(tenantId: string, id: string): Promise<any | null>;
}

/**
 * Puerto para persistencia de pedidos
 */
export interface OrderRepository {
  save(order: any): Promise<void>;
  findByUserId(tenantId: string, userId: string): Promise<any[]>;
}

/**
 * Puerto para envío de mensajes al usuario final.
 *
 * BREAKING CHANGE (Sprint C): todas las firmas reciben tenantId como primer
 * argumento. El adapter resuelve credenciales internamente.
 *
 * Sprint D: agregados sendList, sendLocation, sendDocument para paridad
 * total con Meta Cloud API v21.0.
 */
export interface NotificationPort {
  sendMessage(
    tenantId: string,
    phoneNumber: string,
    message: string,
  ): Promise<void>;

  sendButtons(
    tenantId: string,
    phoneNumber: string,
    message: string,
    buttons: string[],
  ): Promise<void>;

  sendImage(
    tenantId: string,
    phoneNumber: string,
    imageUrl: string,
    caption?: string,
  ): Promise<void>;

  /**
   * Envía un mensaje interactivo tipo lista (modal de opciones).
   * Cada sección debe tener al menos 1 item; total <= 10 rows; <= 10 sections.
   */
  sendList(
    tenantId: string,
    phoneNumber: string,
    bodyText: string,
    buttonLabel: string,
    sections: Array<{
      title: string;
      rows: Array<{ id: string; title: string; description?: string }>;
    }>,
  ): Promise<void>;

  /**
   * Envía un pin de ubicación geográfica.
   */
  sendLocation(
    tenantId: string,
    phoneNumber: string,
    latitude: number,
    longitude: number,
    name?: string,
    address?: string,
  ): Promise<void>;

  /**
   * Envía un documento (PDF, etc.) por URL.
   */
  sendDocument(
    tenantId: string,
    phoneNumber: string,
    documentUrl: string,
    filename: string,
    caption?: string,
  ): Promise<void>;
}

/**
 * Puerto para cargar configuración por tenant.
 * El adapter de infraestructura (SupabaseTenantConfigService) implementa caché.
 */
export interface TenantConfigPort {
  getConfig(tenantId: string): Promise<TenantConfig | null>;
  invalidate(tenantId: string): void;
}

/**
 * Puerto para carga y persistencia de flujos conversacionales por tenant.
 * Re-exportado desde BotFlowRepository.ts para mantener un solo punto de entrada.
 */
export { BotFlowRepository } from './BotFlowRepository';

/**
 * Puerto para operaciones CRUD de tenants (administración interna).
 */
export {
  TenantRepository,
  TenantSummary,
  TenantDetail,
  CreateTenantInput,
  UpdateTenantInput,
  TenantGiro,
} from './TenantRepository';

export {
  MetaCredentialsRepository,
  MetaCredentials,
  UpsertMetaCredentialsInput,
} from './MetaCredentialsRepository';

/**
 * Puerto de solo-lectura para tail de mensajes desde el panel admin.
 */
export { MessagesRepository, MessageRow } from './MessagesRepository';

/**
 * Puertos de autenticación admin (Operación Búnker v2 — Sprint F).
 */
export { AdminUsersRepository, AdminUser, AdminRole } from './AdminUsersRepository';
export { AdminSessionsRepository } from './AdminSessionsRepository';
export { LoginAttemptsRepository } from './LoginAttemptsRepository';