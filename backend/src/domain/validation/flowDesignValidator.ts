import type { BotFlow, FlowNode, Transition, TransitionCondition } from '@/domain/entities/flow';
import { WHATSAPP_LIMITS as L } from '@/domain/whatsapp/limits';
import { FlowSchema } from '@/domain/validators/flowSchema';
import { resolveEscape, wordsOf, type EscapeCategory, type ResolvedEscape } from '@/domain/conversation/escapeWords';
import { fuzzyIncludes, normalizePhrase } from '@/domain/services/textMatch';

const ESCAPE_CATEGORIES: EscapeCategory[] = ['opt_out', 'human', 'restart', 'menu'];
const ESCAPE_LABEL: Record<EscapeCategory, string> = {
  opt_out: 'baja',
  human: 'hablar con una persona',
  restart: 'empezar de nuevo',
  menu: 'volver al menú',
};

/**
 * Validador de diseño del Studio (Fase 2): las reglas V-* de la
 * especificación que el motor puede cumplir hoy.
 *
 * Es el mismo en el editor (en vivo), en CI (moldes) y en la publicación
 * (Fase 4: un error la bloquea). El reporte trae aparte `schema`, el
 * contrato mínimo del motor (FlowSchema).
 *
 * Límites de Meta: de domain/whatsapp/limits.ts, nunca escritos aquí.
 *
 * Reglas de la especificación que NO están aquí, porque el motor todavía no
 * hace lo que revisan: V-EST-09 (respuesta por tipo de entrada: el motor
 * ignora audio, imagen y demás, hallazgo H-8), V-META-03 (el modelo de nodos
 * no tiene encabezados donde Meta los prohíbe), V-META-06 (no hay nodo de
 * address message), V-CUMP-03/04/05/08 (el motor no programa envíos,
 * recordatorios ni plantillas). Detalle: docs/studio/FASE_2_VALIDADOR.md.
 */

export type IssueLevel = 'error' | 'warning';

export interface ValidationIssue {
  code: string;
  level: IssueLevel;
  message: string;
  nodeId?: string;
}

export interface ValidationReport {
  /** Sin errores de diseño. Las advertencias no lo cambian. */
  ok: boolean;
  summary: { errors: number; warnings: number };
  issues: ValidationIssue[];
  /** Lo que decide hoy la publicación (FlowSchema, capa L2). */
  schema: { ok: boolean; issues: Array<{ path: string; message: string }> };
}

export function validateFlowDesign(input: unknown): ValidationReport {
  const schema = runSchema(input);
  const shape = checkShape(input);
  const issues: ValidationIssue[] = shape.ok ? runRules(shape.flow) : [shape.issue];
  const errors = issues.filter((i) => i.level === 'error').length;
  return {
    ok: errors === 0,
    summary: { errors, warnings: issues.length - errors },
    issues,
    schema,
  };
}

// ============================================================================
// Forma mínima: lo necesario para recorrer el grafo sin reventar
// ============================================================================

function runSchema(input: unknown): ValidationReport['schema'] {
  const parsed = FlowSchema.safeParse(input);
  if (parsed.success) return { ok: true, issues: [] };
  return {
    ok: false,
    issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
  };
}

function checkShape(
  input: unknown,
): { ok: true; flow: BotFlow } | { ok: false; issue: ValidationIssue } {
  const fail = (message: string) =>
    ({ ok: false as const, issue: { code: 'V-FORMA', level: 'error' as const, message } });
  if (!input || typeof input !== 'object') return fail('El flujo no es un objeto.');
  const f = input as Record<string, unknown>;
  if (!Array.isArray(f.nodes)) return fail('El flujo no tiene lista de pasos (nodes).');
  for (const [i, n] of f.nodes.entries()) {
    const node = n as Record<string, unknown> | null;
    if (!node || typeof node !== 'object') return fail(`El paso #${i + 1} no es un objeto.`);
    if (typeof node.id !== 'string' || !node.id) return fail(`El paso #${i + 1} no tiene id.`);
    if (typeof node.type !== 'string') return fail(`El paso «${node.id}» no tiene tipo.`);
    if (!node.content || typeof node.content !== 'object') return fail(`El paso «${node.id}» no tiene contenido.`);
    if (!Array.isArray(node.transitions)) return fail(`El paso «${node.id}» no tiene lista de salidas.`);
    for (const t of node.transitions as unknown[]) {
      const tr = t as Record<string, unknown> | null;
      const cond = tr?.condition as Record<string, unknown> | undefined;
      if (!tr || typeof cond?.type !== 'string' || typeof tr.next_node_id !== 'string') {
        return fail(`El paso «${node.id}» tiene una salida mal formada.`);
      }
    }
  }
  return { ok: true, flow: input as BotFlow };
}

