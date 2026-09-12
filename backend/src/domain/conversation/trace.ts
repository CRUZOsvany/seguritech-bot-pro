import type { FlowNode, TransitionCondition } from '@/domain/entities/flow';

/**
 * Traza de decisiones de un turno: el "por qué" de cada respuesta del bot.
 *
 * La producen el motor (ConversationEngine: gates antes del flow) y el
 * intérprete (FlowInterpreter: nodos y transiciones). El simulador la
 * devuelve junto con los mensajes; en la Fase 8 se guardará también en
 * producción para ver conversaciones reales con su porqué.
 *
 * Los nombres siguen al motor real, no a la especificación del Studio: donde
 * el motor no tiene un concepto (contador de intentos, desambiguación), la
 * traza tampoco lo inventa.
 */
export type DecisionStep =
  /** Lo que el motor recibió, ya traducido por el parser de Meta. */
  | { kind: 'input'; content: string; messageId: string | null }
  /** El parser no supo qué hacer con el mensaje (audio, imagen, sticker…): el bot no contesta. */
  | { kind: 'input_ignored'; reason: 'unsupported_type'; detail: string }
  /** Cada mensaje del cliente abre o reinicia la ventana de servicio de 24 h. */
  | { kind: 'window'; open: true; expiresAt: string }
  /** Una regla previa al flow decidió el turno, o lo dejó pasar. */
  | { kind: 'gate'; gate: GateName; detail?: string }
  /** Palabra de escape global (menu, salir, cancelar, inicio). */
  | { kind: 'escape_word'; word: string; handledLocally: boolean }
  /** El flow arranca desde su nodo inicial. */
  | { kind: 'session_start'; startNodeId: string; reason: 'new' | 'ended' | 'unknown_node' | 'escape_word' }
  | { kind: 'catalog_search'; nodeId: string; query: string; productId: string | null }
  | { kind: 'validation'; nodeId: string; validator: 'numeric'; valid: boolean }
  /** Todas las transiciones del nodo, cuáles coincidieron y cuál ganó por especificidad. */
  | {
      kind: 'transitions';
      nodeId: string;
      candidates: TransitionCandidate[];
      /** Índice de la transición ganadora en `candidates`, o null si ninguna coincidió. */
      winner: number | null;
    }
  /** Ninguna transición coincidió: el nodo se vuelve a mostrar. */
  | { kind: 'no_match'; nodeId: string }
  | { kind: 'context_update'; key: string; value: unknown }
  | { kind: 'node_entered'; nodeId: string; nodeType: FlowNode['type'] }
  /** Lista o carrusel que resolvió a cero opciones: el motor salta a su default. */
  | { kind: 'auto_skip'; nodeId: string; reason: 'empty_list' | 'empty_carousel'; target: string | null }
  /** El turno termina aquí esperando la respuesta del cliente. */
  | { kind: 'wait'; nodeId: string }
  | { kind: 'flow_ended'; nodeId: string }
  /** Nodo sin transiciones que no es `end`: la conversación se corta. */
  | { kind: 'dead_end'; nodeId: string }
  | { kind: 'engine_error'; reason: 'cycle' | 'node_not_found' | 'empty_without_default'; nodeId: string }
  /** Paso a humano: el bot se silencia hasta `pausedUntil`. */
  | { kind: 'escalation'; pausedUntil: string; ownerNotified: boolean }
  /** Solo en simulación: el reloj se adelantó. */
  | { kind: 'clock_advanced'; minutes: number; now: string };

export type GateName =
  | 'no_config'
  | 'owner_command'
  | 'opt_out'
  | 'opt_in_implicit'
  | 'human_paused'
  | 'session_expired'
  | 'out_of_hours'
  | 'no_flow';

export interface TransitionCandidate {
  condition: TransitionCondition['type'];
  /** El valor de la condición, cuando tiene uno: id del botón o de la fila, palabras clave. */
  detail?: string;
  target: string;
  matched: boolean;
  /** Especificidad (FlowInterpreter.transitionSpecificity): mayor gana. */
  score: number;
}
