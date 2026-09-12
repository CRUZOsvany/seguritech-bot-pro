import type { FlowNode, Transition } from '@/domain/entities/flow';
import { fuzzyIncludes, normalizePhrase } from '@/domain/services/textMatch';
import { WHATSAPP_LIMITS } from '@/domain/whatsapp/limits';

/**
 * Desambiguación (B-02): cuando el mensaje coincide con palabras clave de dos
 * o más salidas del mismo nivel que llevan a lugares distintos, el bot no
 * adivina: pregunta "¿Te refieres a A o a B?" con botones, y la respuesta del
 * cliente decide. Antes ganaba la primera de la lista (DEC-06).
 *
 * Solo aplica a palabras clave: botones y filas coinciden exacto y no empatan.
 */

/** Clave reservada de la sesión donde queda la pregunta pendiente. */
export const DISAMBIGUATION_KEY = '__disambiguation';

export interface DisambiguationOption {
  id: string;
  title: string;
  target: string;
}

export interface PendingDisambiguation {
  node: string;
  options: DisambiguationOption[];
}

/**
 * Las opciones a preguntar, una por destino y en el orden del paso, hasta el
 * máximo de botones de WhatsApp. null si no hay empate de verdad (un solo
 * destino).
 */
export function tiedOptions(node: FlowNode, tied: Transition[], content: string): DisambiguationOption[] | null {
  const byTarget = new Map<string, Transition>();
  for (const t of tied) if (!byTarget.has(t.next_node_id)) byTarget.set(t.next_node_id, t);
  if (byTarget.size < 2) return null;
  return [...byTarget.values()]
    .slice(0, WHATSAPP_LIMITS.replyButtons.buttonsMax)
    .map((t, i) => ({ id: `desambiguar_${i + 1}`, title: fitTitle(labelFor(node, t, content)), target: t.next_node_id }));
}

/**
 * Cómo se llama cada opción: el botón o la fila del mismo paso que lleva al
 * mismo destino (el cliente ya lo vio), o si no la palabra que coincidió.
 */
function labelFor(node: FlowNode, t: Transition, content: string): string {
  for (const other of node.transitions as Transition[]) {
    if (other.next_node_id !== t.next_node_id) continue;
    const c = other.condition;
    if (c.type === 'button' && node.type === 'send_buttons') {
      const button = node.content.buttons.find((b) => b.id === c.value);
      if (button) return button.title;
    }
    if (c.type === 'list_item' && node.type === 'send_list') {
      for (const s of node.content.sections) {
        const item = s.type === 'static' ? s.items.find((i) => i.id === c.value) : undefined;
        if (item) return item.title;
      }
    }
  }
  const c = t.condition;
  if (c.type === 'keyword') {
    const word = c.values.find((kw) => fuzzyIncludes(content, kw)) ?? c.values[0];
    return word.charAt(0).toUpperCase() + word.slice(1);
  }
  return t.next_node_id;
}

function fitTitle(title: string): string {
  const max = WHATSAPP_LIMITS.replyButtons.buttonTitleMax;
  const chars = [...title.trim()];
  return chars.length <= max ? chars.join('') : `${chars.slice(0, max - 1).join('')}…`;
}

/** "¿Te refieres a «A» o a «B»?" */
export function questionText(options: DisambiguationOption[]): string {
  const titles = options.map((o) => `«${o.title}»`);
  const list = titles.length === 2 ? `${titles[0]} o a ${titles[1]}` : `${titles.slice(0, -1).join(', ')} o ${titles.at(-1)}`;
  return `¿Te refieres a ${list}?`;
}

/** La opción que eligió el cliente: por el id del botón o escribiendo su título. */
export function resolvePending(pending: PendingDisambiguation | null | undefined, nodeId: string, content: string): DisambiguationOption | null {
  if (!pending || pending.node !== nodeId) return null;
  const text = content.trim();
  const phrase = normalizePhrase(text);
  return pending.options.find((o) => o.id === text || normalizePhrase(o.title) === phrase) ?? null;
}