// ============================================================================
// Reglas
// ============================================================================

function runRules(flow: BotFlow): ValidationIssue[] {
  const ctx = new GraphContext(flow);
  return [
    ...ruleStart(ctx),
    ...ruleDestinations(ctx),
    ...ruleNoExit(ctx),
    ...ruleUnreachable(ctx),
    ...ruleDuplicateIds(ctx),
    ...ruleVariables(ctx),
    ...ruleAutoLoop(ctx),
    ...ruleTies(ctx),
    ...ruleMetaTexts(ctx),
    ...ruleMetaCounts(ctx),
    ...ruleCarouselConsistency(ctx),
    ...ruleMedia(ctx),
    ...ruleHumanPath(ctx),
    ...ruleOptOut(ctx),
    ...ruleSensitiveData(ctx),
    ...ruleBursts(ctx),
    ...ruleMergeable(ctx),
  ];
}

class GraphContext {
  readonly byId = new Map<string, FlowNode>();
  readonly reachable: Set<string>;
  readonly escape: ResolvedEscape;
  /** Pasos a los que se llega con una palabra de escape desde cualquier paso. */
  readonly escapeTargets: string[];

  constructor(readonly flow: BotFlow) {
    for (const n of flow.nodes) if (!this.byId.has(n.id)) this.byId.set(n.id, n);
    this.escape = resolveEscape(flow);
    this.escapeTargets = [
      ...(this.escape.menu.words.length ? [this.escape.menu.target] : []),
      ...(this.escape.human ? [this.escape.human.target] : []),
    ];
    this.reachable = this.reachFrom([flow.start_node_id, ...this.escapeTargets]);
  }

  /** Nodos alcanzables siguiendo cualquier salida. */
  reachFrom(starts: string[]): Set<string> {
    const seen = new Set<string>();
    const stack = starts.filter((s) => this.byId.has(s));
    while (stack.length) {
      const id = stack.pop()!;
      if (seen.has(id)) continue;
      seen.add(id);
      for (const t of transitionsOf(this.byId.get(id)!)) {
        if (this.byId.has(t.next_node_id)) stack.push(t.next_node_id);
      }
    }
    return seen;
  }

  reachableNodes(): FlowNode[] {
    return this.flow.nodes.filter((n) => this.reachable.has(n.id));
  }

  /**
   * Dónde empieza un turno: el inicio del flow y cada destino de un paso
   * que espera al cliente (tras su respuesta, el motor avanza desde ahí).
   */
  turnEntries(): string[] {
    const entries = new Set<string>([this.flow.start_node_id, ...this.escapeTargets]);
    for (const n of this.reachableNodes()) {
      if (!isWaitNode(n)) continue;
      for (const t of transitionsOf(n)) entries.add(t.next_node_id);
    }
    return [...entries].filter((id) => this.byId.has(id));
  }

  /** Lo que el motor recorre solo desde `startId` hasta esperar o terminar. */
  autoChain(startId: string): { nodes: FlowNode[]; loops: boolean } {
    const nodes: FlowNode[] = [];
    const seen = new Set<string>();
    let id: string | undefined = startId;
    while (id && this.byId.has(id)) {
      if (seen.has(id)) return { nodes, loops: true };
      seen.add(id);
      const node: FlowNode = this.byId.get(id)!;
      nodes.push(node);
      if (isWaitNode(node) || node.type === 'end') break;
      id = transitionsOf(node)[0]?.next_node_id;
    }
    return { nodes, loops: false };
  }
}

const transitionsOf = (n: FlowNode): Transition[] => n.transitions as Transition[];

const WAIT_TYPES = new Set(['send_buttons', 'send_list', 'wait_input', 'search_catalog', 'request_call_permission']);

/** Mismo criterio que FlowInterpreter.isWaitNode. */
function isWaitNode(n: FlowNode): boolean {
  if (n.type === 'send_media_carousel') {
    if (n.content.dynamic_cards) return true;
    return n.content.cards?.[0]?.buttons[0]?.type === 'quick_reply';
  }
  return WAIT_TYPES.has(n.type);
}

/** Mensajes al cliente que manda el paso al entrar. */
function messagesSent(n: FlowNode): number {
  switch (n.type) {
  case 'end':
    return 0;
  case 'wait_input':
  case 'search_catalog':
    return n.content.prompt ? 1 : 0;
  default:
    return 1;
  }
}

