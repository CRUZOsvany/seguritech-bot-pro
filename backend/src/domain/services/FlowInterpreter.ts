import type pino from 'pino';
import type {
  BotFlow,
  FlowNode,
  Transition,
  TransitionCondition,
  ListItem,
} from '@/domain/entities/flow';
import type { User, Message, TenantConfig } from '@/domain/entities';
import type { PosProduct } from '@/domain/entities/pos/Product';
import { VariableResolver } from '@/domain/services/VariableResolver';
import { DynamicSectionResolver } from '@/domain/services/DynamicSectionResolver';
import { CarouselCardResolver } from '@/domain/services/CarouselCardResolver';
import { ServiceDirectoryMatcher } from '@/domain/services/ServiceDirectoryMatcher';
import { CatalogSearchService } from '@/domain/services/CatalogSearchService';
import { fuzzyIncludes } from '@/domain/services/textMatch';
import type { DecisionStep } from '@/domain/conversation/trace';

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
  /**
   * Por qué el intérprete hizo lo que hizo, en orden. Solo lectura: no altera
   * ninguna decisión. execute() siempre la llena; es opcional en el tipo para
   * que los dobles de prueba anteriores a la Fase 1 sigan compilando.
   */
  trace?: DecisionStep[];
}

// ============================================================================
// CONSTANTES
// ============================================================================

const ESCAPE_WORDS = ['menu', 'salir', 'cancelar', 'inicio'] as const;

// Nodos que SIEMPRE esperan input del usuario (paran el avance del intérprete).
// request_call_permission espera la respuesta de permiso (granted/denied).
// Los demás v23.0 (cta_url, reaction, location_request, whatsapp_flow) NO
// paran: el usuario puede responder más tarde o no responder.
//
// send_media_carousel NO está aquí porque su espera es condicional — depende
// del tipo de botón de sus cards. Ver isWaitNode().
const WAIT_NODE_TYPES = new Set([
  'send_buttons',
  'send_list',
  'wait_input',
  'search_catalog',
  'request_call_permission',
]);

// ============================================================================
// INTERPRETER
// ============================================================================

export class FlowInterpreter {
  constructor(
    private readonly variableResolver: VariableResolver,
    private readonly dynamicSectionResolver: DynamicSectionResolver,
    private readonly carouselCardResolver: CarouselCardResolver,
    private readonly serviceDirectoryMatcher: ServiceDirectoryMatcher,
    private readonly catalogSearchService: CatalogSearchService,
    private readonly logger: pino.Logger,
  ) {}

