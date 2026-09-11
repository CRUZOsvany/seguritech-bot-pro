import type { BotFlow, FlowEscape } from '@/domain/entities/flow';
import { normalizePhrase } from '@/domain/services/textMatch';

/**
 * Palabras de escape (C-08): lo que el cliente puede escribir en cualquier
 * paso para volver al menú, empezar de nuevo, hablar con una persona o darse
 * de baja. Las define cada flow (`BotFlow.escape`); aquí se resuelven y se
 * comparan, para que el motor, el validador y el Studio usen lo mismo.
 */

export type EscapeCategory = 'opt_out' | 'human' | 'restart' | 'menu';

/**
 * Las de siempre, para flows sin `escape` (todos los anteriores a C-08):
 * las cuatro reinician el flow borrando lo capturado, como antes.
 */
const LEGACY_RESTART_WORDS = ['menu', 'salir', 'cancelar', 'inicio'];

/**
 * Baja de siempre (Bloque 2.2). También es la red de seguridad: si un flow
 * dejara la baja vacía, el motor usa estas — nunca se queda sin baja.
 */
export const LEGACY_OPT_OUT_WORDS = ['stop', 'baja', 'no molestar', 'cancelar suscripcion'];

/** Lo que propone el Studio a un bot nuevo. Cada negocio lo ajusta. */
export const RECOMMENDED_ESCAPE_WORDS: Record<EscapeCategory, string[]> = {
  menu: ['menu', 'inicio', 'volver'],
  restart: ['reiniciar', 'empezar de nuevo', 'cancelar', 'salir'],
  human: ['asesor', 'humano', 'persona', 'agente', 'hablar con alguien'],
  opt_out: ['baja', 'alto', 'stop', 'no molestar', 'cancelar suscripcion'],
};

export interface ResolvedEscape {
  menu: { words: string[]; target: string };
  restart: { words: string[] };
  human: { words: string[]; target: string } | null;
  optOut: { words: string[] };
}

/** Las palabras que aplican a un flow, con sus destinos. */
export function resolveEscape(flow: Pick<BotFlow, 'escape' | 'start_node_id'> | null): ResolvedEscape {
  const start = flow?.start_node_id ?? '';
  const config: FlowEscape | undefined = flow?.escape;
  if (!config) {
    return {
      menu: { words: [], target: start },
      restart: { words: LEGACY_RESTART_WORDS },
      human: null,
      optOut: { words: LEGACY_OPT_OUT_WORDS },
    };
  }
  const optOut = config.opt_out?.words ?? [];
  return {
    menu: { words: config.menu?.words ?? [], target: config.menu?.node_id || start },
    restart: { words: config.restart?.words ?? [] },
    human: config.human && config.human.words.length > 0 ? { words: config.human.words, target: config.human.node_id } : null,
    optOut: { words: optOut.length > 0 ? optOut : LEGACY_OPT_OUT_WORDS },
  };
}

/** En este orden gana una palabra repetida en dos grupos. */
const PRIORITY: EscapeCategory[] = ['opt_out', 'human', 'restart', 'menu'];

export function wordsOf(resolved: ResolvedEscape, category: EscapeCategory): string[] {
  switch (category) {
  case 'opt_out':
    return resolved.optOut.words;
  case 'human':
    return resolved.human?.words ?? [];
  case 'restart':
    return resolved.restart.words;
  case 'menu':
    return resolved.menu.words;
  }
}

/**
 * ¿El mensaje completo es una palabra de escape? Compara normalizado:
 * "¡Asesor!" es "asesor", pero "quiero un asesor" no (eso lo decide el paso).
 */
export function matchEscape(resolved: ResolvedEscape, content: string): { category: EscapeCategory; word: string } | null {
  const text = normalizePhrase(content);
  if (!text) return null;
  for (const category of PRIORITY) {
    if (wordsOf(resolved, category).some((w) => normalizePhrase(w) === text)) return { category, word: text };
  }
  return null;
}
