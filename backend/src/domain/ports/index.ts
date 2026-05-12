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
 * Puerto para notificaciones (envío de mensajes al usuario final)
 */
export interface NotificationPort {
  sendMessage(phoneNumber: string, message: string): Promise<void>;
  sendButtons(phoneNumber: string, message: string, buttons: string[]): Promise<void>;
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