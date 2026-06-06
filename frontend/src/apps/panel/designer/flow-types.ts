/**
 * Espejo EXACTO del contrato `BotFlow` del backend
 * (backend/src/domain/entities/flow.ts).
 *
 * DEC-3: se ESPEJA aquí en lugar de importarse del backend porque hoy no hay
 * path de tipos compartido entre workspaces. Si el backend cambia el contrato,
 * este archivo se actualiza a mano. La validación profunda (límites Meta) la
 * hace el backend al publicar (DEC-4); aquí solo se modela la forma.
 */

export type ItemsSource = 'catalog_items';

export type TransitionCondition =
  | { type: 'button'; value: string }
  | { type: 'list_item'; value: string }
  | { type: 'list_item_any'; save_to_context?: string }
  | { type: 'keyword'; values: string[] }
  | { type: 'call_permission_granted' }
  | { type: 'call_permission_denied' }
  | { type: 'default' };

export interface Transition {
  condition: TransitionCondition;
  next_node_id: string;
}

export interface ListItem {
  id: string;
  title: string;
  description?: string;
}

export type ListSection =
  | { type: 'static'; title: string; items: ListItem[] }
  | { type: 'dynamic'; title: string; items_source: ItemsSource };

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
  content: { text: string; buttons: Array<{ id: string; title: string }> }; // 1..3, title <= 20
}
export interface SendListNode extends FlowNodeBase {
  type: 'send_list';
  content: { text: string; button_label: string; sections: ListSection[] }; // items <= 10 total, title <= 24
}
export type SendMediaContent =
  | { media_type: 'image'; url: string; caption?: string }
  | { media_type: 'location'; latitude: number; longitude: number; name?: string; address?: string }
  | { media_type: 'document'; url: string; filename: string; caption?: string };
export interface SendMediaNode extends FlowNodeBase {
  type: 'send_media';
  content: SendMediaContent;
}
export interface WaitInputNode extends FlowNodeBase {
  type: 'wait_input';
  content: { prompt?: string; save_to_context?: string };
}
export interface EscapeToHumanNode extends FlowNodeBase {
  type: 'escape_to_human';
  content: { user_response: string; owner_alert_template: string };
}
export interface EndNode extends FlowNodeBase {
  type: 'end';
  content: Record<string, never>;
  transitions: [];
}

// ============================================================================
// NODOS WHATSAPP v23.0 — espejo de backend/src/domain/entities/flow.ts
// DEC-3: se mantiene sincronizado manualmente. La validación profunda
// (límites Meta) la hace el backend al publicar.
// ============================================================================

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

export interface SendLocationRequestNode extends FlowNodeBase {
  type: 'send_location_request';
  content: {
    body: string;
  };
}

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

export interface SendReactionNode extends FlowNodeBase {
  type: 'send_reaction';
  content: {
    emoji: string;
    target: 'last_user_message';
  };
}

export interface RequestCallPermissionNode extends FlowNodeBase {
  type: 'request_call_permission';
  content: {
    body: string;
    footer?: string;
  };
}

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

export type FlowNode =
  | SendTextNode
  | SendButtonsNode
  | SendListNode
  | SendMediaNode
  | WaitInputNode
  | EscapeToHumanNode
  | EndNode
  | SendCtaUrlNode
  | SendLocationRequestNode
  | SendMediaCarouselNode
  | SendReactionNode
  | RequestCallPermissionNode
  | SendWhatsappFlowNode;

export type FlowNodeType = FlowNode['type'];

export interface BotFlow {
  version: '1.0';
  start_node_id: string;
  nodes: FlowNode[];
}

/** Flow vacío que carga el canvas cuando el flow no tiene draft (DEC-1/Fase 4). */
export const EMPTY_FLOW: BotFlow = {
  version: '1.0',
  start_node_id: '',
  nodes: [],
};

/**
 * Type-guard laxo: el draft del backend NO está validado (puede ser parcial).
 * Solo confirmamos la forma mínima para poder renderizar sin reventar.
 */
export function isBotFlowish(value: unknown): value is BotFlow {
  if (value == null || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return Array.isArray(v.nodes) && typeof v.start_node_id === 'string';
}
