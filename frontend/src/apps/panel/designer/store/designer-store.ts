import { create } from 'zustand';
import {
  applyNodeChanges,
  applyEdgeChanges,
  type NodeChange,
  type EdgeChange,
} from '@xyflow/react';
import type { BotFlow, FlowNode } from '../flow-types';
import { botFlowToGraph } from '../mapping/to-react-flow';
import { graphToBotFlow } from '../mapping/to-bot-flow';
import type { DesignerRFNode, DesignerRFEdge } from '../mapping/rf-types';

/**
 * Estado del canvas del Bot Designer. Vive SOLO en memoria (DEC: nada de
 * localStorage/sessionStorage). El round-trip BotFlow<->grafo se delega a
 * `mapping/`. `dirty` indica cambios sin guardar; se marca en cualquier
 * mutación real (no en meras selecciones).
 */
interface DesignerState {
  nodes: DesignerRFNode[];
  edges: DesignerRFEdge[];
  startNodeId: string;
  flowId: string | null;
  selectedId: string | null;
  dirty: boolean;

  loadFromBotFlow: (flow: BotFlow, flowId: string) => void;
  toBotFlow: () => BotFlow;
  onNodesChange: (changes: NodeChange<DesignerRFNode>[]) => void;
  onEdgesChange: (changes: EdgeChange<DesignerRFEdge>[]) => void;
  setSelected: (id: string | null) => void;
  updateNodeContent: (id: string, patch: Record<string, unknown>) => void;
  reset: () => void;
}

const EMPTY: Pick<DesignerState, 'nodes' | 'edges' | 'startNodeId' | 'flowId' | 'selectedId' | 'dirty'> = {
  nodes: [],
  edges: [],
  startNodeId: '',
  flowId: null,
  selectedId: null,
  dirty: false,
};

export const useDesignerStore = create<DesignerState>((set, get) => ({
  ...EMPTY,

  loadFromBotFlow: (flow, flowId) => {
    const { nodes, edges } = botFlowToGraph(flow);
    set({
      nodes,
      edges,
      startNodeId: flow.start_node_id,
      flowId,
      selectedId: null,
      dirty: false,
    });
  },

  toBotFlow: () => {
    const { nodes, edges, startNodeId } = get();
    return graphToBotFlow(nodes, edges, startNodeId);
  },

  onNodesChange: (changes) => {
    // Arrastres y demás cambios estructurales marcan dirty; la selección no.
    const meaningful = changes.some((c) => c.type !== 'select');
    set((s) => ({
      nodes: applyNodeChanges(changes, s.nodes),
      dirty: s.dirty || meaningful,
    }));
  },

  onEdgesChange: (changes) => {
    const meaningful = changes.some((c) => c.type !== 'select');
    set((s) => ({
      edges: applyEdgeChanges(changes, s.edges),
      dirty: s.dirty || meaningful,
    }));
  },

  setSelected: (id) => set({ selectedId: id }),

  updateNodeContent: (id, patch) => {
    set((s) => ({
      dirty: true,
      nodes: s.nodes.map((n) => {
        if (n.id !== id) return n;
        const original = n.data.node;
        const nextNode = {
          ...original,
          content: { ...original.content, ...patch },
        } as FlowNode;
        return { ...n, data: { ...n.data, node: nextNode } };
      }),
    }));
  },

  reset: () => set({ ...EMPTY }),
}));
