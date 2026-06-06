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
  | { type: 'call_permission_granted' }
  | { type: 'call_permission_denied' }
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

// ============================================================================
// NODOS WHATSAPP v23.0
//
// Mapean a tipos interactivos de Meta Cloud API v23.0. Comparten el patrón
// estructural de los 7 originales: extienden FlowNodeBase (id + transitions[]).
// Canal: WhatsApp únicamente. El cableado runtime en FlowInterpreter vive en
// el Prompt 3 (hoy son placeholders que retornan []).
// ============================================================================

/**
 * Mensaje con botón Call-to-Action que abre una URL externa.
 * Canal: WhatsApp. Mapea a interactive type "cta_url".
 *
 * Límites Meta v23.0:
 * - header (opcional): text ≤60 chars | image/video/document = link https
 * - body ≤1024 chars
 * - footer ≤60 chars
 * - button.display_text ≤20 chars
 * - button.url = https://, ≤2000 chars
 *
 * Transiciones: por lo general 0-1 transiciones (default), porque el cliente
 * abre la URL en el navegador y no responde por el chat hasta más tarde.
 */
export interface SendCtaUrlNode extends FlowNodeBase {
  type: 'send_cta_url';
  content: {
    header?:
      | { type: 'text'; text: string }
      | { type: 'image'; link: string }
      | { type: 'video'; link: string }
      | { type: 'document'; link: string };
    body: string;
    footer?: string;
    button: {
      display_text: string;
      url: string;
    };
  };
}

/**
 * Mensaje con botón "Enviar ubicación". El cliente responde con un mensaje
 * tipo 'location' que el FlowInterpreter (Prompt 3) capturará.
 * Canal: WhatsApp. Mapea a interactive type "location_request_message".
 *
 * Límites Meta v23.0:
 * - body ≤1024 chars
 * - header y footer NO PERMITIDOS por Meta (enforzado con .strict() en Zod)
 */
export interface SendLocationRequestNode extends FlowNodeBase {
  type: 'send_location_request';
  content: {
    body: string;
  };
}

/**
 * Carrusel horizontal de 1-10 cards. Cada card: header media (image/video) +
 * texto + 1-2 botones (quick_reply o cta_url). Todas las cards DEBEN usar el
 * mismo tipo de botón (regla cross-card validada en FlowNodeSchema wrapper).
 * Canal: WhatsApp. Mapea a interactive type "media_carousel".
 *
 * Routing: las transiciones del nodo manejan los quick_reply via
 * { condition: { type: 'button', value: '<button_id>' }, ... } (mismo patrón
 * que send_buttons). Los cta_url no producen transición (abren navegador).
 */
export interface MediaCarouselCard {
  header: { type: 'image'; link: string } | { type: 'video'; link: string };
  body: string;
  buttons: Array<
    | { type: 'quick_reply'; id: string; title: string }
    | { type: 'cta_url'; display_text: string; url: string }
  >;
}

export interface SendMediaCarouselNode extends FlowNodeBase {
  type: 'send_media_carousel';
  content: {
    body: string;
    cards: MediaCarouselCard[];
  };
}

/**
 * Reacción emoji al último mensaje del cliente.
 * Canal: WhatsApp. Mapea a message type "reaction".
 *
 * En V1, target siempre 'last_user_message' — el message_id concreto lo
 * resuelve el FlowInterpreter en runtime. Versiones futuras pueden referenciar
 * un message_id arbitrario.
 *
 * Límites Meta v23.0:
 * - emoji: 1 cluster Unicode (puede incluir ZWJ ‍, VS ️).
 *   String vacío "" deshace la reacción.
 */
export interface SendReactionNode extends FlowNodeBase {
  type: 'send_reaction';
  content: {
    emoji: string;
    target: 'last_user_message';
  };
}

/**
 * Solicita permiso explícito al cliente para iniciar una llamada de WhatsApp.
 * Canal: WhatsApp. Mapea a interactive type "call_permission_request".
 *
 * Límites Meta v23.0:
 * - body ≤1024 chars
 * - footer ≤60 chars
 */
export interface RequestCallPermissionNode extends FlowNodeBase {
  type: 'request_call_permission';
  content: {
    body: string;
    footer?: string;
  };
}

/**
 * Lanza un WhatsApp Flow (formulario multipantalla) publicado en Meta
 * Business Manager. Los datos del formulario llegan vía webhook.
 * Canal: WhatsApp. Mapea a interactive type "flow".
 *
 * whatsapp_flow_id es UUID interno (FK a la futura tabla `whatsapp_flows`
 * del Prompt 4). El FlowInterpreter (Prompt 3) lo resuelve a flow_id_meta
 * en runtime. La validación de existencia de la FK se hace a nivel
 * repository, no en Zod.
 *
 * Límites Meta v23.0:
 * - header (opcional) ≤60 chars
 * - body ≤1024 chars
 * - footer (opcional) ≤60 chars
 * - flow_cta ≤20 chars
 * - mode: 'draft' (testing) | 'published' (producción)
 */
export interface SendWhatsappFlowNode extends FlowNodeBase {
  type: 'send_whatsapp_flow';
  content: {
    header?: string;
    body: string;
    footer?: string;
    whatsapp_flow_id: string;
    flow_cta: string;
    mode: 'draft' | 'published';
    flow_action?: 'navigate' | 'data_exchange';
    flow_action_payload?: {
      screen?: string;
      data?: Record<string, unknown>;
    };
  };
}

// ============================================================================
// UNION DE NODOS
// ============================================================================

export type FlowNode =
  | SendTextNode
  | SendButtonsNode
  | SendListNode
  | SendMediaNode
  | SendCtaUrlNode
  | SendLocationRequestNode
  | SendMediaCarouselNode
  | SendReactionNode
  | WaitInputNode
  | EscapeToHumanNode
  | RequestCallPermissionNode
  | EndNode
  | SendWhatsappFlowNode;

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