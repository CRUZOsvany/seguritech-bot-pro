import dagre from 'dagre';
import type { BotFlow } from '../flow-types';
import {
  conditionLabel,
  TARGET_HANDLE_ID,
  type DesignerRFNode,
  type DesignerRFEdge,
  type SourceHandleDesc,
} from './rf-types';

/**
 * Dimensiones nominales que se le pasan a dagre para estimar el layout. No
 * tienen que ser exactas: el nodo real se autoajusta con Tailwind. Solo guían
 * la separación que calcula dagre.
 */
const NODE_W = 240;
const NODE_H = 120;

/** `id` del handle de salida para la transición en posición `idx`. */
export function sourceHandleId(idx: number): string {
  return `t${idx}`;
}

/** `id` determinista del edge de la transición `idx` de `sourceId`. */
function edgeId(sourceId: string, idx: number): string {
  return `${sourceId}__t${idx}`;
}

/**
 * Convierte un `BotFlow` en el grafo de React Flow.
 *
 * - Un source handle por cada transición (sección B): el handle `t<idx>` mapea
 *   a `node.transitions[idx]`, preservando su `condition` intacta en node.data.
 * - `end` no tiene handles de salida (transitions: []).
 * - Un edge por transición con `next_node_id` no vacío.
 * - dagre (rankdir TB) asigna posiciones; los arrastres NO se persisten (DEC-2).
 */
export function botFlowToGraph(flow: BotFlow): {
  nodes: DesignerRFNode[];
  edges: DesignerRFEdge[];
} {
  const nodes: DesignerRFNode[] = flow.nodes.map((node) => {
    const handles: SourceHandleDesc[] = node.transitions.map((t, idx) => ({
      id: sourceHandleId(idx),
      label: conditionLabel(t.condition, node),
    }));
    return {
      id: node.id,
      type: node.type,
      position: { x: 0, y: 0 }, // dagre lo sobrescribe abajo
      data: {
        node,
        isStart: node.id === flow.start_node_id,
        handles,
      },
    };
  });

  const edges: DesignerRFEdge[] = [];
  for (const node of flow.nodes) {
    node.transitions.forEach((t, idx) => {
      if (!t.next_node_id) return;
      edges.push({
        id: edgeId(node.id, idx),
        source: node.id,
        sourceHandle: sourceHandleId(idx),
        target: t.next_node_id,
        targetHandle: TARGET_HANDLE_ID,
      });
    });
  }

  layoutWithDagre(nodes, edges);
  return { nodes, edges };
}

/** Posiciona los nodos in-place con dagre (top-bottom). */
function layoutWithDagre(nodes: DesignerRFNode[], edges: DesignerRFEdge[]): void {
  if (nodes.length === 0) return;
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'TB', nodesep: 50, ranksep: 70, marginx: 20, marginy: 20 });

  nodes.forEach((n) => g.setNode(n.id, { width: NODE_W, height: NODE_H }));
  edges.forEach((e) => {
    // Solo cablear si ambos extremos existen (un next_node_id colgante no rompe el layout).
    if (g.hasNode(e.source) && g.hasNode(e.target)) g.setEdge(e.source, e.target);
  });

  dagre.layout(g);

  nodes.forEach((n) => {
    const pos = g.node(n.id);
    if (!pos) return;
    n.position = { x: pos.x - NODE_W / 2, y: pos.y - NODE_H / 2 };
  });
}
