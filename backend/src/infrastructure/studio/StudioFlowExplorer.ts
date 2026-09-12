import type pino from 'pino';
import type { BotFlow, FlowNode } from '@/domain/entities/flow';
import type { SimulateConversationUseCase, SimulatedTurn } from '@/domain/use-cases/SimulateConversationUseCase';
import { DEFAULT_TEST_START } from '@/domain/studio/testCases';
import { buildMetaPayload } from '@/infrastructure/adapters/meta/metaPayloads';
import { DEFAULT_SIM_PHONE, eventToStep, type SimEvent } from '@/infrastructure/server/admin/studioSimulation';

export interface ExplorationReport {
  depth: number;
  runs: number;
  /** Quedaron caminos sin probar por el tope de corridas. */
  truncated: boolean;
  coverage: { total: number; reached: string[]; unreached: string[]; percent: number };
  /** Pasos donde la conversación se corta sin llegar a un fin. */
  deadEnds: Array<{ nodeId: string; path: string[] }>;
  /** Errores del motor: ciclos, pasos inexistentes, listas vacías sin salida. */
  errors: Array<{ nodeId: string; reason: string; path: string[] }>;
  /** El turno con más mensajes del bot, y cómo se llega. */
  maxMessagesPerTurn: { count: number; path: string[] };
}

interface Candidate {
  event: SimEvent;
  label: string;
}

/** Texto que ningún flow espera: prueba el camino de "no te entendí". */
const NONSENSE = 'zzz explorador';
/** Respuesta genérica para pasos que piden datos. */
const FREE_TEXT = 'Dato de prueba del explorador 123';

/**
 * Explorador de ramas del Studio (Fase 4): recorre solo el bot, con el
 * motor real, tocando cada botón y fila, escribiendo la primera palabra
 * clave de cada salida y un texto que nadie espera, hasta la profundidad
 * pedida. Reporta qué pasos alcanzó, cuáles no, dónde se corta la
 * conversación y cuántos mensajes manda por turno.
 *
 * Expande cada paso una sola vez (búsqueda en anchura por paso), así el
 * número de corridas crece con el tamaño del flow y no con todas las
 * combinaciones posibles. Tiene además un tope de corridas.
 */
export class StudioFlowExplorer {
  constructor(
    private readonly simulate: SimulateConversationUseCase,
    private readonly logger: pino.Logger,
  ) {}

  async explore(
    tenantId: string,
    flow: BotFlow,
    opts: { depth?: number; maxRuns?: number } = {},
  ): Promise<ExplorationReport> {
    const depth = Math.min(Math.max(opts.depth ?? 4, 1), 8);
    const maxRuns = Math.min(Math.max(opts.maxRuns ?? 150, 1), 400);
    const byId = new Map(flow.nodes.map((n) => [n.id, n]));

    const queue: Array<{ events: SimEvent[]; path: string[] }> = [{ events: [{ type: 'text', text: 'hola' }], path: ['"hola"'] }];
    const expanded = new Set<string>();
    const reached = new Set<string>();
    const deadEnds = new Map<string, string[]>();
    const errors = new Map<string, { nodeId: string; reason: string; path: string[] }>();
    let maxTurn = { count: 0, path: [] as string[] };
    let runs = 0;

    while (queue.length > 0 && runs < maxRuns) {
      const item = queue.shift()!;
      runs++;
      const turns = await this.simulate.execute({
        tenantId,
        flow,
        from: DEFAULT_SIM_PHONE,
        startAt: new Date(DEFAULT_TEST_START),
        steps: item.events.map((e, i) => eventToStep(e, i, DEFAULT_SIM_PHONE, this.logger)),
      });

      for (const turn of turns) {
        for (const step of turn.trace) {
          if (step.kind === 'node_entered') reached.add(step.nodeId);
          if (step.kind === 'dead_end' && !deadEnds.has(step.nodeId)) deadEnds.set(step.nodeId, item.path);
          if (step.kind === 'engine_error') {
            const key = `${step.reason}:${step.nodeId}`;
            if (!errors.has(key)) errors.set(key, { nodeId: step.nodeId, reason: step.reason, path: item.path });
          }
        }
      }
      const last = turns.at(-1)!;
      const sent = last.outbound.filter((o) => o.audience === 'customer').length;
      if (sent > maxTurn.count) maxTurn = { count: sent, path: item.path };

      if (item.events.length >= depth) continue;
      const waiting = last.session?.currentNodeId;
      if (!waiting || waiting === 'end' || expanded.has(waiting)) continue;
      expanded.add(waiting);

      for (const c of nextMoves(last, byId.get(waiting))) {
        queue.push({ events: [...item.events, c.event], path: [...item.path, c.label] });
      }
    }

    const all = flow.nodes.map((n) => n.id);
    return {
      depth,
      runs,
      truncated: queue.length > 0,
      coverage: {
        total: all.length,
        reached: all.filter((id) => reached.has(id)),
        unreached: all.filter((id) => !reached.has(id)),
        percent: all.length ? Math.round((all.filter((id) => reached.has(id)).length / all.length) * 100) : 0,
      },
      deadEnds: [...deadEnds].map(([nodeId, path]) => ({ nodeId, path })),
      errors: [...errors.values()],
      maxMessagesPerTurn: maxTurn,
    };
  }
}

/**
 * Lo que un cliente podría hacer después de este turno: tocar cada botón o
 * fila que el bot acaba de mandar (con el id y título del payload real),
 * escribir la primera palabra de cada salida por palabras clave, contestar
 * libre si el paso pide datos, y escribir algo que nadie espera.
 */
function nextMoves(turn: SimulatedTurn, waitingNode: FlowNode | undefined): Candidate[] {
  const moves: Candidate[] = [];
  const seen = new Set<string>();
  const add = (c: Candidate) => {
    if (seen.has(c.label)) return;
    seen.add(c.label);
    moves.push(c);
  };

  for (const out of turn.outbound) {
    if (out.audience !== 'customer') continue;
    const built = buildMetaPayload(out.to, out.content);
    if (!built.ok || built.payload.type !== 'interactive') continue;
    const i = built.payload.interactive;
    if (i.type === 'button') {
      for (const b of i.action.buttons) add({ event: { type: 'button_reply', id: b.reply.id, title: b.reply.title }, label: `[botón] ${b.reply.title}` });
    } else if (i.type === 'list') {
      for (const s of i.action.sections) {
        for (const r of s.rows) add({ event: { type: 'list_reply', id: r.id, title: r.title }, label: `[lista] ${r.title}` });
      }
    } else if (i.type === 'media_carousel') {
      for (const card of i.action.sections[0]?.cards ?? []) {
        for (const b of card.action.buttons) {
          if (b.type === 'reply') add({ event: { type: 'button_reply', id: b.reply.id, title: b.reply.title }, label: `[tarjeta] ${b.reply.title}` });
        }
      }
    }
  }

  if (waitingNode) {
    for (const t of waitingNode.transitions) {
      if (t.condition.type === 'keyword' && t.condition.values[0]) {
        const word = t.condition.values[0];
        add({ event: { type: 'text', text: word }, label: `"${word}"` });
      }
    }
    if (waitingNode.type === 'wait_input' || waitingNode.type === 'search_catalog') {
      add({ event: { type: 'text', text: FREE_TEXT }, label: `"${FREE_TEXT}"` });
    }
  }
  add({ event: { type: 'text', text: NONSENSE }, label: `"${NONSENSE}"` });
  return moves;
}