const issue = (code: string, level: IssueLevel, message: string, nodeId?: string): ValidationIssue =>
  ({ code, level, message, ...(nodeId ? { nodeId } : {}) });
const q = (id: string) => `«${id}»`;

// --- Estructura ------------------------------------------------------------

/** V-EST-08: sin inicio o sin despedida alcanzable. */
function ruleStart(ctx: GraphContext): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  if (!ctx.flow.start_node_id || !ctx.byId.has(ctx.flow.start_node_id)) {
    out.push(issue('V-EST-08', 'error', `El paso inicial ${q(ctx.flow.start_node_id ?? '')} no existe.`));
    return out;
  }
  const endReachable = ctx.reachableNodes().some((n) => n.type === 'end');
  if (!endReachable) {
    out.push(issue('V-EST-08', 'error', 'Ningún camino desde el inicio llega a un paso de fin: la conversación nunca se cierra.'));
  }
  return out;
}

/** V-EST-02: una salida apunta a un paso que no existe. */
function ruleDestinations(ctx: GraphContext): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  const escapeTargets: Array<[string, string | undefined]> = [
    ['volver al menú', ctx.flow.escape?.menu?.node_id],
    ['hablar con una persona', ctx.flow.escape?.human?.node_id],
  ];
  for (const [what, target] of escapeTargets) {
    if (target && !ctx.byId.has(target)) {
      out.push(issue('V-EST-02', 'error', `La palabra para ${what} lleva a ${q(target)}, que no existe.`));
    }
  }
  for (const n of ctx.flow.nodes) {
    for (const t of transitionsOf(n)) {
      if (!ctx.byId.has(t.next_node_id)) {
        out.push(issue('V-EST-02', 'error', `${q(n.id)} sigue a ${q(t.next_node_id)}, que no existe.`, n.id));
      }
    }
  }
  return out;
}

/** V-EST-01: un paso que no es el fin y no tiene a dónde seguir. */
function ruleNoExit(ctx: GraphContext): ValidationIssue[] {
  return ctx
    .reachableNodes()
    .filter((n) => n.type !== 'end' && transitionsOf(n).length === 0)
    .map((n) =>
      issue(
        'V-EST-01',
        'error',
        n.type === 'escape_to_human'
          ? `${q(n.id)} pasa a una persona pero no tiene salida: cuando termine la pausa, cada mensaje del cliente volvería a escalar.`
          : `${q(n.id)} no tiene a dónde seguir: la conversación se corta ahí.`,
        n.id,
      ),
    );
}

/** V-EST-03: un paso al que ningún camino lleva. */
function ruleUnreachable(ctx: GraphContext): ValidationIssue[] {
  return ctx.flow.nodes
    .filter((n) => !ctx.reachable.has(n.id))
    .map((n) => issue('V-EST-03', 'warning', `Ningún camino desde el inicio llega a ${q(n.id)}.`, n.id));
}

/** V-EST-04: ids de botón, fila o tarjeta repetidos en un mismo mensaje. */
function ruleDuplicateIds(ctx: GraphContext): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  const check = (n: FlowNode, what: string, ids: string[]) => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) {
        out.push(issue('V-EST-04', 'error', `${q(n.id)} repite el id "${id}" en dos ${what}: el bot no puede distinguirlos.`, n.id));
      }
      seen.add(id);
    }
  };
  for (const n of ctx.flow.nodes) {
    if (n.type === 'send_buttons') check(n, 'botones', n.content.buttons.map((b) => b.id));
    if (n.type === 'send_list') {
      check(n, 'opciones', n.content.sections.flatMap((s) => (s.type === 'static' ? s.items.map((i) => i.id) : [])));
    }
    if (n.type === 'send_media_carousel' && n.content.cards) {
      check(
        n,
        'tarjetas',
        n.content.cards.flatMap((c) => c.buttons.flatMap((b) => (b.type === 'quick_reply' ? [b.id] : []))),
      );
    }
  }
  return out;
}

const BUILTIN_VARIABLES = new Set([
  'nombre_bot', 'nombre_negocio', 'welcome_message', 'menu_message', 'out_of_hours_message',
  'not_understood_message', 'order_confirmation_message', 'phone', 'last_message',
  'catalog_listing', 'order_id',
]);
/** Resuelven solo si algo del flow guardó su id: si no, salen vacías. */
const DEPENDENT_VARIABLES: Record<string, string> = {
  selected_product_id: 'selected_product_id',
  selected_product_name: 'selected_product_id',
  selected_product_price: 'selected_product_id',
  matched_service_id: 'matched_service_id',
  matched_service_name: 'matched_service_id',
  matched_service_response: 'matched_service_id',
  matched_service_price: 'matched_service_id',
};

