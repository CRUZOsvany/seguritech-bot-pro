/**
 * Tipos compartidos del simulador.
 * Mirror de los outputs del backend, más wrappers para el estado del chat.
 */

import type { SimulatorOutput } from '@/lib/backend-admin';

export type ChatMessage =
  | { id: string; from: 'user'; kind: 'text'; text: string; timestamp: Date }
  | {
      id: string;
      from: 'bot';
      kind: SimulatorOutput['kind'];
      output: SimulatorOutput;
      timestamp: Date;
    }
  | { id: string; from: 'system'; kind: 'error'; text: string; timestamp: Date };

export type { SimulatorOutput };
