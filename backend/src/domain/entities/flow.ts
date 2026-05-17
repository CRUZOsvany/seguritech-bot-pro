/**
 * Contrato JSON del motor de flujos (Sprint A).
 *
 * Representa un grafo dirigido de nodos que el intérprete (Sprint B) recorre
 * en runtime para producir respuestas conversacionales por tenant.
 *
 * Validación a nivel BD: los CHECK de Postgres en bot_flows / flow_templates
 * verifican que el JSON sea objeto y tenga las claves obligatorias.
 * Validación profunda con Zod se agrega en Sprint B / Sprint D.
 */

// ============================================================================
// VARIABLES INTERPOLADAS RECONOCIDAS EN V1
// ============================================================================

/**
 * Claves de variables que el motor (Sprint B) resuelve al renderizar un nodo.
 * Algunas vienen de bot_configurations (estáticas), otras de bot_users.context
 * (dinámicas, capturadas durante la conversación).
 */
export type FlowVariableKey =
  // Estáticas (bot_configurations)
  | 'nombre_bot'
  | 'nombre_negocio'
  | 'welcome_message'
  | 'menu_message'
  | 'out_of_hours_message'
  | 'not_understood_message'
  | 'order_confirmation_message'
  // Dinámicas (resueltas en runtime)
  | 'catalog_listing'
  | 'selected_product_id'
  | 'selected_product_name'
  | 'selected_product_price'
  | 'order_id'
  | 'phone'
  | 'last_message';

// ============================================================================
// FUENTES DINÁMICAS DE ITEMS (literal union, NO string libre)
// ============================================================================

/**
 * Fuentes válidas para secciones dinámicas de send_list.
 * Agregar nuevas fuentes requiere cambio deliberado de este tipo.
 */
export type ItemsSource = 'catalog_items';

// ============================================================================
// TRANSICIONES
// ============================================================================

/**
 * Tipos de condición de transición.
 *
 * ORDEN DE EVALUACIÓN: el motor evalúa transitions[] en el orden del array.
 * La primera que matchea, gana (first-match-wins). Por convención `default`
 * va al final.
 *
 * En nodos send_list mixtos (sección estática + sección dinámica), los
 * `list_item` específicos DEBEN ir antes que `list_item_any`, de lo contrario
 * el any se traga las opciones específicas. Ver FLOW_SCHEMA.md.
 */
export type TransitionCondition =
  | { type: 'button'; value: string }
  | { type: 'list_item'; value: string }
  | { type: 'list_item_any'; save_to_context?: FlowVariableKey | string }
  | { type: 'keyword'; values: string[] }
  | { type: 'default' };

export interface Transition {
  condition: TransitionCondition;
  next_node_id: string;
}

// ============================================================================
// SECCIONES DE LISTA (discriminated union)
// ============================================================================

export interface ListItem {
  id: string;
  title: string; // <= 24 chars (regla Meta)
  description?: string; // <= 72 chars
}

/**
 * Sección de send_list. Discriminator explícito por `type`:
 * - 'static': items literales en el JSON.
 * - 'dynamic': items inyectados por el motor en runtime desde una fuente
 *              externa (catalog_items, etc).
 */
export type ListSection =
  | {
      type: 'static';
      title: string;
      items: ListItem[]; // 1..10 items totales sumando todas las secciones
    }
  | {
      type: 'dynamic';
      title: string;
      items_source: ItemsSource;
    };

// ============================================================================
// NODOS (discriminated union por `type`)
// ============================================================================

export interface FlowNodeBase {
  id: string;
  transitions: Transition[];
}

export interface SendTextNode extends FlowNodeBase {
  type: 'send_text';
  content: { text: string };
}

export interface SendButtonsNode extends FlowNodeBase {
  type: 'send_buttons';
  content: {
    text: string;
    buttons: Array<{ id: string; title: string }>; // 1..3, title <= 20 chars
  };
}

export interface SendListNode extends FlowNodeBase {
  type: 'send_list';
  content: {
    text: string;
    button_label: string; // <= 20 chars
    sections: ListSection[];
  };
}

export type SendMediaContent =
  | { media_type: 'image'; url: string; caption?: string }
  | {
      media_type: 'location';
      latitude: number;
      longitude: number;
      name?: string;
      address?: string;
    }
  | {
      media_type: 'document';
      url: string;
      filename: string; // <= 240 chars (Meta), aparece al lado del ícono PDF
      caption?: string; // <= 1024 chars
    };

export interface SendMediaNode extends FlowNodeBase {
  type: 'send_media';
  content: SendMediaContent;
}

export interface WaitInputNode extends FlowNodeBase {
  type: 'wait_input';
  content: {
    prompt?: string;
    save_to_context?: FlowVariableKey | string;
  };
}

export interface EscapeToHumanNode extends FlowNodeBase {
  type: 'escape_to_human';
  content: {
    user_response: string;
    owner_alert_template: string;
  };
}

export interface EndNode extends FlowNodeBase {
  type: 'end';
  content: Record<string, never>; // {} vacío
  transitions: []; // siempre vacío
}

export type FlowNode =
  | SendTextNode
  | SendButtonsNode
  | SendListNode
  | SendMediaNode
  | WaitInputNode
  | EscapeToHumanNode
  | EndNode;

// ============================================================================
// FLOW (raíz)
// ============================================================================

export interface BotFlow {
  version: '1.0';
  start_node_id: string;
  nodes: FlowNode[];
}

// ============================================================================
// FILAS DE BD (representación de las tablas)
// ============================================================================

export type FlowTemplateGiro =
  | 'all'
  | 'ferreteria'
  | 'papeleria'
  | 'cerrajeria'
  | 'pizzeria'
  | 'salon'
  | 'medico'
  | 'refaccionaria'
  | 'farmacia'
  | 'otro';

export interface FlowTemplateRow {
  id: string;
  slug: string;
  giro: FlowTemplateGiro;
  nombre: string;
  descripcion: string | null;
  json_definition: BotFlow;
  es_default: boolean;
  version: string;
  created_at: string;
  updated_at: string;
}

export interface BotFlowRow {
  id: string;
  tenant_id: string;
  nombre: string;
  json_definition: BotFlow;
  is_active: boolean;
  source_template_id: string | null;
  version: string;
  created_at: string;
  updated_at: string;
}