  async execute(params: {
    flow: BotFlow;
    user: User;
    message: Message;
    tenantConfig: TenantConfig;
    /**
     * Genera el folio de {{order_id}}. ConversationEngine siempre lo pasa
     * (IdGenerator); los llamadores viejos que no lo pasan conservan el
     * generador de siempre, basado en la hora y Math.random.
     */
    orderIdFactory?: () => string;
  }): Promise<InterpreterResult> {
    const { flow, user, message, tenantConfig } = params;
    const orderIdFactory = params.orderIdFactory ?? legacyOrderId;
    const contextUpdates: Record<string, unknown> = {};
    const trace: DecisionStep[] = [];

    // Nodo actual, resuelto una sola vez (antes se recalculaba en Caso 2;
    // ahora también lo necesita Caso 1 para el fix de precedencia de abajo).
    const currentNode = flow.nodes.find((n) => n.id === user.currentNodeId);

    // Caso 1: palabra de escape global → reset al start del flow.
    //
    // FIX (depuración motor+simulador, Fase 1): antes esto corría SIEMPRE
    // antes que las transiciones propias del nodo, sin excepción. Un
    // cliente en `pedido_confirma` que escribía "cancelar" (pensando que
    // corregía la cantidad) perdía TODO el contexto del pedido y volvía al
    // menú principal, en vez de caer en la transición local
    // `{keyword: ['no','corregir','cambiar','esta mal']} → pedido_cantidad`
    // que sí preserva `selected_product_id`. Igual de grave: la transición
    // `{keyword: ['salir',...]} → despedida` de `bienvenida` era código
    // muerto para la palabra exacta "salir", porque el escape global la
    // interceptaba antes de que el nodo la evaluara.
    //
    // Regla nueva: el escape global solo aplica si el nodo actual NO tiene
    // una transición propia (que no sea 'default') para ese mensaje. Si el
    // nodo sí sabe qué hacer con él, gana la intención local — el escape
    // global vuelve a ser lo que siempre debió ser: un fallback para cuando
    // nada más matchea, no un atajo que se adelanta a todo.
    if (this.isEscapeWord(message.content)) {
      const localTransition = currentNode
        ? this.evaluateTransitions(currentNode, message, tenantConfig, {})
        : null;
      // Fix del hallazgo #1 (ejecución Fase 1): catalog_not_found es TRUE
      // por ausencia de cómputo, no porque una búsqueda real haya
      // fallado — el pre-chequeo no corre CatalogSearchService. Sin esta
      // exclusión, cualquier palabra de escape en un nodo search_catalog
      // queda absorbida como "búsqueda sin resultado" en vez de resetear.
      const nodeHandlesItLocally =
        !!localTransition &&
        localTransition.condition.type !== 'default' &&
        localTransition.condition.type !== 'catalog_not_found';

      trace.push({
        kind: 'escape_word',
        word: message.content.trim().toLowerCase(),
        handledLocally: nodeHandlesItLocally,
      });

      if (!nodeHandlesItLocally) {
        this.logger.debug(
          { tenantId: user.tenantId, content: message.content },
          'Escape word detectado (sin transición local que lo maneje mejor)',
        );
        const cleared: Record<string, unknown> = {};
        for (const k of Object.keys(user.context ?? {})) cleared[k] = null;
        Object.assign(contextUpdates, cleared);

        trace.push({ kind: 'session_start', startNodeId: flow.start_node_id, reason: 'escape_word' });
        return this.advanceFrom({
          flow,
          startNodeId: flow.start_node_id,
          user: { ...user, context: {} },
          message,
          tenantConfig,
          contextUpdates,
          trace,
          orderIdFactory,
        });
      }
      this.logger.debug(
        { tenantId: user.tenantId, nodeId: currentNode?.id, content: message.content },
        'Escape word detectado, pero el nodo actual lo maneja localmente — se respeta',
      );
      // Sin return: sigue de largo a Caso 2/3 con el flujo normal.
    }

    // Caso 2: usuario nuevo, sin currentNodeId, o nodo desconocido → start
    if (!user.currentNodeId || !currentNode || user.currentNodeId === 'end') {
      trace.push({
        kind: 'session_start',
        startNodeId: flow.start_node_id,
        reason: !user.currentNodeId
          ? 'new'
          : user.currentNodeId === 'end'
            ? 'ended'
            : 'unknown_node',
      });
      return this.advanceFrom({
        flow,
        startNodeId: flow.start_node_id,
        user,
        message,
        tenantConfig,
        contextUpdates,
        trace,
        orderIdFactory,
      });
    }

    // search_catalog: el match requiere una query real a pos_products (a
    // diferencia de service_directory_match, que compara contra un arreglo
    // ya cargado en TenantConfig) — se resuelve UNA sola vez aquí y se pasa
    // a evaluateTransitions para no duplicar el roundtrip a la BD.
    let catalogMatch: PosProduct | null = null;
    if (currentNode.type === 'search_catalog') {
      catalogMatch = await this.catalogSearchService.search(
        user.tenantId,
        message.content.trim(),
        tenantConfig.catalogSynonyms,
      );
      trace.push({
        kind: 'catalog_search',
        nodeId: currentNode.id,
        query: message.content.trim(),
        productId: catalogMatch?.id ?? null,
      });
    }

    // Validación de wait_input (depuración motor+simulador, Fase 4 — cierra
    // C-04 del tracker de auditoría). Alcance deliberadamente chico: solo
    // valida cuando el flow declara `content.validation`. Sin match, el
    // nodo se re-renderiza (mismo patrón que "ninguna transición matchea"
    // de más abajo) con `validation_error`, y el flow NO avanza ni guarda
    // nada en el contexto — el intento inválido se descarta por completo.
    if (currentNode.type === 'wait_input' && currentNode.content.validation === 'numeric') {
      const isValidNumber = /^\d+([.,]\d+)?$/.test(message.content.trim());
      trace.push({
        kind: 'validation',
        nodeId: currentNode.id,
        validator: 'numeric',
        valid: isValidNumber,
      });
      if (!isValidNumber) {
        const errorNode: FlowNode = {
          ...currentNode,
          content: {
            ...currentNode.content,
            prompt:
              currentNode.content.validation_error ??
              'No logré entender la cantidad 🤔. Escríbela solo con el número, por ejemplo: *3*',
          },
        };
        const outputs = await this.renderNode(errorNode, { flow, user, message, tenantConfig });
        trace.push({ kind: 'wait', nodeId: currentNode.id });
        return {
          outputs,
          nextNodeId: currentNode.id,
          contextUpdates,
          flowEnded: false,
          trace,
        };
      }
    }

    // Caso 3: estamos en un nodo que estaba esperando input. Evaluar transición.
    const transition = this.evaluateTransitions(
      currentNode,
      message,
      tenantConfig,
      { catalogMatch },
      trace,
    );

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
      const itemId = this.resolveListItemId(currentNode, message, tenantConfig);
      if (itemId) contextUpdates[transition.condition.save_to_context] = itemId;
    }

