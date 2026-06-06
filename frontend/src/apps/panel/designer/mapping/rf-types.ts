import type { Node, Edge } from '@xyflow/react';
import type { FlowNode, TransitionCondition } from '../flow-types';

/**
 * Descriptor de un source handle de un nodo. Hay UNO por cada transición del
 * nodo, indexado por su posición en `node.transitions`. El `id` (`t<idx>`) es
 * lo que viaja en `edge.sourceHandle`, de modo que `graphToBotFlow` reconstruye
 * la transición correcta sin perder su `condition` (sección B del contrato).
 */
export interface SourceHandleDesc {
  /** `t0`, `t1`, ... — índice de la transición en node.transitions. */
  id: string;
  /** Texto corto para mostrar junto al handle (derivado de la condición). */
  label: string;
}

/**
 * Data que cada node de React Flow lleva. Es la FUENTE DE VERDAD del contenido
 * y de las condiciones; los edges solo cablean `next_node_id`. Se usa `type`
 * (no `interface`) para que sea asignable a `Record<string, unknown>`, que es
 * la constraint de `Node` en @xyflow/react v12.
 */
export type DesignerNodeData = {
  node: FlowNode;
  isStart: boolean;
  handles: SourceHandleDesc[];
};

export type DesignerRFNode = Node<DesignerNodeData>;
export type DesignerRFEdge = Edge;

/** Handle de entrada único por nodo. */
export const TARGET_HANDLE_ID = 'in';

/** Etiqueta corta y legible para un source handle según su condición. */
export function conditionLabel(condition: TransitionCondition, node: FlowNode): string {
  switch (condition.type) {
    case 'button': {
      if (node.type === 'send_buttons') {
        const btn = node.content.buttons.find((b) => b.id === condition.value);
        if (btn) return btn.title;
      }
      return condition.value;
    }
    case 'list_item': {
      if (node.type === 'send_list') {
        for (const sec of node.content.sections) {
          if (sec.type === 'static') {
            const it = sec.items.find((i) => i.id === condition.value);
            if (it) return it.title;
          }
        }
      }
      return condition.value;
    }
    case 'list_item_any':
      return condition.save_to_context
        ? `cualquier ítem → ${condition.save_to_context}`
        : 'cualquier ítem';
    case 'keyword':
      return condition.values.join(' / ');
    case 'call_permission_granted':
      return 'permiso concedido';
    case 'call_permission_denied':
      return 'permiso denegado';
    case 'default':
      return 'default';
  }
}
