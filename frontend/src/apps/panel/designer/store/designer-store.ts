import { create } from 'zustand';
import {
  applyNodeChanges,
  applyEdgeChanges,
  type NodeChange,
  type EdgeChange,
} from '@xyflow/react';
import type { BotFlow, FlowNode, FlowNodeType, TransitionCondition } from '../flow-types';
import { botFlowToGraph } from '../mapping/to-react-flow';
import { graphToBotFlow } from '../mapping/to-bot-flow';
import { conditionLabel } from '../mapping/rf-types';
import type { DesignerRFNode, DesignerRFEdge } from '../mapping/rf-types';

/** Genera un id de nodo único sin dependencia externa (uuid no está en deps). */
function newNodeId(): string {
  return `node_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Content mínimo válido por tipo de nodo. Evita crashes en el Inspector
 * cuando se arrastra un nodo nuevo desde la paleta al canvas.
 */
function defaultContent(type: FlowNodeType): FlowNode['content'] {
  switch (type) {
    case 'send_text':
      return { text: '' };
    case 'send_buttons':
      return { text: '', buttons: [{ id: 'btn_1', title: 'Opción 1' }] };
    case 'send_list':
      return {
        text: '',
        button_label: 'Ver opciones',
        sections: [{ type: 'static', title: 'Sección 1', items: [{ id: 'item_1', title: 'Ítem 1' }] }],
      };
    case 'send_media':
      return { media_type: 'image', url: '' };
    case 'wait_input':
      return { prompt: '' };
    case 'escape_to_human':
      return { user_response: 'En breve te atenderemos.', owner_alert_template: 'Cliente necesita ayuda.' };
    case 'end':
      return {};
    case 'send_cta_url':
      return { body: '', button: { display_text: 'Ver más', url: 'https://' } };
    case 'send_location_request':
      return { body: '' };
    case 'send_media_carousel':
      return {
        body: '',
        cards: [{
          header: { type: 'image', link: '' },
          body: '',
          buttons: [{ type: 'quick_reply', id: 'btn_c1', title: 'Seleccionar' }],
        }],
      };
    case 'send_reaction':
      return { emoji: '👍', target: 'last_user_message' };
    case 'request_call_permission':
      return { body: '' };
    case 'send_whatsapp_flow':
      return { body: '', whatsapp_flow_id: '', flow_cta: 'Empezar', mode: 'draft' };
  }
}

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

  /** Agrega un nodo nuevo al canvas en la posición indicada (coordenadas del flow). */
  addNode: (type: FlowNodeType, position: { x: number; y: number }) => void;

  /** Elimina un nodo y todos los edges conectados a él. */
  deleteNode: (id: string) => void;

  /** Marca un nodo como start_node_id del flow. */
  setStartNode: (id: string) => void;

  /**
   * Agrega una transición al final de transitions[] del nodo.
   * También agrega el SourceHandle correspondiente en node.data.handles.
   */
  addTransition: (nodeId: string) => void;

  /**
   * Elimina la transición en posición `idx` de transitions[] del nodo.
   * También elimina el edge asociado y el handle de `node.data.handles`.
   */
  removeTransition: (nodeId: string, idx: number) => void;

  /**
   * Actualiza la condición de la transición `idx` del nodo.
   * Recalcula el label del handle correspondiente.
   */
  updateTransitionCondition: (
    nodeId: string,
    idx: number,
    condition: TransitionCondition,
  ) => void;

  /**
   * Mueve la transición de `fromIdx` a `toIdx` (reordena).
   * Reordena los handles y los edges con sourceHandle t<idx>.
   */
  moveTransition: (nodeId: string, fromIdx: number, toIdx: number) => void;
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

  addNode: (type, position) => {
    const id = newNodeId();
    const node = {
      id,
      type,
      transitions: [],
      content: defaultContent(type),
    } as FlowNode;

    const newRFNode: DesignerRFNode = {
      id,
      type,
      position,
      data: {
        node,
        isStart: get().nodes.length === 0, // primer nodo = start automáticamente
        handles: [],
      },
    };

    set((s) => ({
      dirty: true,
      startNodeId: s.nodes.length === 0 ? id : s.startNodeId,
      nodes: [...s.nodes, newRFNode],
    }));
  },

  deleteNode: (id) => {
    set((s) => {
      const nextNodes = s.nodes.filter((n) => n.id !== id);
      const nextEdges = s.edges.filter((e) => e.source !== id && e.target !== id);
      // Si se borra el start node, el nuevo start es el primer nodo restante.
      const nextStart =
        s.startNodeId === id
          ? (nextNodes[0]?.id ?? '')
          : s.startNodeId;
      // Actualizar isStart en el nuevo start node.
      const withStart = nextNodes.map((n) => ({
        ...n,
        data: { ...n.data, isStart: n.id === nextStart },
      }));
      return {
        dirty: true,
        nodes: withStart,
        edges: nextEdges,
        startNodeId: nextStart,
        selectedId: s.selectedId === id ? null : s.selectedId,
      };
    });
  },

  setStartNode: (id) => {
    set((s) => ({
      dirty: true,
      startNodeId: id,
      nodes: s.nodes.map((n) => ({
        ...n,
        data: { ...n.data, isStart: n.id === id },
      })),
    }));
  },

  addTransition: (nodeId) => {
    set((s) => ({
      dirty: true,
      nodes: s.nodes.map((n) => {
        if (n.id !== nodeId) return n;
        const newTransition = { condition: { type: 'default' as const }, next_node_id: '' };
        const nextTransitions = [...n.data.node.transitions, newTransition];
        const nextNode = {
          ...n.data.node,
          transitions: nextTransitions,
        } as FlowNode;
        const nextHandles = nextTransitions.map((t, idx) => ({
          id: `t${idx}`,
          label: conditionLabel(t.condition, nextNode),
        }));
        return {
          ...n,
          data: { ...n.data, node: nextNode, handles: nextHandles },
        };
      }),
    }));
  },

  removeTransition: (nodeId, idx) => {
    set((s) => {
      // El handle id que va a desaparecer es `t<idx>`. Borrar también el edge.
      const handleToRemove = `t${idx}`;
      const nextEdges = s.edges.filter(
        (e) => !(e.source === nodeId && e.sourceHandle === handleToRemove),
      );
      // Renombrar handles de los edges que estaban después del borrado.
      const reindexedEdges = nextEdges.map((e) => {
        if (e.source !== nodeId) return e;
        const match = e.sourceHandle?.match(/^t(\d+)$/);
        if (!match) return e;
        const oldIdx = parseInt(match[1], 10);
        if (oldIdx <= idx) return e;
        return { ...e, sourceHandle: `t${oldIdx - 1}`, id: `${nodeId}__t${oldIdx - 1}` };
      });

      const nextNodes = s.nodes.map((n) => {
        if (n.id !== nodeId) return n;
        const nextTransitions = n.data.node.transitions.filter((_, i) => i !== idx);
        const nextNode = { ...n.data.node, transitions: nextTransitions } as FlowNode;
        const nextHandles = nextTransitions.map((t, i) => ({
          id: `t${i}`,
          label: conditionLabel(t.condition, nextNode),
        }));
        return { ...n, data: { ...n.data, node: nextNode, handles: nextHandles } };
      });

      return { dirty: true, nodes: nextNodes, edges: reindexedEdges };
    });
  },

  updateTransitionCondition: (nodeId, idx, condition) => {
    set((s) => ({
      dirty: true,
      nodes: s.nodes.map((n) => {
        if (n.id !== nodeId) return n;
        const nextTransitions = n.data.node.transitions.map((t, i) =>
          i === idx ? { ...t, condition } : t,
        );
        const nextNode = { ...n.data.node, transitions: nextTransitions } as FlowNode;
        const nextHandles = nextTransitions.map((t, i) => ({
          id: `t${i}`,
          label: conditionLabel(t.condition, nextNode),
        }));
        return { ...n, data: { ...n.data, node: nextNode, handles: nextHandles } };
      }),
    }));
  },

  moveTransition: (nodeId, fromIdx, toIdx) => {
    if (fromIdx === toIdx) return;
    set((s) => {
      const nextNodes = s.nodes.map((n) => {
        if (n.id !== nodeId) return n;
        const ts = [...n.data.node.transitions];
        const [moved] = ts.splice(fromIdx, 1);
        ts.splice(toIdx, 0, moved);
        const nextNode = { ...n.data.node, transitions: ts } as FlowNode;
        const nextHandles = ts.map((t, i) => ({
          id: `t${i}`,
          label: conditionLabel(t.condition, nextNode),
        }));
        return { ...n, data: { ...n.data, node: nextNode, handles: nextHandles } };
      });

      // Reindexar edges: mapear t<fromIdx>→t<toIdx> y los demás según el reordering.
      const nextEdges = s.edges.map((e) => {
        if (e.source !== nodeId) return e;
        const match = e.sourceHandle?.match(/^t(\d+)$/);
        if (!match) return e;
        const oldIdx = parseInt(match[1], 10);
        // Calcular nuevo índice según el movimiento.
        let newIdx = oldIdx;
        if (oldIdx === fromIdx) {
          newIdx = toIdx;
        } else if (fromIdx < toIdx && oldIdx > fromIdx && oldIdx <= toIdx) {
          newIdx = oldIdx - 1;
        } else if (fromIdx > toIdx && oldIdx >= toIdx && oldIdx < fromIdx) {
          newIdx = oldIdx + 1;
        }
        if (newIdx === oldIdx) return e;
        return { ...e, sourceHandle: `t${newIdx}`, id: `${nodeId}__t${newIdx}` };
      });

      return { dirty: true, nodes: nextNodes, edges: nextEdges };
    });
  },
}));
