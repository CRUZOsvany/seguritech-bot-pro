import type { BotFlow } from '../flow-types';

/**
 * Validador de estructura de grafo del Bot Designer (client-side, A2.4).
 *
 * Cubre lo que el backend NO valida o solo valida parcialmente, y lo muestra
 * ANTES del round-trip de publicación:
 *   - referencias colgantes (next_node_id vacío o a nodo inexistente)
 *   - start_node_id inválido
 *   - ausencia de nodo `end` alcanzable
 *   - nodos inalcanzables desde start (huérfanos)
 *   - ciclos en el grafo dirigido
 *
 * NO valida límites Meta (títulos, longitudes, conteos) — eso es del backend.
 *
 * Es una función PURA: sin React, sin estado. Testeable en aislamiento.
 */

export type ValidationSeverity = 'error' | 'warning';

export interface ValidationIssue {
  severity: ValidationSeverity;
  /** Código estable para tests y posibles traducciones. */
  code:
    | 'start_missing'
    | 'start_unresolved'
    | 'dangling_transition'
    | 'transition_to_missing'
    | 'no_end_reachable'
    | 'unreachable_node'
    | 'node_no_transitions'
    | 'cycle_detected'
    | 'duplicate_condition';
  message: string;
  /** Nodo(s) implicados, para resaltar en el canvas en versiones futuras. */
  nodeIds: string[];
}

export interface ValidationResult {
  issues: ValidationIssue[];
  errorCount: number;
  warningCount: number;
  /** true si NO hay errores (solo entonces se puede publicar sin override). */
  canPublish: boolean;
}

/**
 * Valida la estructura del grafo de un BotFlow.
 */