/** V-EST-05: una {{variable}} que nada del flow ni del negocio provee. */
function ruleVariables(ctx: GraphContext): ValidationIssue[] {
  const saved = new Set<string>();
  for (const n of ctx.flow.nodes) {
    if (n.type === 'wait_input' && n.content.save_to_context) saved.add(n.content.save_to_context);
    for (const t of transitionsOf(n)) {
      const c = t.condition;
      if ('save_to_context' in c && c.save_to_context) saved.add(c.save_to_context);
      // card_any y catalog_found guardan selected_product_id aunque no lo declaren.
      if (c.type === 'card_any' || c.type === 'catalog_found') saved.add(c.save_to_context ?? 'selected_product_id');
    }
  }

  const out: ValidationIssue[] = [];
  for (const n of ctx.flow.nodes) {
    const used = new Set([...textsOf(n).join('\n').matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]));
    for (const key of used) {
      if (BUILTIN_VARIABLES.has(key)) continue;
      const needs = DEPENDENT_VARIABLES[key];
      if (needs) {
        if (!saved.has(needs)) {
          out.push(issue('V-EST-05', 'error', `${q(n.id)} usa {{${key}}}, pero ningún paso guarda {{${needs}}}: saldría vacío.`, n.id));
        }
        continue;
      }
      if (!saved.has(key)) {
        out.push(issue('V-EST-05', 'error', `${q(n.id)} usa {{${key}}}, que ningún paso guarda: el cliente vería "{{${key}}}" tal cual.`, n.id));
      }
    }
  }
  return out;
}

/** V-EST-06: pasos que se encadenan solos en círculo, sin esperar al cliente. */
function ruleAutoLoop(ctx: GraphContext): ValidationIssue[] {
  const reported = new Set<string>();
  const out: ValidationIssue[] = [];
  for (const n of ctx.reachableNodes()) {
    if (isWaitNode(n) || n.type === 'end' || reported.has(n.id)) continue;
    const chain = ctx.autoChain(n.id);
    if (!chain.loops) continue;
    for (const c of chain.nodes) reported.add(c.id);
    out.push(issue(
      'V-EST-06',
      'error',
      `${chain.nodes.map((c) => q(c.id)).join(' → ')} vuelve sobre sí mismo sin esperar respuesta: el motor corta la conversación.`,
      n.id,
    ));
  }
  return out;
}

/** V-EST-07: dos salidas del mismo paso que responden a lo mismo con la misma prioridad. */
function ruleTies(ctx: GraphContext): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  // La misma palabra de escape en dos grupos: gana baja > persona > empezar
  // de nuevo > menú, sin que se note.
  const groupOf = new Map<string, EscapeCategory>();
  for (const category of ESCAPE_CATEGORIES) {
    for (const w of ctx.flow.escape ? wordsOf(ctx.escape, category) : []) {
      const word = normalizePhrase(w);
      const other = groupOf.get(word);
      if (other && other !== category) {
        out.push(issue('V-EST-07', 'warning', `La palabra "${word}" está en ${ESCAPE_LABEL[other]} y en ${ESCAPE_LABEL[category]}: se usa solo como ${ESCAPE_LABEL[other]}.`));
      } else {
        groupOf.set(word, category);
      }
    }
  }
  for (const n of ctx.reachableNodes()) {
    const seen = new Map<string, string>();
    const words = new Map<string, string>();
    for (const t of transitionsOf(n)) {
      const key = conditionKey(t.condition);
      if (key && seen.has(key) && seen.get(key) !== t.next_node_id) {
        out.push(issue('V-EST-07', 'warning', `${q(n.id)} tiene dos salidas iguales (${describeCondition(t.condition)}) a destinos distintos: siempre gana la primera.`, n.id));
      }
      if (key) seen.set(key, t.next_node_id);
      if (t.condition.type === 'keyword') {
        for (const w of t.condition.values.map(normalize)) {
          const other = words.get(w);
          if (other && other !== t.next_node_id) {
            out.push(issue('V-EST-07', 'warning', `En ${q(n.id)} la palabra "${w}" lleva a ${q(other)} y a ${q(t.next_node_id)}: gana la primera en la lista.`, n.id));
          }
          words.set(w, t.next_node_id);
        }
      }
    }
  }
  return out;
}

