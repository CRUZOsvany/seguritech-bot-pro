import type {
  EscapeToHumanNode,
  FlowNode,
  SendButtonsNode,
  SendTextNode,
  WaitInputNode,
} from '@/domain/entities/flow';
import {
  BlockExpansionError,
  nodeId,
  type BlockExpansion,
  type CapturaEscaladoSpec,
} from './types';

/**
 * Bloque Captura y escalado: pide N datos, uno por turno, resume, confirma
 * y escala a un humano con todo el contexto.
 *
 * Un dato por turno es deliberado. Pedir tres cosas en un mensaje ("mándame
 * nombre, dirección y teléfono") produce respuestas que el motor determinista
 * no puede separar; un `wait_input` por dato guarda cada uno en su clave y el
 * resumen los recompone.
 *
 * El escalado nunca es ciego: `owner_alert_template` viaja con las claves
 * capturadas, así que el dueño recibe el lead completo y no un "alguien
 * necesita ayuda".
 *
 * CICLO DELIBERADO: la salida `corregir` vuelve al primer dato, lo que crea
 * un ciclo en el grafo y dispara R-F13 (warning). Es correcto: el ciclo tiene
 * salida (confirmar) y sin él "me equivoqué" obligaría a reiniciar toda la
 * conversación. Ver BLOQUES_COMPUESTOS.md.
 */
export function expandCapturaEscalado(spec: CapturaEscaladoSpec): BlockExpansion {
  if (spec.datos.length === 0) {
    throw new BlockExpansionError(
      'Captura y escalado necesita al menos un dato que pedir.',
      spec.id,
    );
  }

  const claves = spec.datos.map((d) => d.clave);
  if (new Set(claves).size !== claves.length) {
    throw new BlockExpansionError(
      'Dos datos comparten la misma clave: el segundo pisaría al primero en el contexto.',
      spec.id,
    );
  }

  const resumenId = nodeId(spec.id, 'resumen');
  const confirmarId = nodeId(spec.id, 'confirmar');
  const escaladoId = nodeId(spec.id, 'escalado');

  const preguntaId = (i: number) => nodeId(spec.id, `dato_${i}`);

  // Cadena de wait_input: cada uno apunta al siguiente, el último al resumen.
  const preguntas: WaitInputNode[] = spec.datos.map((dato, i) => ({
    id: preguntaId(i),
    type: 'wait_input',
    content: { prompt: dato.pregunta, save_to_context: dato.clave },
    transitions: [
      {
        condition: { type: 'default' },
        next_node_id: i + 1 < spec.datos.length ? preguntaId(i + 1) : resumenId,
      },
    ],
  }));

  const resumen: SendTextNode = {
    id: resumenId,
    type: 'send_text',
    content: { text: spec.resumen },
    transitions: [{ condition: { type: 'default' }, next_node_id: confirmarId }],
  };

  const confirmar: SendButtonsNode = {
    id: confirmarId,
    type: 'send_buttons',
    content: {
      text: '¿Es correcto?',
      buttons: [
        { id: 'confirmar', title: 'Sí, es correcto' },
        { id: 'corregir', title: 'Corregir' },
      ],
    },
    transitions: [
      { condition: { type: 'button', value: 'confirmar' }, next_node_id: escaladoId },
      // Ciclo deliberado: vuelve al primer dato. Dispara R-F13 a propósito.
      { condition: { type: 'button', value: 'corregir' }, next_node_id: preguntaId(0) },
      // Sin `default` el nodo se quedaría re-renderizando ante texto libre.
      { condition: { type: 'default' }, next_node_id: confirmarId },
    ],
  };

  const escalado: EscapeToHumanNode = {
    id: escaladoId,
    type: 'escape_to_human',
    content: {
      user_response: spec.respuestaCliente,
      owner_alert_template: spec.avisoDueno,
    },
    transitions: [],
  };

  const nodes: FlowNode[] = [...preguntas, resumen, confirmar, escalado];

  return {
    nodes,
    entryNodeId: preguntaId(0),
    outlets: [
      {
        id: 'next',
        label: 'Después de escalar',
        fromNodeIds: [escaladoId],
        condition: { type: 'default' },
      },
    ],
  };
}
