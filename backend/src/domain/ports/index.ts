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