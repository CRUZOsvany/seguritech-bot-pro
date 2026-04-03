/**
 * Representa un mensaje recibido del usuario
 * Esta es una entidad del dominio, independiente de cualquier framework
 */
export interface Message {
  id: string;
  from: string;
  content: string;
  timestamp: Date;
}

/**
 * Representa un usuario del chatbot
 * Mantiene el estado conversacional
 */
export interface User {
  id: string;
  phoneNumber: string;
  currentState: UserState;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Estados posibles del usuario en la conversación
 */
export enum UserState {
  INITIAL = 'initial',
  MENU = 'menu',
  VIEWING_PRODUCTS = 'viewing_products',
  MAKING_ORDER = 'making_order',
  CONFIRMING_ORDER = 'confirming_order',
}

/**
 * Representa un producto disponible
 */
export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  available: boolean;
}

/**
 * Representa un pedido del cliente
 */
export interface Order {
  id: string;
  userId: string;
  productId: string;
  quantity: number;
  totalPrice: number;
  status: OrderStatus;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Estados posibles de un pedido
 */
export enum OrderStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

/**
 * Respuesta del chatbot
 */
export interface BotResponse {
  message: string;
  buttons?: string[];
  nextState?: UserState;
}