    // save_to_context para card_any. Igual que catalog_found, el default es
    // 'selected_product_id': en un carrusel dinámico el id del botón ES el id
    // del producto, así que {{selected_product_name}} y
    // {{selected_product_price}} resuelven sin que el flow declare nada.
    if (
      transition &&
      transition.condition.type === 'card_any'
    ) {
      const cardId = this.extractCardButtonId(currentNode, message, tenantConfig);
      if (cardId) {
        const key = transition.condition.save_to_context ?? 'selected_product_id';
        contextUpdates[key] = cardId;
      }
    }

    // save_to_context para service_directory_match
    if (
      transition &&
      transition.condition.type === 'service_directory_match' &&
      transition.condition.save_to_context
    ) {
      const match = this.serviceDirectoryMatcher.match(
        message.content.trim(),
        tenantConfig.serviceDirectory,
      );
      if (match) contextUpdates[transition.condition.save_to_context] = match.id;
    }

    // save_to_context para catalog_found. Default a 'selected_product_id'
    // cuando el flow no lo especifica — es la clave que ya resuelve
    // VariableResolver (selected_product_name/price), no hace falta que cada
    // flow la declare a mano.
    if (transition && transition.condition.type === 'catalog_found' && catalogMatch) {
      const key = transition.condition.save_to_context ?? 'selected_product_id';
      contextUpdates[key] = catalogMatch.id;
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
      trace.push({ kind: 'no_match', nodeId: currentNode.id });
      trace.push({ kind: 'wait', nodeId: currentNode.id });
      return {
        outputs,
        nextNodeId: currentNode.id,
        contextUpdates,
        flowEnded: false,
        trace,
      };
    }

    return this.advanceFrom({
      flow,
      startNodeId: transition.next_node_id,
      user: { ...user, context: { ...user.context, ...contextUpdates } },
      message,
      tenantConfig,
      contextUpdates,
      trace,
      orderIdFactory,
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
    trace: DecisionStep[];
    orderIdFactory: () => string;
  }): Promise<InterpreterResult> {
    const { flow, message, tenantConfig, trace } = params;
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
        trace.push({ kind: 'engine_error', reason: 'cycle', nodeId: currentId });
        return {
          outputs,
          nextNodeId: currentId,
          contextUpdates,
          flowEnded: false,
          trace,
        };
      }
      visited.add(currentId);

      const node = flow.nodes.find((n) => n.id === currentId);
      if (!node) {
        this.logger.error({ tenantId: user.tenantId, currentId }, 'Nodo no encontrado');
        trace.push({ kind: 'engine_error', reason: 'node_not_found', nodeId: currentId });
        return {
          outputs,
          nextNodeId: flow.start_node_id,
          contextUpdates,
          flowEnded: false,
          trace,
        };
      }
      trace.push({ kind: 'node_entered', nodeId: node.id, nodeType: node.type });

