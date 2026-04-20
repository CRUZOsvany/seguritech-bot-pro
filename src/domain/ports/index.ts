
import { User } from '../entities';

/**
 * Puerto para persistencia de usuario
 * Define el contrato que cualquier adaptador de base de datos debe cumplir
 * IMPORTANTE: Todos los métodos deben aceptar tenantId para garantizar aislamiento
 */
export interface UserRepository {
  save(user: User): Promise<void>;
  findById(tenantId: string, id: string): Promise<User | null>;
  findByPhoneNumber(tenantId: string, phoneNumber: string): Promise<User | null>;
  update(user: User): Promise<void>;
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
 * Puerto para notificaciones
 * Permite enviar notificaciones sin acoplarse a un medio específico
 */
export interface NotificationPort {
  sendMessage(phoneNumber: string, message: string): Promise<void>;
  sendButtons(phoneNumber: string, message: string, buttons: string[]): Promise<void>;
}
