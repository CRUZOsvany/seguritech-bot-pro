import type { SendTextNode } from '@/domain/entities/flow';
import { nodeId, type BlockExpansion, type EntradaSpec } from './types';

/**
 * Bloque Entrada: el saludo.
 *
 * El texto no es editable a propósito. Siempre es `{{welcome_message}}` con
 * `config_bound` declarado, así que:
 *  - cumple R-F31 por construcción (el texto es exactamente el placeholder),
 *  - el saludo se cambia en la pestaña Mensajes del tenant, sin publicar una
 *    versión nueva del flujo,
 *  - no puede haber dos saludos distintos, uno en el traje y otro escrito a
 *    mano en el grafo.
 */
export function expandEntrada(spec: EntradaSpec): BlockExpansion {
  const saludo = nodeId(spec.id, 'saludo');

  const node: SendTextNode = {
    id: saludo,
    type: 'send_text',
    content: { text: '{{welcome_message}}' },
    config_bound: ['welcome_message'],
    transitions: [],
  };

  return {
    nodes: [node],
    entryNodeId: saludo,
    outlets: [
      {
        id: 'next',
        label: 'Después del saludo',
        fromNodeIds: [saludo],
        condition: { type: 'default' },
      },
    ],
  };
}
