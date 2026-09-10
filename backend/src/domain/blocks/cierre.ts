import type { EndNode, SendTextNode } from '@/domain/entities/flow';
import { nodeId, type BlockExpansion, type CierreSpec } from './types';

/**
 * Bloque Cierre: despedida y fin.
 *
 * Es el bloque que hace que el flujo termine limpiamente. Con al menos un
 * Cierre alcanzable, el grafo cumple R-F06 (existe un `end`) y R-F07 (es
 * alcanzable desde el inicio) — la divergencia entre el validador del canvas
 * y el del backend que documenta REGLAS_FLOW.md.
 *
 * El nodo `end` se emite sin transiciones, que es lo que exige R-F10.
 *
 * No expone salidas: es terminal por definición. La reapertura de la
 * conversación no necesita nodo — el intérprete manda al `start_node_id`
 * cuando el usuario vuelve a escribir con `currentNodeId === 'end'`.
 */
export function expandCierre(spec: CierreSpec): BlockExpansion {
  const despedida = nodeId(spec.id, 'despedida');
  const fin = nodeId(spec.id, 'fin');

  const texto: SendTextNode = {
    id: despedida,
    type: 'send_text',
    content: { text: spec.mensaje },
    transitions: [{ condition: { type: 'default' }, next_node_id: fin }],
  };

  const end: EndNode = {
    id: fin,
    type: 'end',
    content: {},
    transitions: [],
  };

  return {
    nodes: [texto, end],
    entryNodeId: despedida,
    outlets: [],
  };
}
