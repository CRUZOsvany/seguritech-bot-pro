import type pino from 'pino';
import type {
  BotFlow,
  FlowNode,
  Transition,
  TransitionCondition,
  ListItem,
} from '@/domain/entities/flow';
import type { User, Message, TenantConfig } from '@/domain/entities';
import { VariableResolver } from '@/domain/services/VariableResolver';
import { DynamicSectionResolver } from '@/domain/services/DynamicSectionResolver';

// ============================================================================
// TIPOS DE OUTPUT (lo que el interpreter le devuelve al BotController)
// ============================================================================

export type InterpreterOutput =
  | { kind: 'text'; text: string }
  | { kind: 'buttons'; text: string; buttons: { id: string; title: string }[] }
  | {
      kind: 'list';
      text: string;
      buttonLabel: string;
      sections: Array<{ title: string; items: ListItem[] }>;
    }
  | { kind: 'image'; url: string; caption?: string }
  | {
      kind: 'location';
      latitude: number;
      longitude: number;
      name?: string;
      address?: string;
    }
  | {
      kind: 'document';
      url: string;
      filename: string;
      caption?: string;
    }
  | { kind: 'escape_to_human'; userResponse: string; ownerAlert: string }
  // ---- Nuevos v23.0 ----
  | {
      kind: 'cta_url';
      body: string;
      button: { display_text: string; url: string };
      header?: { type: 'text'; text: string } | { type: 'image' | 'video' | 'document'; link: string };
      footer?: string;
    }
  | { kind: 'location_request'; body: string }
  | {
      kind: 'media_carousel';
      body: string;
      cards: Array<{
        header: { type: 'image' | 'video'; link: string };
        body: string;
        buttons: Array<
          | { type: 'quick_reply'; id: string; title: string }
          | { type: 'cta_url'; display_text: string; url: string }
        >;
      }>;
    }
  | { kind: 'reaction'; emoji: string; target: 'last_user_message' }
  | { kind: 'call_permission_request'; body: string; footer?: string }
  | {
      kind: 'whatsapp_flow';
      body: string;
      flow_id_meta: string;
      flow_cta: string;
      header?: string;
      footer?: string;
      mode: 'draft' | 'published';
      flow_action?: 'navigate' | 'data_exchange';
      flow_action_payload?: { screen?: string; data?: Record<string, unknown> };
    };

export interface InterpreterResult {
  outputs: InterpreterOutput[];
  nextNodeId: string;
  contextUpdates: Record<string, unknown>;
  flowEnded: boolean;
}

// ============================================================================
// CONSTANTES
// ============================================================================

const ESCAPE_WORDS = ['menu', 'salir', 'cancelar', 'inicio'] as const;

// Nodos que esperan input del usuario (paran el avance del intérprete).
// request_call_permission espera la respuesta de permiso (granted/denied).
// Los demás v23.0 (cta_url, carousel, reaction, location_request, whatsapp_flow)
// NO paran: el usuario puede responder más tarde o no responder.
const WAIT_NODE_TYPES = new Set([
  'send_buttons',
  'send_list',
  'wait_input',
  'request_call_permission',
]);

// ============================================================================
// INTERPRETER
// ============================================================================

export class FlowInterpreter {
  constructor(
    private readonly variableResolver: VariableResolver,
    private readonly dynamicSectionResolver: DynamicSectionResolver,
    private readonly logger: pino.Logger,
  ) {}

