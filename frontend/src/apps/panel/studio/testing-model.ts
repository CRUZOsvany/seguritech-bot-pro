import { ApiError } from '@/shared/api/client';
import type { PublishRejection, TestExpectation, TestInput } from '@/shared/api/studio';
import { eventLabel, type SimConversation } from '@/shared/simulator/studioView';

/**
 * Lógica pura del paso 8 del Studio (Fase 4): convertir una conversación del
 * simulador en prueba, describir expectativas y leer el rechazo de publicar.
 */

const NAME_MAX = 120;

/** "hola → 🚨 Emergencia → Apertura de puerta": lo que hizo el cliente. */
export function suggestTestName(conversation: SimConversation): string {
  const parts = conversation.events.map((e) => eventLabel(e)).filter((l) => l.from === 'user').map((l) => l.text.trim());
  const name = parts.join(' → ') || 'Prueba';
  return name.length > NAME_MAX ? `${name.slice(0, NAME_MAX - 1)}…` : name;
}

/**
 * La prueba que sale de una conversación: los mismos eventos, con el reloj y
 * el teléfono con que se corrió (para que se repita idéntica), y como
 * expectativa el paso donde quedó. Si no quedó en ningún paso, que no mande
 * más mensajes de los que mandó.
 */
export function testFromConversation(conversation: SimConversation): TestInput {
  const last = conversation.turns.at(-1);
  const node = last?.session?.currentNodeId ?? null;
  const messages = conversation.turns.reduce((acc, t) => acc + t.outbound.filter((o) => o.audience === 'customer').length, 0);
  return {
    name: suggestTestName(conversation),
    events: conversation.events,
    expect: node ? { node } : { maxMessages: Math.max(messages, 1) },
    options: { startAt: conversation.startAt, from: conversation.from },
  };
}

/** Una línea en español por expectativa. */
export function describeExpectation(expect: TestExpectation): string[] {
  const lines: string[] = [];
  if (expect.node) lines.push(`Termina en «${expect.node}»`);
  for (const [k, v] of Object.entries(expect.vars ?? {})) lines.push(`Guarda {{${k}}} = «${v}»`);
  for (const text of expect.contains ?? []) lines.push(`Dice «${text}»`);
  for (const text of expect.notContains ?? []) lines.push(`No dice «${text}»`);
  if (expect.maxMessages !== undefined) lines.push(`Manda como máximo ${expect.maxMessages} mensaje(s)`);
  return lines;
}

/** Textarea → lista: una línea por texto, sin vacías. */
export const linesOf = (text: string): string[] =>
  text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

/** Arma la expectativa del formulario; sin nada que revisar, null. */
export function buildExpectation(form: { node: string; contains: string; notContains: string }): TestExpectation | null {
  const expect: TestExpectation = {};
  if (form.node.trim()) expect.node = form.node.trim();
  const contains = linesOf(form.contains);
  if (contains.length) expect.contains = contains;
  const notContains = linesOf(form.notContains);
  if (notContains.length) expect.notContains = notContains;
  return Object.keys(expect).length ? expect : null;
}

export interface PublishFailure {
  message: string;
  /** Errores del validador (paso o regla + motivo). */
  issues: Array<{ path?: string; message: string }>;
  /** Pruebas que fallaron, con por qué. */
  tests: Array<{ name: string; failures: string[] }>;
}

/** Lee el error de publicar: separa pruebas fallidas de errores del flujo. */
export function publishFailure(error: unknown): PublishFailure {
  const message = error instanceof Error ? error.message : 'No se pudo publicar';
  const body = error instanceof ApiError ? (error.body as PublishRejection | undefined) : undefined;
  if (body?.testReport) {
    return {
      message,
      issues: [],
      tests: body.testReport.results.filter((r) => !r.passed).map((r) => ({ name: r.name, failures: r.failures })),
    };
  }
  return { message, issues: body?.issues ?? [], tests: [] };
}

/** "hola → 🚨 Emergencia": el camino del explorador, legible. */
export const pathLabel = (path: string[]): string => (path.length ? path.join(' → ') : '(al empezar)');
