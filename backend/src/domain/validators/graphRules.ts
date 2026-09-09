import type { BotFlow, TransitionCondition } from '@/domain/entities/flow';

/**
 * Reglas de ESTRUCTURA del grafo que hoy solo existen en el validador del
 * canvas (`frontend/.../graphValidator.ts`), portadas al backend.
 *
 * Ver .claude/REGLAS_FLOW.md: son R-F07, R-F11, R-F12, R-F13 y R-F14. Ninguna
 * la comprueba Zod, así que hoy un flow con nodos huérfanos, callejones sin
 * salida o condiciones duplicadas se publica sin que nadie lo mencione.
 *
 * Este archivo NO cambia qué se puede publicar — `publishDraft` sigue
 * validando solo con Zod. Existe para que los bloques compuestos puedan
 * probarse contra las dos capas, que es lo que exige "el subgrafo generado
 * pasa el linter". Unificar de verdad los dos validadores es el hallazgo #4
 * de la auditoría y necesita el paquete compartido.
 *
 * Función pura, sin dependencias: el espejo exacto de la del frontend.
 */

export type GraphRuleCode =
  | 'no_end_reachable'
  | 'unreachable_node'
  | 'node_no_transitions'
  | 'cycle_detected'
  | 'duplicate_condition';

export interface GraphIssue {
  severity: 'error' | 'warning';
  code: GraphRuleCode;
  message: string;
  nodeIds: string[];
}

/** Clave de deduplicación de una condición dentro de un mismo nodo (R-F14). */
function conditionKey(c: TransitionCondition): string {
  switch (c.type) {
  case 'button':
  case 'list_item':
    return `${c.type}:${c.value}`;
  case 'keyword':
    return `keyword:${[...c.values].sort().join(',')}`;
  default:
    return c.type;
  }
}

export function checkGraphRules(flow: BotFlow): GraphIssue[] {
  const issues: GraphIssue[] = [];
  const ids = new Set(flow.nodes.map((n) => n.id));
  const byId = new Map(flow.nodes.map((n) => [n.id, n]));

  // ── Alcanzabilidad desde el inicio (BFS) ──────────────────────────────────
  const reachable = new Set<string>();
  if (flow.start_node_id && ids.has(flow.start_node_id)) {
    const queue = [flow.start_node_id];
    reachable.add(flow.start_node_id);
    while (queue.length > 0) {
      const node = byId.get(queue.shift() as string);
      if (!node) continue;
      for (const t of node.transitions) {
        if (t.next_node_id && ids.has(t.next_node_id) && !reachable.has(t.next_node_id)) {
          reachable.add(t.next_node_id);
          queue.push(t.next_node_id);
        }
      }
    }
  }

  // ── R-F07: existe un `end` ALCANZABLE ────────────────────────────────────
  // Zod solo exige que exista uno (R-F06). Un `end` huérfano satisface al
  // backend y deja al cliente sin salida.
  if (flow.nodes.length > 0 && !flow.nodes.some((n) => n.type === 'end' && reachable.has(n.id))) {
    issues.push({
      severity: 'error',
      code: 'no_end_reachable',
      message: 'No hay ningún nodo "end" alcanzable desde el inicio: el flujo nunca termina limpiamente.',
      nodeIds: [],
    });
  }

  // ── R-F11: nodos inalcanzables ───────────────────────────────────────────
  for (const node of flow.nodes) {
    if (!reachable.has(node.id)) {
      issues.push({
        severity: 'warning',
        code: 'unreachable_node',
        message: `El nodo "${node.id}" (${node.type}) no es alcanzable desde el inicio.`,
        nodeIds: [node.id],
      });
    }
  }

  // ── R-F12: nodo no-end alcanzable sin salidas ────────────────────────────
  for (const node of flow.nodes) {
    if (node.type !== 'end' && node.transitions.length === 0 && reachable.has(node.id)) {
      issues.push({
        severity: 'warning',
        code: 'node_no_transitions',
        message: `El nodo "${node.id}" (${node.type}) no tiene salidas y no es un "end".`,
        nodeIds: [node.id],
      });
    }
  }

  // ── R-F14: condiciones duplicadas en un mismo nodo ───────────────────────
  for (const node of flow.nodes) {
    const vistas = new Map<string, number>();
    for (const t of node.transitions) {
      const k = conditionKey(t.condition);
      vistas.set(k, (vistas.get(k) ?? 0) + 1);
    }
    for (const [k, n] of vistas) {
      if (n > 1) {
        issues.push({
          severity: 'warning',
          code: 'duplicate_condition',
          message: `El nodo "${node.id}" tiene ${n} transiciones con la condición (${k}); solo una puede ganar.`,
          nodeIds: [node.id],
        });
      }
    }
  }

  // ── R-F13: ciclos (DFS de 3 colores) ─────────────────────────────────────
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>(flow.nodes.map((n) => [n.id, WHITE]));
  const enCiclo = new Set<string>();

  function dfs(nodeId: string, camino: string[]): void {
    color.set(nodeId, GRAY);
    camino.push(nodeId);
    const node = byId.get(nodeId);
    if (node) {
      for (const t of node.transitions) {
        const next = t.next_node_id;
        if (!next || !ids.has(next)) continue;
        const c = color.get(next);
        if (c === GRAY) {
          const desde = camino.indexOf(next);
          if (desde >= 0) for (let i = desde; i < camino.length; i++) enCiclo.add(camino[i]);
        } else if (c === WHITE) {
          dfs(next, camino);
        }
      }
    }
    camino.pop();
    color.set(nodeId, BLACK);
  }

  for (const n of flow.nodes) {
    if (color.get(n.id) === WHITE) dfs(n.id, []);
  }

  if (enCiclo.size > 0) {
    issues.push({
      severity: 'warning',
      code: 'cycle_detected',
      message: `Ciclo en el flujo: ${[...enCiclo].join(', ')}. Comprueba que tenga salida.`,
      nodeIds: [...enCiclo],
    });
  }

  return issues;
}

/** Solo los errores. Los warnings no bloquean nada, igual que en el canvas. */
export function graphErrors(flow: BotFlow): GraphIssue[] {
  return checkGraphRules(flow).filter((i) => i.severity === 'error');
}
