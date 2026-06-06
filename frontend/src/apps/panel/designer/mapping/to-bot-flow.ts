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
export function graphToBotFlow(
  nodes: DesignerRFNode[],
  edges: DesignerRFEdge[],
  startNodeId: string,
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
  };
}