function conditionKey(c: TransitionCondition): string | null {
  switch (c.type) {
  case 'button':
  case 'list_item':
    return `${c.type}:${c.value}`;
  case 'keyword':
    return null; // se revisa palabra por palabra
  default:
    return c.type;
  }
}

function describeCondition(c: TransitionCondition): string {
  return 'value' in c ? `${c.type} "${c.value}"` : c.type;
}

// --- Formato Meta ----------------------------------------------------------

/** V-META-01: textos que exceden el límite de su campo. */
function ruleMetaTexts(ctx: GraphContext): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  const check = (n: FlowNode, field: string, text: string | undefined, max: number) => {
    if (text !== undefined && [...text].length > max) {
      out.push(issue('V-META-01', 'error', `${q(n.id)}: ${field} tiene ${[...text].length} caracteres y WhatsApp permite ${max}.`, n.id));
    }
  };
  for (const n of ctx.flow.nodes) {
    switch (n.type) {
    case 'send_text':
      check(n, 'el texto', n.content.text, L.text.bodyMax);
      break;
    case 'send_buttons':
      check(n, 'el texto', n.content.text, L.replyButtons.bodyMax);
      for (const b of n.content.buttons) {
        check(n, `el botón "${b.title}"`, b.title, L.replyButtons.buttonTitleMax);
        check(n, `el id del botón "${b.title}"`, b.id, L.replyButtons.buttonIdMax);
      }
      break;
    case 'send_list':
      check(n, 'el texto', n.content.text, L.list.bodyMax);
      check(n, 'el botón de la lista', n.content.button_label, L.list.buttonLabelMax);
      for (const s of n.content.sections) {
        check(n, `el título de la sección "${s.title}"`, s.title, L.list.sectionTitleMax);
        if (s.type !== 'static') continue;
        for (const it of s.items) {
          check(n, `la opción "${it.title}"`, it.title, L.list.rowTitleMax);
          check(n, `la descripción de "${it.title}"`, it.description, L.list.rowDescriptionMax);
          check(n, `el id de "${it.title}"`, it.id, L.list.rowIdMax);
        }
      }
      break;
    case 'send_media':
      if (n.content.media_type === 'image') check(n, 'el pie de foto', n.content.caption, L.image.captionMax);
      if (n.content.media_type === 'document') {
        check(n, 'el pie del documento', n.content.caption, L.document.captionMax);
        check(n, 'el nombre del archivo', n.content.filename, L.document.filenameMax);
      }
      break;
    case 'send_cta_url':
      check(n, 'el texto', n.content.body, L.ctaUrl.bodyMax);
      check(n, 'el pie', n.content.footer, L.ctaUrl.footerMax);
      check(n, 'el texto del botón', n.content.button.display_text, L.ctaUrl.displayTextMax);
      if (n.content.header?.type === 'text') check(n, 'el encabezado', n.content.header.text, L.ctaUrl.headerTextMax);
      break;
    case 'send_location_request':
      check(n, 'el texto', n.content.body, L.locationRequest.bodyMax);
      break;
    case 'send_media_carousel':
      check(n, 'el texto', n.content.body, L.mediaCarousel.bodyMax);
      for (const [i, card] of (n.content.cards ?? []).entries()) {
        check(n, `el texto de la tarjeta ${i + 1}`, card.body, L.mediaCarousel.cardBodyMax);
        const breaks = (card.body.match(/\n/g) ?? []).length;
        if (breaks > L.mediaCarousel.cardBodyMaxLineBreaks) {
          out.push(issue('V-META-01', 'error', `${q(n.id)}: la tarjeta ${i + 1} tiene ${breaks} saltos de línea y WhatsApp permite ${L.mediaCarousel.cardBodyMaxLineBreaks}.`, n.id));
        }
        for (const b of card.buttons) {
          if (b.type === 'quick_reply') {
            check(n, `el botón "${b.title}"`, b.title, L.mediaCarousel.buttonLabelMax);
            check(n, `el id del botón "${b.title}"`, b.id, L.mediaCarousel.quickReplyIdMax);
          } else {
            check(n, `el botón "${b.display_text}"`, b.display_text, L.mediaCarousel.buttonLabelMax);
          }
        }
      }
      if (n.content.dynamic_cards) {
        check(n, 'el texto del botón de las tarjetas', n.content.dynamic_cards.button_title, L.mediaCarousel.buttonLabelMax);
      }
      break;
    case 'wait_input':
    case 'search_catalog':
      check(n, 'la pregunta', n.content.prompt, L.text.bodyMax);
      break;
    case 'escape_to_human':
      check(n, 'la respuesta al cliente', n.content.user_response, L.text.bodyMax);
      check(n, 'la alerta al dueño', n.content.owner_alert_template, L.text.bodyMax);
      break;
    default:
      break;
    }
  }
  return out;
}

