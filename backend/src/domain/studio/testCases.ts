import { z } from 'zod';
import type { OutboundContent } from '@/domain/conversation/OutboundMessage';

/**
 * Casos de prueba del Studio (Fase 4): una conversación guardada y lo que
 * tiene que pasar al final. Antes de publicar se corren todos con el motor
 * real; si alguno falla, no se publica.
 *
 * Los eventos van en el vocabulario del webhook de Meta (SimEventSchema, en
 * infraestructura), porque se traducen con el parser real.
 */

export const TestExpectationSchema = z
  .object({
    /** Paso donde queda la conversación al final. */
    node: z.string().min(1).optional(),
    /** Variables guardadas al final, con su valor exacto. */
    vars: z.record(z.string()).optional(),
    /** Textos que el bot tiene que haber mandado (sin distinguir mayúsculas). */
    contains: z.array(z.string().min(1)).max(20).optional(),
    /** Textos que el bot no debe mandar. */
    notContains: z.array(z.string().min(1)).max(20).optional(),
    /** Tope de mensajes del bot en toda la conversación. */
    maxMessages: z.number().int().positive().max(500).optional(),
  })
  .refine((e) => Object.values(e).some((v) => v !== undefined), 'La prueba necesita al menos una expectativa');

export type TestExpectation = z.infer<typeof TestExpectationSchema>;

export const TestOptionsSchema = z.object({
  /** Hora de arranque del reloj simulado. Default: un lunes a las 11:00 de México. */
  startAt: z.string().datetime({ offset: true }).optional(),
  /** Teléfono del cliente simulado. */
  from: z.string().regex(/^\d{8,15}$/).optional(),
});

export type TestOptions = z.infer<typeof TestOptionsSchema>;

/**
 * Hora fija por default: una prueba no puede pasar o fallar según la hora a
 * la que se corra. Un lunes laborable a media mañana.
 */
export const DEFAULT_TEST_START = '2026-01-05T11:00:00-06:00';

export interface FlowTestCase {
  id: string;
  tenantId: string;
  flowId: string;
  name: string;
  events: unknown[];
  expect: TestExpectation;
  options: TestOptions;
  createdAt: string;
  updatedAt: string;
}

export interface TestResult {
  id: string;
  name: string;
  passed: boolean;
  /** Por qué falló, en español. Vacío si pasó. */
  failures: string[];
}

export interface TestRunReport {
  total: number;
  passed: number;
  failed: number;
  results: TestResult[];
}

/** Cómo terminó la conversación de una prueba. */
export interface TestOutcome {
  finalNode: string | null;
  context: Record<string, unknown>;
  /** Todo lo que el bot le mandó al cliente, como texto. */
  texts: string[];
  messages: number;
}

export function evaluateTest(expect: TestExpectation, outcome: TestOutcome): string[] {
  const failures: string[] = [];
  const all = outcome.texts.join('\n').toLowerCase();

  if (expect.node !== undefined && outcome.finalNode !== expect.node) {
    failures.push(`Terminó en «${outcome.finalNode ?? 'ningún paso'}» y se esperaba «${expect.node}».`);
  }
  for (const [key, value] of Object.entries(expect.vars ?? {})) {
    const actual = outcome.context[key];
    if (actual === undefined || actual === null || String(actual) !== value) {
      failures.push(`{{${key}}} vale ${actual == null ? 'nada' : `"${String(actual)}"`} y se esperaba "${value}".`);
    }
  }
  for (const text of expect.contains ?? []) {
    if (!all.includes(text.toLowerCase())) failures.push(`El bot nunca dijo "${text}".`);
  }
  for (const text of expect.notContains ?? []) {
    if (all.includes(text.toLowerCase())) failures.push(`El bot dijo "${text}" y no debía.`);
  }
  if (expect.maxMessages !== undefined && outcome.messages > expect.maxMessages) {
    failures.push(`El bot mandó ${outcome.messages} mensajes y el tope era ${expect.maxMessages}.`);
  }
  return failures;
}

/** Los textos que ve el cliente en un mensaje del bot. */
export function outboundTexts(content: OutboundContent): string[] {
  switch (content.kind) {
  case 'text':
    return [content.text];
  case 'buttons':
    return [content.text, ...content.buttons.map((b) => b.title)];
  case 'list':
    return [content.text, content.buttonLabel, ...content.sections.flatMap((s) => [s.title, ...s.items.flatMap((i) => [i.title, i.description ?? ''])])];
  case 'image':
    return [content.caption ?? ''];
  case 'document':
    return [content.filename, content.caption ?? ''];
  case 'location':
    return [content.name ?? '', content.address ?? ''];
  case 'cta_url':
    return [content.body, content.button.display_text, content.footer ?? ''];
  case 'location_request':
  case 'call_permission_request':
    return [content.body];
  case 'media_carousel':
    return [content.body, ...content.cards.flatMap((c) => [c.body, ...c.buttons.map((b) => (b.type === 'quick_reply' ? b.title : b.display_text))])];
  case 'whatsapp_flow':
    return [content.body, content.flow_cta];
  case 'reaction':
    return [content.emoji];
  }
}