      // Generar order_id si el nodo lo necesita (lazy)
      const generatedOrderId = this.maybeGenerateOrderId(node, params.orderIdFactory);
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
            trace.push({ kind: 'auto_skip', nodeId: node.id, reason: 'empty_list', target: null });
            trace.push({ kind: 'engine_error', reason: 'empty_without_default', nodeId: node.id });
            return { outputs, nextNodeId: node.id, contextUpdates, flowEnded: false, trace };
          }
          trace.push({
            kind: 'auto_skip',
            nodeId: node.id,
            reason: 'empty_list',
            target: def.next_node_id,
          });
          currentId = def.next_node_id;
          continue;
        }
      }

      // Carrusel dinámico sin cards: catálogo vacío, o ningún producto con
      // foto y sin imagen de respaldo del tenant. Meta exige 1-10 cards, así
      // que enviarlo sería un 400 — se desvía al default igual que un
      // send_list que resuelve a 0 items.
      if (
        node.type === 'send_media_carousel' &&
        rendered.length === 1 &&
        rendered[0].kind === 'media_carousel' &&
        rendered[0].cards.length === 0
      ) {
        const def = node.transitions.find((t) => t.condition.type === 'default');
        if (!def) {
          this.logger.error(
            { tenantId: user.tenantId, nodeId: node.id },
            'Carrusel vacío sin transición default — abortando',
          );
          trace.push({ kind: 'auto_skip', nodeId: node.id, reason: 'empty_carousel', target: null });
          trace.push({ kind: 'engine_error', reason: 'empty_without_default', nodeId: node.id });
          return { outputs, nextNodeId: node.id, contextUpdates, flowEnded: false, trace };
        }
        this.logger.warn(
          { tenantId: user.tenantId, nodeId: node.id },
          'Carrusel resolvió a 0 cards, transicionando al default',
        );
        trace.push({
          kind: 'auto_skip',
          nodeId: node.id,
          reason: 'empty_carousel',
          target: def.next_node_id,
        });
        currentId = def.next_node_id;
        continue;
      }

      outputs.push(...rendered);

      if (this.isWaitNode(node)) {
        trace.push({ kind: 'wait', nodeId: node.id });
        return {
          outputs,
          nextNodeId: node.id,
          contextUpdates,
          flowEnded: false,
          trace,
        };
      }

      if (node.type === 'end') {
        trace.push({ kind: 'flow_ended', nodeId: node.id });
        return {
          outputs,
          nextNodeId: 'end',
          contextUpdates,
          flowEnded: true,
          trace,
        };
      }

      const next = node.transitions[0];
      if (!next) {
        this.logger.warn(
          { tenantId: user.tenantId, nodeId: node.id },
          'Nodo sin transiciones, terminando flow',
        );
        trace.push({ kind: 'dead_end', nodeId: node.id });
        return { outputs, nextNodeId: node.id, contextUpdates, flowEnded: true, trace };
      }
      currentId = next.next_node_id;
    }
  }

  // ==========================================================================
  // EVALUACIÓN DE TRANSICIONES (scoring por especificidad — DEC-06)
  // ==========================================================================

  /**
   * DEC-06 (auditoría 2026-08-26, hallazgo C-03): antes era first-match-wins
   * puro sobre `node.transitions[]` — el ORDEN del array decidía el
   * comportamiento del bot, invisible para quien edita el flow (mover una
   * transición tres posiciones podía cambiar la respuesta sin que nadie lo
   * notara). Ahora se evalúan TODAS las transiciones del nodo, se quedan las
   * que matchean, y gana la de mayor especificidad — el orden en el JSON ya
   * no importa salvo para desempatar entre dos transiciones del MISMO nivel
   * (ahí sí gana la que viene primero, comportamiento idéntico al de antes
   * para ese caso). Con 0 o 1 match no hay nada que rankear — mismo
   * resultado que first-match-wins, sin costo extra.
   */
  private evaluateTransitions(
    node: FlowNode,
    message: Message,
    tenantConfig: TenantConfig,
    extra?: { catalogMatch?: PosProduct | null },
    /**
     * Si viene, se registra cada transición con si coincidió y su puntaje.
     * El pre-chequeo de la palabra de escape no la pasa: ahí solo se pregunta
     * si el nodo sabría qué hacer, no se decide el turno.
     */
    trace?: DecisionStep[],
  ): Transition | null {
    const transitions: Transition[] = node.transitions;
    const matches = transitions.map((t) =>
      this.matchesCondition(t.condition, node, message, tenantConfig, extra),
    );
    const matching = transitions.filter((_t, i) => matches[i]);
    const winner = this.pickBySpecificity(node, message, matching);

    if (trace) {
      trace.push({
        kind: 'transitions',
        nodeId: node.id,
        candidates: transitions.map((t, i) => ({
          condition: t.condition.type,
          target: t.next_node_id,
          matched: matches[i],
          score: this.transitionSpecificity(t.condition),
        })),
        winner: winner ? transitions.indexOf(winner) : null,
      });
    }
    return winner;
  }

  private pickBySpecificity(
    node: FlowNode,
    message: Message,
    matching: Transition[],
  ): Transition | null {
    if (matching.length === 0) return null;
    if (matching.length === 1) return matching[0];

    const ranked = matching
      .map((t, originalIndex) => ({
        t,
        originalIndex,
        score: this.transitionSpecificity(t.condition),
      }))
      .sort((a, b) => b.score - a.score || a.originalIndex - b.originalIndex);

    this.logger.debug(
      {
        tenantId: message.tenantId,
        nodeId: node.id,
        candidatos: ranked.map((r) => ({ type: r.t.condition.type, score: r.score })),
        elegida: ranked[0].t.condition.type,
      },
      'Varias transiciones matchearon — desempatado por especificidad (DEC-06)',
    );

    return ranked[0].t;
  }

  /**
   * Especificidad de cada tipo de condición, mayor = gana. Derivado de
   * comportamiento YA decidido en código, no inventado: `catalog_found` va
   * por encima de `service_directory_match` porque el test de B-04
   * ("producto normal, unit_type != service") exige que el catálogo gane
   * aunque el directorio también matchee — la excepción real (servicio con
   * respuesta en el directorio) ya la resuelve `catalog_found` devolviendo
   * `false` en ese caso (DEC-03), no el orden de este ranking.
   */
  private transitionSpecificity(condition: TransitionCondition): number {
    switch (condition.type) {
    case 'button':
      return 100;
    case 'list_item':
      return 90;
    case 'call_permission_granted':
    case 'call_permission_denied':
      return 85;
    case 'catalog_found':
      return 80;
    case 'service_directory_match':
      return 70;
    case 'list_item_any':
    case 'card_any':
      return 60;
    case 'keyword':
      return 50;
    case 'catalog_not_found':
      return 20;
    case 'default':
      return 0;
    default: {
      const _exhaustive: never = condition;
      this.logger.warn({ condition: _exhaustive }, 'Tipo de condición desconocido en scoring');
      return 0;
    }
    }
  }

  private matchesCondition(
    condition: TransitionCondition,
    node: FlowNode,
    message: Message,
    tenantConfig: TenantConfig,
    extra?: { catalogMatch?: PosProduct | null },
  ): boolean {
    const content = message.content.trim();
    const lower = content.toLowerCase();

    switch (condition.type) {
    case 'default':
      return true;

    case 'keyword':
      return condition.values.some((kw) => fuzzyIncludes(content, kw));

    case 'service_directory_match':
      return this.serviceDirectoryMatcher.match(content, tenantConfig.serviceDirectory) !== null;

    case 'catalog_found': {
      const match = extra?.catalogMatch ?? null;
      if (match === null) return false;
      // DEC-03 (auditoría 2026-08-26, hallazgo B-04): un producto marcado
      // como servicio (unit_type='service', ya soportado por el CHECK de la
      // migración 011) cede el paso al directorio de servicios SI éste
      // tiene una respuesta real configurada para el mismo mensaje. Un
      // servicio con precio escalonado (ej. "engargolado hasta 100 hojas
      // $35, de 100-200 $50") no debe contestarse con el precio unitario
      // plano del POS cuando el operador ya redactó la explicación completa
      // en el panel. Si el directorio no tiene nada para este mensaje, el
      // producto igual gana — mejor una respuesta real que "no entendí".
      if (match.unitType === 'service') {
        const hasServiceAnswer =
          this.serviceDirectoryMatcher.match(content, tenantConfig.serviceDirectory) !== null;
        if (hasServiceAnswer) return false;
      }
      return true;
    }

    case 'catalog_not_found':
      return (extra?.catalogMatch ?? null) === null;

    case 'button': {
      // send_media_carousel enruta sus quick_reply por la MISMA condición
      // `button` que send_buttons — es lo que promete el docstring de
      // SendMediaCarouselNode en entities/flow.ts. Antes este case cortaba
      // en seco con `node.type !== 'send_buttons'`, así que una transición
      // declarada sobre un carrusel no podía matchear nunca.
      if (node.type === 'send_media_carousel') {
        // Sin atajo por `content === condition.value`: el valor tiene que
        // resolver a un quick_reply REAL de alguna card. Un cta_url no
        // produce mensaje entrante, así que una transición que apunte a su
        // display_text es inalcanzable y debe reportarse como tal en vez de
        // matchear por coincidencia de texto.
        // En un carrusel dinámico los ids los genera el resolver desde el
        // catálogo, así que no hay nada que un `button` del JSON pueda
        // nombrar: ese caso se enruta con `card_any`.
        for (const card of node.content.cards ?? []) {
          for (const b of card.buttons) {
            if (b.type !== 'quick_reply') continue;
            if (b.id !== condition.value) continue;
            return content === b.id || lower === b.title.toLowerCase();
          }
        }
        return false;
      }
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

    case 'list_item_any':
      return this.resolveListItemId(node, message, tenantConfig) !== null;

    case 'card_any': {
      if (node.type !== 'send_media_carousel') return false;
      return this.extractCardButtonId(node, message, tenantConfig) !== null;
    }

    case 'call_permission_granted':
      return message.content === '__CALL_PERMISSION_GRANTED__';

    case 'call_permission_denied':
      return message.content === '__CALL_PERMISSION_DENIED__';
    }
  }

  /**
   * Id del quick_reply que el cliente tocó en un carrusel, o null si el
   * mensaje no corresponde a ninguna card.
   *
   * En un carrusel dinámico ese id ES el id del producto de catálogo
   * (CarouselCardResolver lo genera así), que es justo lo que `card_any`
   * guarda en contexto para que {{selected_product_name}} y
   * {{selected_product_price}} resuelvan después.
   *
   * A diferencia de extractListItemId, aquí NO se devuelve el content crudo
   * como último recurso: un carrusel tiene como mucho 10 cards conocidas y
   * devolver texto libre metería basura en `selected_product_id`.
   */
  private extractCardButtonId(
    node: FlowNode,
    message: Message,
    tenantConfig: TenantConfig,
  ): string | null {
    if (node.type !== 'send_media_carousel') return null;
    const content = message.content.trim();
    const lower = content.toLowerCase();

    // Cards dinámicas: el id del botón ES el id del producto, y el title es
    // el mismo `button_title` en las diez — no distingue una card de otra,
    // así que solo sirve el id. Se valida contra el catálogo vivo del tenant
    // en vez de recordar lo que se renderizó: el intérprete no guarda estado
    // entre mensajes (es un singleton compartido por todos los tenants) y el
    // catálogo pudo cambiar entre el envío y el tap.
    if (node.content.dynamic_cards) {
      const hit = tenantConfig.catalog.find((c) => c.available && c.id === content);
      return hit ? hit.id : null;
    }

    for (const card of node.content.cards ?? []) {
      for (const b of card.buttons) {
        if (b.type !== 'quick_reply') continue;
        if (content === b.id) return b.id;
        if (lower === b.title.toLowerCase()) return b.id;
      }
    }
    return null;
  }

  /**
   * Id de la fila que eligió el cliente, o null si el mensaje no corresponde
   * a ninguna fila que haya podido ver.
   *
   * Meta entrega el id de la fila (`list_reply.id`). Si el cliente escribe la
   * opción en vez de tocarla llega el título, que se acepta sin distinguir
   * mayúsculas — mismo criterio que `list_item` y `button`. Primero se busca
   * por id en todas las filas y después por título, para que el título de
   * una fila no se confunda con el id de otra.
   *
   * Las secciones dinámicas se hidratan igual que al renderizar, así que la
   * comparación es contra las filas reales del tenant. Antes una sección
   * dinámica aceptaba cualquier texto y lo guardaba crudo en contexto: en
   * `menu_servicios` de papelería `matched_service_id` quedaba como
   * "Engargolado" (o "quiero copias") y {{matched_service_name}} salía vacío.
   * Ahora un texto que no es ninguna fila cae al `default` del nodo, y una
   * palabra de escape ya no queda absorbida como "fila elegida".
   */
  private resolveListItemId(
    node: FlowNode,
    message: Message,
    tenantConfig: TenantConfig,
  ): string | null {
    if (node.type !== 'send_list') return null;
    const content = message.content.trim();
    const lower = content.toLowerCase();

    const items = this.dynamicSectionResolver
      .resolve(node.content.sections, tenantConfig)
      .flatMap((s) => s.items);

    const byId = items.find((it) => it.id === content);
    if (byId) return byId.id;
    const byTitle = items.find((it) => it.title.toLowerCase() === lower);
    return byTitle ? byTitle.id : null;
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

    case 'search_catalog': {
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
      // Un carrusel declara cards literales O dynamic_cards, nunca ambas
      // (el schema lo exige al publicar). Las dinámicas se hidratan desde el
      // catálogo del tenant y ya vienen con sus límites Meta aplicados.
      const sourceCards = node.content.dynamic_cards
        ? this.carouselCardResolver.resolve(node.content.dynamic_cards, p.tenantConfig)
        : (node.content.cards ?? []);
      const cards = await Promise.all(
        sourceCards.map(async (card) => ({
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

  /**
   * ¿Este nodo detiene el avance esperando la respuesta del cliente?
   *
   * Para casi todos los tipos es una pertenencia fija a WAIT_NODE_TYPES. El
   * carrusel es el caso condicional: un carrusel de quick_reply SÍ espera —
   * el cliente toca una card y esa respuesta debe evaluarse contra las
   * transiciones de ESTE nodo, así que `currentNodeId` tiene que quedarse
   * aquí. Uno de cta_url NO espera: esos botones abren el navegador y no
   * generan mensaje entrante, así que parar dejaría la conversación colgada
   * en un nodo que nunca puede avanzar.
   *
   * El schema ya garantiza que todas las cards usan el mismo tipo de botón
   * (regla cross-card en FlowNodeSchema.superRefine), por eso basta con
   * mirar el primer botón de la primera card.
   */
  private isWaitNode(node: FlowNode): boolean {
    if (node.type === 'send_media_carousel') {
      // Las cards dinámicas SIEMPRE llevan un quick_reply por card
      // (CarouselCardResolver), así que un carrusel de catálogo siempre
      // espera el tap. Si resolvió a 0 cards no llegamos hasta aquí:
      // advanceFrom ya lo desvió al default.
      if (node.content.dynamic_cards) return true;
      return node.content.cards?.[0]?.buttons[0]?.type === 'quick_reply';
    }
    return WAIT_NODE_TYPES.has(node.type);
  }

  private isEscapeWord(content: string): boolean {
    const trimmed = content.trim().toLowerCase();
    return (ESCAPE_WORDS as readonly string[]).includes(trimmed);
  }

  private maybeGenerateOrderId(node: FlowNode, orderIdFactory: () => string): string | null {
    const contentJson = JSON.stringify(node.content ?? {});
    if (!contentJson.includes('{{order_id}}')) return null;
    return orderIdFactory();
  }
}

/**
 * Folio de siempre, para quien llama a execute() sin orderIdFactory
 * (SimulateMessageUseCase y tests anteriores a la Fase 1). El motor nuevo
 * usa IdGenerator.orderId(), que genera el mismo formato.
 */
function legacyOrderId(): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rnd = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${ts}-${rnd}`;
}