  async execute(params: {
    flow: BotFlow;
    user: User;
    message: Message;
    tenantConfig: TenantConfig;
  }): Promise<InterpreterResult> {
    const { flow, user, message, tenantConfig } = params;
    const contextUpdates: Record<string, unknown> = {};

    // Caso 1: palabra de escape global → reset al start del flow
    if (this.isEscapeWord(message.content)) {
      this.logger.debug(
        { tenantId: user.tenantId, content: message.content },
        'Escape word detectado',
      );
      const cleared: Record<string, unknown> = {};
      for (const k of Object.keys(user.context ?? {})) cleared[k] = null;
      Object.assign(contextUpdates, cleared);

      return this.advanceFrom({
        flow,
        startNodeId: flow.start_node_id,
        user: { ...user, context: {} },
        message,
        tenantConfig,
        contextUpdates,
      });
    }

    // Caso 2: usuario nuevo, sin currentNodeId, o nodo desconocido → start
    const currentNode = flow.nodes.find((n) => n.id === user.currentNodeId);
    if (!user.currentNodeId || !currentNode || user.currentNodeId === 'end') {
      return this.advanceFrom({
        flow,
        startNodeId: flow.start_node_id,
        user,
        message,
        tenantConfig,
        contextUpdates,
      });
    }

    // Caso 3: estamos en un nodo que estaba esperando input. Evaluar transición.
    const transition = this.evaluateTransitions(currentNode, message);

    // save_to_context para wait_input
    if (currentNode.type === 'wait_input' && currentNode.content.save_to_context) {
      contextUpdates[currentNode.content.save_to_context] = message.content;
    }

    // save_to_context para list_item_any
    if (
      transition &&
      transition.condition.type === 'list_item_any' &&
      transition.condition.save_to_context
    ) {
      const itemId = this.extractListItemId(currentNode, message);
      if (itemId) contextUpdates[transition.condition.save_to_context] = itemId;
    }

    if (!transition) {
      this.logger.warn(
        { tenantId: user.tenantId, currentNodeId: user.currentNodeId, content: message.content },
        'Ninguna transición matchea, re-renderizando nodo',
      );
      const outputs = await this.renderNode(currentNode, {
        flow,
        user: { ...user, context: { ...user.context, ...contextUpdates } },
        message,
        tenantConfig,
      });
      return {
        outputs,
        nextNodeId: currentNode.id,
        contextUpdates,
        flowEnded: false,
      };
    }

    return this.advanceFrom({
      flow,
      startNodeId: transition.next_node_id,
      user: { ...user, context: { ...user.context, ...contextUpdates } },
      message,
      tenantConfig,
      contextUpdates,
    });
  }

  // ==========================================================================
  // AVANCE NODO A NODO
  // ==========================================================================

  private async advanceFrom(params: {
    flow: BotFlow;
    startNodeId: string;
    user: User;
    message: Message;
    tenantConfig: TenantConfig;
    contextUpdates: Record<string, unknown>;
  }): Promise<InterpreterResult> {
    const { flow, message, tenantConfig } = params;
    let user = params.user;
    const contextUpdates = params.contextUpdates;
    let currentId = params.startNodeId;
    const outputs: InterpreterOutput[] = [];
    const visited = new Set<string>();

    while (true) {
      if (visited.has(currentId)) {
        this.logger.error(
          { tenantId: user.tenantId, currentId },
          'Ciclo detectado sin nodo de espera, abortando',
        );
        return {
          outputs,
          nextNodeId: currentId,
          contextUpdates,
          flowEnded: false,
        };
      }
      visited.add(currentId);

      const node = flow.nodes.find((n) => n.id === currentId);
      if (!node) {
        this.logger.error({ tenantId: user.tenantId, currentId }, 'Nodo no encontrado');
        return {
          outputs,
          nextNodeId: flow.start_node_id,
          contextUpdates,
          flowEnded: false,
        };
      }

      // Generar order_id si el nodo lo necesita (lazy)
      const generatedOrderId = this.maybeGenerateOrderId(node);
      if (generatedOrderId && !contextUpdates['order_id']) {
        contextUpdates['order_id'] = generatedOrderId;
        user = { ...user, context: { ...user.context, order_id: generatedOrderId } };
      }

      const rendered = await this.renderNode(node, {
        flow,
        user,
        message,
        tenantConfig,
      });

      // Caso especial: send_list que resuelve a 0 items totales → default
      if (node.type === 'send_list' && rendered.length === 1 && rendered[0].kind === 'list') {
        const totalItems = rendered[0].sections.reduce(
          (acc, s) => acc + s.items.length,
          0,
        );
        if (totalItems === 0) {
          this.logger.warn(
            { tenantId: user.tenantId, nodeId: node.id },
            'send_list resolvió a 0 items totales, transicionando al default',
          );
          const def = node.transitions.find((t) => t.condition.type === 'default');
          if (!def) {
            this.logger.error(
              { tenantId: user.tenantId, nodeId: node.id },
              'send_list vacío sin transición default — abortando',
            );
            return { outputs, nextNodeId: node.id, contextUpdates, flowEnded: false };
          }
          currentId = def.next_node_id;
          continue;
        }
      }

      outputs.push(...rendered);

      if (WAIT_NODE_TYPES.has(node.type)) {
        return {
          outputs,
          nextNodeId: node.id,
          contextUpdates,
          flowEnded: false,
        };
      }

      if (node.type === 'end') {
        return {
          outputs,
          nextNodeId: 'end',
          contextUpdates,
          flowEnded: true,
        };
      }

      const next = node.transitions[0];
      if (!next) {
        this.logger.warn(
          { tenantId: user.tenantId, nodeId: node.id },
          'Nodo sin transiciones, terminando flow',
        );
        return { outputs, nextNodeId: node.id, contextUpdates, flowEnded: true };
      }
      currentId = next.next_node_id;
    }
  }

