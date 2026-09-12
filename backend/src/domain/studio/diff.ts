import type { BotFlow, FlowNode, Transition, TransitionCondition } from '@/domain/entities/flow';

/**
 * Qué cambió entre dos versiones de un flow, en términos de quien lo diseña
 * (Studio Fase 4): pasos agregados o quitados, textos que cambiaron y
 * salidas que ahora llevan a otro lado.
 *
 * `before` suele ser lo publicado y `after` el borrador. Los metadatos del
 * asistente (`studio`) no cuentan: el diff es de lo que el bot hace.
 */
export interface FlowDiff {
  startChanged: { from: string; to: string } | null;
  added: string[];
  removed: string[];
  changed: Array<{ nodeId: string; changes: string[] }>;
  /** Sin ningún cambio. */
  same: boolean;
}

export function diffFlows(before: BotFlow | null, after: BotFlow): FlowDiff {
  const oldNodes = new Map((before?.nodes ?? []).map((n) => [n.id, n]));
  const newNodes = new Map(after.nodes.map((n) => [n.id, n]));

  const added = after.nodes.filter((n) => !oldNodes.has(n.id)).map((n) => n.id);
  const removed = (before?.nodes ?? []).filter((n) => !newNodes.has(n.id)).map((n) => n.id);
  const changed: FlowDiff['changed'] = [];
  for (const n of after.nodes) {
    const old = oldNodes.get(n.id);
    if (!old) continue;
    const changes = nodeChanges(old, n);
    if (changes.length > 0) changed.push({ nodeId: n.id, changes });
  }
  const startChanged =
    before && before.start_node_id !== after.start_node_id ? { from: before.start_node_id, to: after.start_node_id } : null;

  return {
    startChanged,
    added,
    removed,
    changed,
    same: !startChanged && added.length === 0 && removed.length === 0 && changed.length === 0,
  };
}

const TYPE_LABEL: Partial<Record<FlowNode['type'], string>> = {
  send_text: 'texto',
  send_buttons: 'botones',
  send_list: 'lista',
  wait_input: 'pregunta',
  search_catalog: 'búsqueda en catálogo',
  escape_to_human: 'paso a humano',
  send_media_carousel: 'carrusel',
  end: 'fin',
};
const typeLabel = (t: FlowNode['type']) => TYPE_LABEL[t] ?? t;

function nodeChanges(before: FlowNode, after: FlowNode): string[] {
  if (before.type !== after.type) return [`cambió de ${typeLabel(before.type)} a ${typeLabel(after.type)}`];

  const out: string[] = [];
  const oldFields = flatten(before.content);
  const newFields = flatten(after.content);
  for (const [path, value] of newFields) {
    const prev = oldFields.get(path);
    if (prev === undefined) out.push(`${label(path)}: nuevo «${short(value)}»`);
    else if (prev !== value) out.push(`${label(path)}: «${short(prev)}» → «${short(value)}»`);
  }
  for (const [path, value] of oldFields) {
    if (!newFields.has(path)) out.push(`${label(path)}: se quitó «${short(value)}»`);
  }

  const oldExits = exits(before.transitions as Transition[]);
  const newExits = exits(after.transitions as Transition[]);
  for (const [key, target] of newExits) {
    const prev = oldExits.get(key);
    if (prev === undefined) out.push(`salida nueva: ${key} → «${target}»`);
    else if (prev !== target) out.push(`${key} ahora lleva a «${target}» (antes «${prev}»)`);
  }
  for (const [key, target] of oldExits) {
    if (!newExits.has(key)) out.push(`se quitó la salida ${key} → «${target}»`);
  }
  return out;
}

/** Contenido del paso como pares ruta → valor, solo hojas. */
function flatten(value: unknown, prefix = ''): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (v: unknown, path: string) => {
    if (v === null || v === undefined) return;
    if (Array.isArray(v)) v.forEach((item, i) => walk(item, `${path}[${i}]`));
    else if (typeof v === 'object') for (const [k, inner] of Object.entries(v)) walk(inner, path ? `${path}.${k}` : k);
    else out.set(path, String(v));
  };
  walk(value, prefix);
  return out;
}

/** "buttons[1].title" → "botón 2 · title"; lo demás tal cual, legible. */
function label(path: string): string {
  return path
    .replace(/^text$/, 'texto')
    .replace(/buttons\[(\d+)\]\.title/g, (_m, i) => `botón ${Number(i) + 1}`)
    .replace(/items\[(\d+)\]\.title/g, (_m, i) => `opción ${Number(i) + 1}`)
    .replace(/items\[(\d+)\]\.description/g, (_m, i) => `descripción de la opción ${Number(i) + 1}`)
    .replace(/sections\[(\d+)\]\./g, '')
    .replace(/^prompt$/, 'pregunta')
    .replace(/^user_response$/, 'respuesta al cliente')
    .replace(/^owner_alert_template$/, 'alerta al dueño');
}

/** Clave estable de una salida: su condición (sin importar posición). */
function exits(transitions: Transition[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const t of transitions) out.set(describe(t.condition), t.next_node_id);
  return out;
}

function describe(c: TransitionCondition): string {
  switch (c.type) {
  case 'button':
  case 'list_item':
    return `${c.type} "${c.value}"`;
  case 'keyword':
    return `palabras (${short(c.values.join(', '), 40)})`;
  default:
    return c.type;
  }
}

function short(text: string, max = 60): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1)}…`;
}
