import type { BotFlow, FlowNode, Transition } from '../flow-types';
import { sourceHandleId } from './to-react-flow';
import type { DesignerRFNode, DesignerRFEdge } from './rf-types';

/**
 * Reconstruye un `BotFlow` desde el grafo de React Flow.
 *
 * El contenido y el TIPO de condición de cada transición se conservan tal cual
 * en `node.data.node` (fuente de verdad); aquí solo se reescribe el
 * `next_node_id` de cada transición a partir de los edges (por su handle
 * `t<idx>`). Esto hace el round-trip exacto y respeta DEC-2/DEC-9: no se
 * inyectan posiciones ni campos fuera del contrato.
 */
/**
 * Configuración del flow que no vive en el grafo: palabras de escape (C-08),
 * horario e inactividad (Fase 5). Se editan en el Studio; el Designer las
 * devuelve tal cual. Sin esto, guardar en el Designer las borraba en
 * silencio y el bot volvía a lo de siempre.
 */
export type FlowExtras = Pick<BotFlow, 'escape' | 'hours' | 'inactivity'>;

export const extrasOf = (flow: BotFlow): FlowExtras => ({
  escape: flow.escape,
  hours: flow.hours,
  inactivity: flow.inactivity,
});

export function graphToBotFlow(
  nodes: DesignerRFNode[],
  edges: DesignerRFEdge[],
  startNodeId: string,
  extras: FlowExtras = {},
): BotFlow {
  // Índice: source -> sourceHandle -> next_node_id (último edge gana).
  const wiring = new Map<string, Map<string, string>>();
  for (const e of edges) {
    if (!e.source || !e.target) continue;
    const handle = e.sourceHandle ?? sourceHandleId(0);
    let byHandle = wiring.get(e.source);
    if (!byHandle) {
      byHandle = new Map();
      wiring.set(e.source, byHandle);
    }
    byHandle.set(handle, e.target);
  }

  const rebuilt: FlowNode[] = nodes.map((rfNode) => {
    const original = rfNode.data.node;
    const byHandle = wiring.get(rfNode.id);

    const transitions: Transition[] = original.transitions.map((t, idx) => ({
      condition: t.condition,
      next_node_id: byHandle?.get(sourceHandleId(idx)) ?? '',
    }));

    // Reensamblar preservando el tipo discriminado y el content original.
    if (original.type === 'end') {
      return { ...original, transitions: [] };
    }
    return { ...original, transitions } as FlowNode;
  });

  return {
    version: '1.0',
    start_node_id: startNodeId,
    nodes: rebuilt,
    ...(Object.fromEntries(Object.entries(extras).filter(([, value]) => value !== undefined)) as FlowExtras),
  };
}