/** V-META-02: cantidad de botones, filas, secciones o tarjetas fuera de rango. */
function ruleMetaCounts(ctx: GraphContext): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  for (const n of ctx.flow.nodes) {
    if (n.type === 'send_buttons') {
      const count = n.content.buttons.length;
      if (count < L.replyButtons.buttonsMin || count > L.replyButtons.buttonsMax) {
        out.push(issue('V-META-02', 'error', `${q(n.id)} tiene ${count} botones; WhatsApp permite de ${L.replyButtons.buttonsMin} a ${L.replyButtons.buttonsMax}. Con más opciones, usa una lista.`, n.id));
      }
    }
    if (n.type === 'send_list') {
      const sections = n.content.sections.length;
      if (sections < L.list.sectionsMin || sections > L.list.sectionsMax) {
        out.push(issue('V-META-02', 'error', `${q(n.id)} tiene ${sections} secciones; WhatsApp permite de ${L.list.sectionsMin} a ${L.list.sectionsMax}.`, n.id));
      }
      const staticRows = n.content.sections.reduce((acc, s) => acc + (s.type === 'static' ? s.items.length : 0), 0);
      const hasDynamic = n.content.sections.some((s) => s.type === 'dynamic');
      if (staticRows > L.list.rowsTotalMax) {
        out.push(issue('V-META-02', 'error', `${q(n.id)} tiene ${staticRows} opciones; WhatsApp permite ${L.list.rowsTotalMax} en total.`, n.id));
      } else if (hasDynamic && staticRows > 0) {
        out.push(issue('V-META-02', 'warning', `${q(n.id)} mezcla ${staticRows} opciones fijas con una sección que se llena sola: si juntas pasan de ${L.list.rowsTotalMax}, WhatsApp rechaza la lista.`, n.id));
      }
    }
    if (n.type === 'send_media_carousel') {
      if (n.content.cards) {
        const count = n.content.cards.length;
        if (count < L.mediaCarousel.cardsMin || count > L.mediaCarousel.cardsMax) {
          out.push(issue('V-META-02', 'error', `${q(n.id)} tiene ${count} tarjetas; WhatsApp permite de ${L.mediaCarousel.cardsMin} a ${L.mediaCarousel.cardsMax}.`, n.id));
        }
      } else if (n.content.dynamic_cards) {
        out.push(issue('V-META-02', 'warning', `${q(n.id)} arma sus tarjetas desde el catálogo: si solo hay un producto con foto, WhatsApp rechaza el carrusel (pide al menos ${L.mediaCarousel.cardsMin}).`, n.id));
      }
    }
  }
  return out;
}

/** V-META-04: tarjetas de un carrusel con botones de distinto tipo o cantidad. */
function ruleCarouselConsistency(ctx: GraphContext): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  for (const n of ctx.flow.nodes) {
    if (n.type !== 'send_media_carousel' || !n.content.cards?.length) continue;
    const signature = (card: { buttons: Array<{ type: string }> }) => card.buttons.map((b) => b.type).join(',');
    const first = signature(n.content.cards[0]);
    if (n.content.cards.some((c) => signature(c) !== first)) {
      out.push(issue('V-META-04', 'error', `${q(n.id)}: todas las tarjetas deben tener los mismos botones (mismo tipo y cantidad).`, n.id));
    }
    const urlButtons = n.content.cards[0].buttons.filter((b) => b.type === 'cta_url').length;
    if (urlButtons > L.mediaCarousel.urlButtonsPerCard) {
      out.push(issue('V-META-04', 'error', `${q(n.id)}: cada tarjeta admite un solo botón de enlace.`, n.id));
    }
  }
  return out;
}

/** V-META-05: medios sin enlace https. */
function ruleMedia(ctx: GraphContext): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  const check = (n: FlowNode, what: string, url: string | undefined) => {
    if (!url || !/^https:\/\/\S+$/.test(url)) {
      out.push(issue('V-META-05', 'error', `${q(n.id)}: ${what} necesita un enlace https válido.`, n.id));
    }
  };
  for (const n of ctx.flow.nodes) {
    if (n.type === 'send_media' && n.content.media_type !== 'location') check(n, 'el archivo', n.content.url);
    if (n.type === 'send_cta_url') {
      check(n, 'el botón', n.content.button.url);
      if (n.content.header && n.content.header.type !== 'text') check(n, 'el encabezado', n.content.header.link);
    }
    if (n.type === 'send_media_carousel') {
      for (const [i, card] of (n.content.cards ?? []).entries()) check(n, `la imagen de la tarjeta ${i + 1}`, card.header.link);
    }
  }
  return out;
}