export function validateGraph(flow: BotFlow): ValidationResult {
  const issues: ValidationIssue[] = [];
  const nodes = flow.nodes;
  const ids = new Set(nodes.map((n) => n.id));
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  // ── 1. start_node_id ─────────────────────────────────────────────────────
  if (!flow.start_node_id) {
    issues.push({
      severity: 'error',
      code: 'start_missing',
      message: 'El flujo no tiene nodo de inicio (start_node_id vacío).',
      nodeIds: [],
    });
  } else if (!ids.has(flow.start_node_id)) {
    issues.push({
      severity: 'error',
      code: 'start_unresolved',
      message: `El nodo de inicio "${flow.start_node_id}" no existe en el flujo.`,
      nodeIds: [flow.start_node_id],
    });
  }

  // ── 2. Referencias de transiciones ───────────────────────────────────────
  for (const node of nodes) {
    node.transitions.forEach((t, idx) => {
      if (!t.next_node_id) {
        issues.push({
          severity: 'error',
          code: 'dangling_transition',
          message: `El nodo "${node.id}" tiene la transición #${idx + 1} sin conectar (sin destino).`,
          nodeIds: [node.id],
        });
      } else if (!ids.has(t.next_node_id)) {
        issues.push({
          severity: 'error',
          code: 'transition_to_missing',
          message: `El nodo "${node.id}" tiene una transición a "${t.next_node_id}", que no existe.`,
          nodeIds: [node.id, t.next_node_id],
        });
      }
    });
  }

  // ── 3. Condiciones duplicadas dentro del mismo nodo ──────────────────────
  for (const node of nodes) {
    const seen = new Map<string, number>();
    node.transitions.forEach((t) => {
      // Clave de condición: tipo + payload relevante.
      let key: string;
      switch (t.condition.type) {
        case 'button':
          key = `button:${t.condition.value}`;
          break;
        case 'list_item':
          key = `list_item:${t.condition.value}`;
          break;
        case 'keyword':
          key = `keyword:${[...t.condition.values].sort().join(',')}`;
          break;
        case 'list_item_any':
          key = 'list_item_any';
          break;
        case 'call_permission_granted':
          key = 'call_permission_granted';
          break;
        case 'call_permission_denied':
          key = 'call_permission_denied';
          break;
        case 'default':
          key = 'default';
          break;
      }
      seen.set(key, (seen.get(key) ?? 0) + 1);
    });
    for (const [key, count] of seen) {
      if (count > 1) {
        issues.push({
          severity: 'warning',
          code: 'duplicate_condition',
          message: `El nodo "${node.id}" tiene ${count} transiciones con la misma condición (${key}). Solo la primera se evaluará.`,
          nodeIds: [node.id],
        });
      }
    }
  }

  // ── 4. Alcanzabilidad (BFS desde start) ──────────────────────────────────
  const reachable = new Set<string>();
  if (flow.start_node_id && ids.has(flow.start_node_id)) {
    const queue: string[] = [flow.start_node_id];
    reachable.add(flow.start_node_id);
    while (queue.length > 0) {
      const current = queue.shift() as string;
      const node = nodeById.get(current);
      if (!node) continue;
      for (const t of node.transitions) {
        if (t.next_node_id && ids.has(t.next_node_id) && !reachable.has(t.next_node_id)) {
          reachable.add(t.next_node_id);
          queue.push(t.next_node_id);
        }
      }
    }
  }

  // Nodos inalcanzables (warning).
  for (const node of nodes) {
    if (!reachable.has(node.id)) {
      issues.push({
        severity: 'warning',
        code: 'unreachable_node',
        message: `El nodo "${node.id}" (${node.type}) no es alcanzable desde el inicio.`,
        nodeIds: [node.id],
      });
    }
  }

  // ── 5. Existe nodo `end` alcanzable ──────────────────────────────────────
  const hasReachableEnd = nodes.some((n) => n.type === 'end' && reachable.has(n.id));
  if (!hasReachableEnd && nodes.length > 0) {
    issues.push({
      severity: 'error',
      code: 'no_end_reachable',
      message: 'No hay ningún nodo "Fin" (end) alcanzable desde el inicio. El flujo nunca termina limpiamente.',
      nodeIds: [],
    });
  }

  // ── 6. Nodos no-end sin transiciones (warning) ───────────────────────────
  for (const node of nodes) {
    if (node.type !== 'end' && node.transitions.length === 0 && reachable.has(node.id)) {
      issues.push({
        severity: 'warning',
        code: 'node_no_transitions',
        message: `El nodo "${node.id}" (${node.type}) no tiene transiciones de salida y no es un "Fin".`,
        nodeIds: [node.id],
      });
    }
  }

  // ── 7. Detección de ciclos (DFS 3-colores) ───────────────────────────────
  // white = no visitado, gray = en pila de recursión, black = terminado.
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  for (const n of nodes) color.set(n.id, WHITE);

  const cycleNodes = new Set<string>();

  function dfs(nodeId: string, path: string[]): void {
    color.set(nodeId, GRAY);
    path.push(nodeId);
    const node = nodeById.get(nodeId);
    if (node) {
      for (const t of node.transitions) {
        const next = t.next_node_id;
        if (!next || !ids.has(next)) continue;
        const c = color.get(next);
        if (c === GRAY) {
          // back-edge: ciclo. Registrar los nodos del ciclo (desde next hasta el final del path).
          const cycleStart = path.indexOf(next);
          if (cycleStart >= 0) {
            for (let i = cycleStart; i < path.length; i++) {
              cycleNodes.add(path[i]);
            }
          }
        } else if (c === WHITE) {
          dfs(next, path);
        }
      }
    }
    path.pop();
    color.set(nodeId, BLACK);
  }

  for (const n of nodes) {
    if (color.get(n.id) === WHITE) {
      dfs(n.id, []);
    }
  }

  if (cycleNodes.size > 0) {
    issues.push({
      severity: 'warning',
      code: 'cycle_detected',
      message: `Hay un ciclo en el flujo que involucra: ${[...cycleNodes].join(', ')}. Verifica que tenga una salida.`,
      nodeIds: [...cycleNodes],
    });
  }

  // ── Resultado ─────────────────────────────────────────────────────────────
  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const warningCount = issues.filter((i) => i.severity === 'warning').length;

  return {
    issues,
    errorCount,
    warningCount,
    canPublish: errorCount === 0,
  };
}
