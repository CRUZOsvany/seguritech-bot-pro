/**
 * Representa un mensaje recibido del usuario
 * Esta es una entidad del dominio, independiente de cualquier framework
 */
export interface Message {
  id: string;
  tenantId: string;
  from: string;
  content: string;
  timestamp: Date;
  metaMessageId?: string;
}

/**
 * Representa un usuario del chatbot.
 * Mantiene el estado conversacional y siempre asociado a un tenant.
 *
 * Campos legacy (Sprint A): currentState. Su único consumidor era el
 * HandleMessageUseCase, eliminado en ADR-012 (la fallback a la FSM
 * hardcodeada se desconectó en Sprint 6 y el código muerto se borró después).
 * El campo y la columna current_state quedan pendientes de remoción en
 * Sprint 7 (requiere migración de DB).
 *
 * Campos de Sprint B: currentNodeId y context. Mapean a las columnas
 * current_node_id y context jsonb de bot_users (migración 002). Quedan
 * opcionales porque usuarios pre-Sprint-B pueden no tenerlos hasta que
 * la migración 003 los rellene.
 */
export interface User {
  id: string;
  tenantId: string;
  phoneNumber: string;
  currentState: UserState;
  currentNodeId?: string;
  context?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Estados posibles de la conversación
 */
export enum UserState {
  INITIAL = 'initial',
  MENU = 'menu',
  VIEWING_PRODUCTS = 'viewing_products',
  MAKING_ORDER = 'making_order',
  CONFIRMING_ORDER = 'confirming_order',
}

/**
 * Tono del bot, usado para ajustar la formalidad de respuestas
 */
export enum BotTone {
  FORMAL = 'formal',
  AMIGABLE = 'amigable',
  DIRECTO = 'directo',
}

/**
 * Item del catálogo de productos del tenant
 */
export interface CatalogItem {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  available: boolean;
}

/**
 * Configuración del bot por tenant.
 * Cargada desde bot_configurations + catalog_items en Supabase.
 */
export interface TenantConfig {
  tenantId: string;
  botName: string;
  nombreNegocio: string;
  tone: BotTone;
  welcomeMessage: string;
  menuMessage: string;
  outOfHoursMessage: string;
  notUnderstoodMessage: string;
  orderConfirmationMessage: string;
  catalog: CatalogItem[];
  /** WhatsApp del dueño (owner_data.whatsapp_dueno) para avisos de leads. Opcional. */
  ownerPhone?: string;
}

/**
 * Representa un producto disponible (legacy — usar CatalogItem)
 */
export interface Product {
  id: string;
  tenantId: string;
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
  tenantId: string;
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

// ============================================================================
// Flow types (Sprint A — re-export desde flow.ts)
// Convención: entidades nuevas viven en archivos separados; las viejas
// permanecen inline en este archivo por backwards-compat.
// ============================================================================
export * from './flow';

// ============================================================================
// POS module (Sprint 5.1a — re-export desde pos/)
// Entidades del Punto de Venta. Viven en subcarpeta para no contaminar el
// espacio plano de entidades legacy.
// ============================================================================
export * from './pos';