// --- Cumplimiento ----------------------------------------------------------

/**
 * V-CUMP-01: la política de WhatsApp exige una vía clara a una persona. Desde
 * cada paso donde el cliente puede quedarse, algún camino debe llevar a un
 * paso de "hablar con una persona".
 */
function ruleHumanPath(ctx: GraphContext): ValidationIssue[] {
  const humans = ctx.flow.nodes.filter((n) => n.type === 'escape_to_human').map((n) => n.id);
  const reachableHumans = humans.filter((id) => ctx.reachable.has(id));
  const leadsToHuman = (id: string) => {
    const from = ctx.reachFrom([id]);
    return reachableHumans.some((h) => from.has(h));
  };

  // Con palabra para hablar con una persona (C-08), la vía existe desde
  // cualquier paso. Solo falla si lleva a otra cosa, o si un paso atrapa esa
  // palabra con una salida propia que no lleva a una persona.
  const human = ctx.escape.human;
  if (human) {
    const target = ctx.byId.get(human.target);
    if (!target) return []; // V-EST-02 ya lo dice
    if (!leadsToHuman(human.target)) {
      return [issue('V-CUMP-01', 'error', `La palabra para hablar con una persona lleva a ${q(human.target)}, que no pasa a una persona.`)];
    }
    const out: ValidationIssue[] = [];
    for (const n of ctx.reachableNodes()) {
      if (!isWaitNode(n)) continue;
      for (const word of human.words) {
        const local = transitionsOf(n).find((t) => catchesWord(t.condition, n, word));
        if (local && !leadsToHuman(local.next_node_id)) {
          out.push(issue('V-CUMP-01', 'error', `En ${q(n.id)}, "${word}" tiene su propia salida a ${q(local.next_node_id)}, que no llega a una persona: el cliente no puede pedir ayuda desde ahí.`, n.id));
          break;
        }
      }
    }
    return out;
  }

  if (reachableHumans.length === 0) {
    return [issue('V-CUMP-01', 'error', 'Ningún camino lleva a hablar con una persona. WhatsApp exige ofrecer esa vía.')];
  }
  const out: ValidationIssue[] = [];
  for (const n of ctx.reachableNodes()) {
    if (!isWaitNode(n)) continue;
    if (!leadsToHuman(n.id)) {
      out.push(issue('V-CUMP-01', 'error', `Desde ${q(n.id)} ya no hay forma de llegar a una persona.`, n.id));
    }
  }
  return out;
}

/**
 * ¿Una salida del paso se queda con esta palabra antes que el escape? Mismo
 * criterio que el motor: botón o fila por id o título, palabra clave difusa.
 */
function catchesWord(c: TransitionCondition, n: FlowNode, word: string): boolean {
  const w = normalizePhrase(word);
  switch (c.type) {
  case 'keyword':
    return c.values.some((kw) => fuzzyIncludes(word, kw));
  case 'button': {
    const title = n.type === 'send_buttons' ? n.content.buttons.find((b) => b.id === c.value)?.title : undefined;
    return normalizePhrase(c.value) === w || (!!title && normalizePhrase(title) === w);
  }
  case 'list_item': {
    const title =
      n.type === 'send_list'
        ? n.content.sections.flatMap((s) => (s.type === 'static' ? s.items : [])).find((i) => i.id === c.value)?.title
        : undefined;
    return normalizePhrase(c.value) === w || (!!title && normalizePhrase(title) === w);
  }
  default:
    return false;
  }
}

/** V-CUMP-02: la baja es obligatoria en todo flujo. */
function ruleOptOut(ctx: GraphContext): ValidationIssue[] {
  const optOut = ctx.flow.escape?.opt_out;
  if (optOut && optOut.words.length === 0) {
    return [issue('V-CUMP-02', 'error', 'No hay palabra para darse de baja. WhatsApp exige que el cliente pueda dejar de recibir mensajes.')];
  }
  return [];
}