  // ==========================================================================
  // EVALUACIÓN DE TRANSICIONES (first-match-wins)
  // ==========================================================================

  private evaluateTransitions(node: FlowNode, message: Message): Transition | null {
    for (const t of node.transitions) {
      if (this.matchesCondition(t.condition, node, message)) {
        return t;
      }
    }
    return null;
  }

  private matchesCondition(
    condition: TransitionCondition,
    node: FlowNode,
    message: Message,
  ): boolean {
    const content = message.content.trim();
    const lower = content.toLowerCase();

    switch (condition.type) {
    case 'default':
      return true;

    case 'keyword':
      return condition.values.some((kw) => lower.includes(kw.toLowerCase()));

    case 'button': {
      if (node.type !== 'send_buttons') return false;
      if (content === condition.value) return true;
      const btn = node.content.buttons.find((b) => b.id === condition.value);
      if (!btn) return false;
      return lower === btn.title.toLowerCase();
    }

    case 'list_item': {
      if (node.type !== 'send_list') return false;
      if (content === condition.value) return true;
      for (const s of node.content.sections) {
        if (s.type === 'static') {
          const it = s.items.find((i) => i.id === condition.value);
          if (it && lower === it.title.toLowerCase()) return true;
        }
      }
      return false;
    }

    case 'list_item_any': {
      if (node.type !== 'send_list') return false;
      for (const s of node.content.sections) {
        if (s.type === 'static') {
          for (const it of s.items) {
            if (content === it.id) return true;
            if (lower === it.title.toLowerCase()) return true;
          }
        }
        if (s.type === 'dynamic') return true;
      }
      return false;
    }

    case 'call_permission_granted':
      return message.content === '__CALL_PERMISSION_GRANTED__';

    case 'call_permission_denied':
      return message.content === '__CALL_PERMISSION_DENIED__';
    }
  }

  private extractListItemId(node: FlowNode, message: Message): string | null {
    if (node.type !== 'send_list') return null;
    const content = message.content.trim();
    const lower = content.toLowerCase();

    for (const s of node.content.sections) {
      if (s.type === 'static') {
        for (const it of s.items) {
          if (content === it.id) return it.id;
          if (lower === it.title.toLowerCase()) return it.id;
        }
      }
    }
    // Dynamic: el content puede ser el id directo (Meta interactive list reply)
    // o el title del producto. Devolvemos content tal cual; el VariableResolver
    // hará el lookup en TenantConfig.catalog.
    return content;
  }

  // ==========================================================================
  // RENDERIZADO DE NODOS
  // ==========================================================================

