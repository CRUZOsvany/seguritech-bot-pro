import type { BotFlow, FlowNode, Transition } from '@/domain/entities/flow';
import { WHATSAPP_LIMITS as L } from '@/domain/whatsapp/limits';

/**
 * Fusión de mensajes (Fase 5, V-COSTO-01): un texto suelto que sale justo
 * antes de otro texto o de un menú se convierte en ese mismo mensaje con el
 * texto arriba. Un mensaje menos por conversación.
 *
 * El texto se transforma EN SU LUGAR (conserva su id), así nada que llegaba
 * a él cambia de destino. El mensaje que le seguía se queda si algo más lo
 * usa (otra salida, el inicio, una palabra de escape, un tope de intentos) y
 * se quita si ya no.
 *
 * Pura: no guarda nada. El Designer carga el resultado al lienzo y el
 * operador guarda como siempre.
 */

export type MergePlan =
  | { ok: true; flow: BotFlow; removed: string | null }
  | { ok: false; reason: string };

type Mergeable = Extract<FlowNode, { type: 'send_text' | 'send_buttons' | 'send_list' }>;
const MERGEABLE = new Set<FlowNode['type']>(['send_text', 'send_buttons', 'send_list']);

export function planMerge(flow: BotFlow, nodeId: string): MergePlan {
  const byId = new Map(flow.nodes.map((n) => [n.id, n]));
  const text = byId.get(nodeId);
  if (!text) return { ok: false, reason: `no existe el paso «${nodeId}»` };
  if (text.type !== 'send_text') return { ok: false, reason: `«${nodeId}» no es un texto suelto` };
  const exits = text.transitions as Transition[];
  if (exits.length !== 1 || exits[0].condition.type !== 'default') {
    return { ok: false, reason: `«${nodeId}» no sigue a un solo paso` };
  }
  const found = byId.get(exits[0].next_node_id);
  if (!found || found.id === text.id || !MERGEABLE.has(found.type)) {
    return { ok: false, reason: 'lo que sigue no es un texto ni un menú' };
  }
  const next = found as Mergeable;

  const textBound = text.config_bound ?? [];
  const nextBound = next.config_bound ?? [];
  if ((textBound.length > 0) !== (nextBound.length > 0)) {
    return { ok: false, reason: 'uno de los dos textos es del negocio y el otro no; juntarlos rompería el candado de config_bound' };
  }

  const body = `${text.content.text}\n\n${next.content.text}`;
  const max = next.type === 'send_text' ? L.text.bodyMax : next.type === 'send_buttons' ? L.replyButtons.bodyMax : L.list.bodyMax;
  if ([...body].length > max) return { ok: false, reason: `juntos pasan de ${max} caracteres` };

  const merged = structuredClone(next) as Mergeable;
  delete merged.config_bound;
  merged.id = text.id;
  merged.content = { ...merged.content, text: body } as Mergeable['content'];
  if (textBound.length > 0) merged.config_bound = [...textBound, ...nextBound];

  let nodes = flow.nodes.map((n) => (n.id === text.id ? (merged as FlowNode) : n));
  const removed = isReferenced(flow, nodes, next.id) ? null : next.id;
  if (removed) nodes = nodes.filter((n) => n.id !== removed);
  return { ok: true, flow: { ...flow, nodes }, removed };
}

function isReferenced(flow: BotFlow, nodes: FlowNode[], id: string): boolean {
  if (flow.start_node_id === id || flow.escape?.menu?.node_id === id || flow.escape?.human?.node_id === id) return true;
  return nodes.some(
    (n) =>
      n.id !== id &&
      ((n.transitions as Transition[]).some((t) => t.next_node_id === id) ||
        (n.type === 'wait_input' && n.content.on_exhausted === id)),
  );
}
