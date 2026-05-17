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
 * argumento. La razón es multi-tenant: cada tenant tiene su propio
 * phone_number_id y access_token de Meta. El adapter resuelve credenciales
 * internamente; ni el BotController ni los use cases conocen tokens.
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
export { TenantRepository } from './TenantRepository';

export {
  MetaCredentialsRepository,
  MetaCredentials,
} from './MetaCredentialsRepository';