  private async renderNode(
    node: FlowNode,
    p: {
      flow: BotFlow;
      user: User;
      message: Message;
      tenantConfig: TenantConfig;
    },
  ): Promise<InterpreterOutput[]> {
    const resolveText = (t: string) =>
      this.variableResolver.resolve(t, {
        tenantId: p.user.tenantId,
        tenantConfig: p.tenantConfig,
        user: p.user,
        message: p.message,
        generatedOrderId: (p.user.context?.order_id as string) ?? undefined,
      });

    switch (node.type) {
    case 'send_text': {
      const text = await resolveText(node.content.text);
      return [{ kind: 'text', text }];
    }

    case 'send_buttons': {
      const text = await resolveText(node.content.text);
      const buttons = await Promise.all(
        node.content.buttons.map(async (b) => ({
          id: b.id,
          title: await resolveText(b.title),
        })),
      );
      return [{ kind: 'buttons', text, buttons }];
    }

    case 'send_list': {
      const text = await resolveText(node.content.text);
      const buttonLabel = await resolveText(node.content.button_label);
      const hydratedSections = this.dynamicSectionResolver.resolve(
        node.content.sections,
        p.tenantConfig,
      );
      const nonEmpty = hydratedSections.filter((s) => s.items.length > 0);
      return [
        {
          kind: 'list',
          text,
          buttonLabel,
          sections: nonEmpty,
        },
      ];
    }

    case 'send_media': {
      if (node.content.media_type === 'image') {
        const caption = node.content.caption
          ? await resolveText(node.content.caption)
          : undefined;
        return [{ kind: 'image', url: node.content.url, caption }];
      }

      if (node.content.media_type === 'document') {
        const caption = node.content.caption
          ? await resolveText(node.content.caption)
          : undefined;
        return [
          {
            kind: 'document',
            url: node.content.url,
            filename: node.content.filename,
            caption,
          },
        ];
      }

      // media_type === 'location'
      return [
        {
          kind: 'location',
          latitude: node.content.latitude,
          longitude: node.content.longitude,
          name: node.content.name,
          address: node.content.address,
        },
      ];
    }

    case 'wait_input': {
      if (node.content.prompt) {
        const text = await resolveText(node.content.prompt);
        return [{ kind: 'text', text }];
      }
      return [];
    }

    case 'escape_to_human': {
      const userResponse = await resolveText(node.content.user_response);
      const ownerAlert = await resolveText(node.content.owner_alert_template);
      return [{ kind: 'escape_to_human', userResponse, ownerAlert }];
    }

    case 'end':
      return [];

    // ------------------------------------------------------------------------
    // Tipos WhatsApp v23.0 (Prompt 3) — cableado real
    // ------------------------------------------------------------------------
    case 'send_cta_url': {
      const body = await resolveText(node.content.body);
      const button = {
        display_text: node.content.button.display_text.slice(0, 20),
        url: node.content.button.url,
      };
      let resolvedHeader:
        | { type: 'text'; text: string }
        | { type: 'image' | 'video' | 'document'; link: string }
        | undefined;
      if (node.content.header) {
        const h = node.content.header;
        resolvedHeader = h.type === 'text'
          ? { type: 'text' as const, text: await resolveText(h.text) }
          : { type: h.type, link: h.link };
      }
      const footer = node.content.footer ? await resolveText(node.content.footer) : undefined;
      const output: InterpreterOutput = {
        kind: 'cta_url',
        body,
        button,
        ...(resolvedHeader ? { header: resolvedHeader } : {}),
        ...(footer ? { footer } : {}),
      };
      return [output];
    }

    case 'send_location_request': {
      const body = await resolveText(node.content.body);
      return [{ kind: 'location_request', body }];
    }

    case 'send_media_carousel': {
      const body = await resolveText(node.content.body);
      const cards = await Promise.all(
        node.content.cards.map(async (card) => ({
          header: card.header,
          body: await resolveText(card.body),
          buttons: await Promise.all(
            card.buttons.map(async (btn) => {
              if (btn.type === 'quick_reply') {
                return {
                  type: 'quick_reply' as const,
                  id: btn.id,
                  title: await resolveText(btn.title),
                };
              }
              return {
                type: 'cta_url' as const,
                display_text: await resolveText(btn.display_text),
                url: btn.url,
              };
            }),
          ),
        })),
      );
      return [{ kind: 'media_carousel', body, cards }];
    }

    case 'send_reaction': {
      return [
        {
          kind: 'reaction',
          emoji: node.content.emoji,
          target: node.content.target,
        },
      ];
    }

    case 'request_call_permission': {
      const body = await resolveText(node.content.body);
      const footer = node.content.footer ? await resolveText(node.content.footer) : undefined;
      return [
        {
          kind: 'call_permission_request',
          body,
          ...(footer ? { footer } : {}),
        },
      ];
    }

    case 'send_whatsapp_flow': {
      const body = await resolveText(node.content.body);
      const header = node.content.header ? await resolveText(node.content.header) : undefined;
      const footer = node.content.footer ? await resolveText(node.content.footer) : undefined;
      return [
        {
          kind: 'whatsapp_flow',
          body,
          flow_id_meta: node.content.whatsapp_flow_id,
          flow_cta: node.content.flow_cta,
          mode: node.content.mode,
          ...(header ? { header } : {}),
          ...(footer ? { footer } : {}),
          ...(node.content.flow_action ? { flow_action: node.content.flow_action } : {}),
          ...(node.content.flow_action_payload
            ? { flow_action_payload: node.content.flow_action_payload }
            : {}),
        },
      ];
    }
    }
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  private isEscapeWord(content: string): boolean {
    const trimmed = content.trim().toLowerCase();
    return (ESCAPE_WORDS as readonly string[]).includes(trimmed);
  }

  private maybeGenerateOrderId(node: FlowNode): string | null {
    const contentJson = JSON.stringify(node.content ?? {});
    if (!contentJson.includes('{{order_id}}')) return null;
    const ts = Date.now().toString(36).toUpperCase();
    const rnd = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `${ts}-${rnd}`;
  }
}