const SENSITIVE_PATTERNS: Array<{ re: RegExp; what: string }> = [
  { re: /\b(numero|datos|digitos) de (tu |la )?tarjeta\b/, what: 'el número de una tarjeta' },
  { re: /\b(cvv|cvc|nip)\b/, what: 'el código de seguridad o NIP de una tarjeta' },
  { re: /\bclabe\b/, what: 'una CLABE' },
  { re: /\b(numero de cuenta|cuenta bancaria)\b/, what: 'una cuenta bancaria' },
  { re: /\b(contrasena|password)\b/, what: 'una contraseña' },
  { re: /\b(ine|credencial (de elector|para votar)|curp|pasaporte)\b/, what: 'una identificación oficial' },
];

/** V-CUMP-06: pedir por chat datos que la política de WhatsApp prohíbe pedir. */
function ruleSensitiveData(ctx: GraphContext): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  for (const n of ctx.flow.nodes) {
    const text = normalize(customerTextsOf(n).join('\n'));
    for (const p of SENSITIVE_PATTERNS) {
      if (p.re.test(text)) {
        out.push(issue('V-CUMP-06', 'error', `${q(n.id)} parece pedir ${p.what}. WhatsApp prohíbe pedir ese dato por chat.`, n.id));
      }
    }
  }
  return out;
}

/** V-CUMP-07 y V-COSTO-02: mensajes seguidos del bot sin esperar respuesta. */
function ruleBursts(ctx: GraphContext): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  for (const entry of ctx.turnEntries()) {
    const chain = ctx.autoChain(entry);
    const count = chain.nodes.reduce((acc, n) => acc + messagesSent(n), 0);
    const path = chain.nodes.map((n) => q(n.id)).join(' → ');
    if (count > 3) {
      out.push(issue('V-CUMP-07', 'warning', `Desde ${q(entry)} el bot manda ${count} mensajes seguidos sin esperar respuesta (${path}). Más de 3 afecta la calidad del número.`, entry));
    } else if (count > 2) {
      out.push(issue('V-COSTO-02', 'warning', `Desde ${q(entry)} el bot manda ${count} mensajes en un solo turno (${path}). Cada mensaje cuenta.`, entry));
    }
  }
  return out;
}

/** V-COSTO-01: un texto suelto justo antes de otro mensaje que podría llevarlo. */
function ruleMergeable(ctx: GraphContext): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  for (const n of ctx.reachableNodes()) {
    if (n.type !== 'send_text') continue;
    const next = ctx.byId.get(transitionsOf(n)[0]?.next_node_id ?? '');
    if (!next) continue;
    if (next.type === 'send_text' || next.type === 'send_buttons' || next.type === 'send_list') {
      const into = next.type === 'send_text' ? 'en un solo texto' : 'poniendo el texto en el cuerpo del menú';
      out.push(issue('V-COSTO-01', 'warning', `${q(n.id)} y ${q(next.id)} salen juntos: se pueden fusionar ${into} y mandar un mensaje menos.`, n.id));
    }
  }
  return out;
}

// --- Utilidades ------------------------------------------------------------

function normalize(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

/** Todos los textos de un paso donde puede haber {{variables}}. */
function textsOf(n: FlowNode): string[] {
  return [...customerTextsOf(n), ...(n.type === 'escape_to_human' ? [n.content.owner_alert_template] : [])];
}

/** Lo que ve el cliente. */
function customerTextsOf(n: FlowNode): string[] {
  switch (n.type) {
  case 'send_text':
    return [n.content.text];
  case 'send_buttons':
    return [n.content.text, ...n.content.buttons.map((b) => b.title)];
  case 'send_list':
    return [
      n.content.text,
      n.content.button_label,
      ...n.content.sections.flatMap((s) => [s.title, ...(s.type === 'static' ? s.items.flatMap((i) => [i.title, i.description ?? '']) : [])]),
    ];
  case 'send_media':
    return n.content.media_type === 'location' ? [n.content.name ?? '', n.content.address ?? ''] : [n.content.caption ?? ''];
  case 'send_cta_url':
    return [n.content.body, n.content.footer ?? '', n.content.button.display_text, n.content.header?.type === 'text' ? n.content.header.text : ''];
  case 'send_location_request':
    return [n.content.body];
  case 'send_media_carousel':
    return [n.content.body, ...(n.content.cards ?? []).map((c) => c.body)];
  case 'wait_input':
  case 'search_catalog':
    return [n.content.prompt ?? ''];
  case 'escape_to_human':
    return [n.content.user_response];
  case 'request_call_permission':
    return [n.content.body, n.content.footer ?? ''];
  case 'send_whatsapp_flow':
    return [n.content.body, n.content.header ?? '', n.content.footer ?? ''];
  default:
    return [];
  }
}
