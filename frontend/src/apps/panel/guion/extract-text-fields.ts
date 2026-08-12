import { CONFIG_BOUND_LABELS, type ConfigBoundKey } from '../designer/flow-types';

/**
 * Aplana TODOS los textos editables de un BotFlow a filas planas para el
 * Guion (P7). Opera sobre `unknown` a propósito: el draft del backend NO
 * está validado (puede ser parcial mientras se edita en el Designer) — el
 * Guion no puede darse el lujo de asumir forma estricta como sí hace el
 * Designer (que cae a EMPTY_FLOW si `isBotFlowish` falla). Aquí cada campo
 * se lee defensivamente; un nodo con forma rara simplemente no aporta filas,
 * no revienta la tabla completa.
 *
 * Alcance deliberado: solo los campos de TEXTO LIBRE que el bot dice
 * (body/prompt/caption/footer/etc.), no etiquetas cortas de UI como
 * `button.title` o `button_label` — esas son configuración de interacción,
 * no guion. `config_bound` (P3) solo aplica al campo `content.text` de
 * send_text/send_buttons/send_list, igual que en el backend
 * (FlowSchema.superRefine) y en el Designer (NodeInspectorForm).
 */

export interface GuionRow {
  /** Clave estable para React y para localizar la fila al editar/guardar. */
  key: string;
  nodeId: string;
  nodeType: string;
  /** Ruta dentro de `node.content` para reescribir el valor (path-based set). */
  path: Array<string | number>;
  /** Ej: "Texto principal", "Pie de página", "Card 2 · Texto". */
  label: string;
  text: string;
  /** Solo presente si el nodo declara config_bound Y este campo es el gobernado. */
  configBound?: ConfigBoundKey[];
}

function isObj(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

export function extractGuionRows(flow: unknown): GuionRow[] {
  if (!isObj(flow) || !Array.isArray(flow.nodes)) return [];
  const rows: GuionRow[] = [];

  for (const rawNode of flow.nodes) {
    if (!isObj(rawNode) || typeof rawNode.id !== 'string' || typeof rawNode.type !== 'string') {
      continue;
    }
    const nodeId = rawNode.id;
    const nodeType = rawNode.type;
    const content = isObj(rawNode.content) ? rawNode.content : {};
    const configBound = Array.isArray(rawNode.config_bound)
      ? (rawNode.config_bound as ConfigBoundKey[])
      : undefined;

    const push = (
      path: Array<string | number>,
      label: string,
      text: unknown,
      bound?: ConfigBoundKey[],
    ) => {
      if (!isNonEmptyString(text)) return;
      rows.push({
        key: `${nodeId}::${path.join('.')}`,
        nodeId,
        nodeType,
        path,
        label,
        text,
        configBound: bound,
      });
    };

    switch (nodeType) {
      case 'send_text':
        push(['content', 'text'], 'Texto', content.text, configBound);
        break;

      case 'send_buttons':
        push(['content', 'text'], 'Texto del mensaje', content.text, configBound);
        break;

      case 'send_list':
        push(['content', 'text'], 'Texto del mensaje', content.text, configBound);
        break;

      case 'wait_input':
        push(['content', 'prompt'], 'Pregunta al usuario', content.prompt);
        break;

      case 'escape_to_human':
        push(['content', 'user_response'], 'Respuesta al cliente', content.user_response);
        push(['content', 'owner_alert_template'], 'Aviso al dueño', content.owner_alert_template);
        break;

      case 'send_media':
        push(['content', 'caption'], 'Descripción (caption)', content.caption);
        break;

      case 'send_cta_url':
        push(['content', 'body'], 'Texto principal', content.body);
        push(['content', 'footer'], 'Pie de página', content.footer);
        if (isObj(content.header) && content.header.type === 'text') {
          push(['content', 'header', 'text'], 'Encabezado', content.header.text);
        }
        break;

      case 'send_location_request':
        push(['content', 'body'], 'Texto principal', content.body);
        break;

      case 'send_media_carousel':
        push(['content', 'body'], 'Texto principal', content.body);
        if (Array.isArray(content.cards)) {
          content.cards.forEach((card, i) => {
            if (isObj(card)) {
              push(['content', 'cards', i, 'body'], `Card ${i + 1} · Texto`, card.body);
            }
          });
        }
        break;

      case 'request_call_permission':
        push(['content', 'body'], 'Texto principal', content.body);
        push(['content', 'footer'], 'Pie de página', content.footer);
        break;

      case 'send_whatsapp_flow':
        push(['content', 'body'], 'Texto principal', content.body);
        push(['content', 'header'], 'Encabezado', content.header);
        push(['content', 'footer'], 'Pie de página', content.footer);
        break;

      // send_reaction, end: sin texto libre — no aportan filas.
      default:
        break;
    }
  }

  return rows;
}

/** Etiqueta legible de config_bound para mostrar junto al candado. */
export function configBoundLabel(keys: ConfigBoundKey[]): string {
  return keys.map((k) => CONFIG_BOUND_LABELS[k] ?? k).join(' + ');
}

/**
 * Reescribe el texto de la fila (nodeId + path relativo al nodo, ej.
 * ['content','text'] o ['content','cards',0,'body']) dentro de `flow`,
 * devolviendo un flow NUEVO — nunca muta el original. Clona solo la rama
 * tocada (flow → nodes[] → el nodo → ... → el campo) para que el resto de
 * las referencias no cambien innecesariamente.
 */
export function setAtPath(
  flow: unknown,
  nodeId: string,
  path: Array<string | number>,
  text: string,
): unknown {
  if (!isObj(flow) || !Array.isArray(flow.nodes)) return flow;

  const nodes = flow.nodes.map((rawNode) => {
    if (!isObj(rawNode) || rawNode.id !== nodeId) return rawNode;

    // Clona la cadena de contenedores desde el nodo hasta el campo objetivo.
    const nodeClone: Record<string, unknown> = { ...rawNode };
    let cursor: Record<string, unknown> | unknown[] = nodeClone;

    for (let i = 0; i < path.length - 1; i++) {
      const key = path[i];
      const current = (cursor as Record<string | number, unknown>)[key];
      const nextClone = Array.isArray(current) ? [...current] : { ...(current as object) };
      (cursor as Record<string | number, unknown>)[key] = nextClone;
      cursor = nextClone as Record<string, unknown> | unknown[];
    }

    (cursor as Record<string | number, unknown>)[path[path.length - 1]] = text;
    return nodeClone;
  });

  return { ...flow, nodes };
}
