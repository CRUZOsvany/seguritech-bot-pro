import { z } from 'zod';
import type { BotFlow, FlowNode, Transition } from '@/domain/entities/flow';
import { CaptureValidationSchema } from '@/domain/validators/flowSchema';

/**
 * El asistente del Studio (Fase 3): lo que el operador llena en los 8 pasos,
 * y cómo se convierte en un flow del motor.
 *
 * El asistente no inventa comportamiento: solo arma, con nodos que el motor
 * ya ejecuta, la forma que usa el molde de cerrajería — menú principal,
 * opciones que piden datos, confirman y pasan a una persona, información con
 * botones, escalera de "no te entendí" y despedida.
 *
 * Los textos del negocio (saludo, texto del menú, "no te entendí") no viven
 * aquí: son de bot_configuration y el flow los usa con config_bound, igual
 * que el molde. Así cambiarlos no obliga a publicar una versión nueva.
 *
 * La especificación viaja dentro del flow (`studio.wizard`). Al reabrir, se
 * vuelve a compilar y se compara con el flow: si alguien lo cambió en el
 * Designer, readWizardSpec lo dice en vez de pisar esos cambios.
 */

// ============================================================================
// Especificación
// ============================================================================

const idSchema = z
  .string()
  .regex(/^[a-z0-9_]{1,40}$/, 'solo minúsculas, números y guion bajo (máx. 40)')
  .refine((id) => !id.includes('__'), 'no puede llevar dos guiones bajos seguidos');

const varSchema = z
  .string()
  .regex(/^[a-z][a-z0-9_]{0,39}$/, 'nombre de variable: minúsculas, números y guion bajo');

const textSchema = z.string().trim().min(1);
const keywordsSchema = z.array(z.string().trim().min(1)).max(40);

const HandoffSchema = z.object({
  /** Lo que ve el cliente al pasar a una persona. */
  userResponse: textSchema,
  /** La alerta que recibe el dueño por WhatsApp. */
  ownerAlert: textSchema,
});

const OptionBase = {
  id: idSchema,
  /** Texto del botón (o de la fila, si el menú es lista). */
  title: textSchema,
  /** Solo se ve si el menú es lista (4 o más opciones). */
  description: z.string().trim().optional(),
  /** Palabras con las que el cliente elige esta opción escribiendo. */
  keywords: keywordsSchema,
};

const CaptureOptionSchema = z.object({
  ...OptionBase,
  kind: z.literal('capture'),
  /** Lista previa para elegir el tipo de caso (p. ej. tipos de emergencia). */
  choices: z
    .object({
      text: textSchema,
      buttonLabel: textSchema,
      sectionTitle: textSchema,
      items: z.array(z.object({ title: textSchema, description: z.string().trim().optional() })).min(1).max(10),
      saveAs: varSchema,
    })
    .nullable(),
  /** La pregunta con la que el bot pide los datos. */
  question: textSchema,
  saveAs: varSchema,
  /** Mostrar lo recibido y preguntar si es correcto antes de pasar a una persona. */
  confirm: z
    .object({
      text: textSchema,
      yesTitle: textSchema,
      noTitle: textSchema,
      yesKeywords: keywordsSchema,
      noKeywords: keywordsSchema,
    })
    .nullable(),
  handoff: HandoffSchema,
  /**
   * Qué acepta la pregunta como respuesta (C-04). Sin él, cualquier texto.
   * Al agotar los intentos, a una persona (con el aviso de "no te entendí",
   * que trae el último mensaje) o de vuelta al menú.
   */
  check: z
    .object({
      rule: CaptureValidationSchema,
      /** Vacío: un mensaje según el tipo. */
      errorText: z.string().trim().optional(),
      maxAttempts: z.number().int().min(1).max(5),
      onExhausted: z.enum(['human', 'menu']),
    })
    .optional(),
});

const InfoOptionSchema = z.object({
  ...OptionBase,
  kind: z.literal('info'),
  text: textSchema,
  /** Botones debajo del texto: a otra opción del menú o a la despedida. */
  actions: z.array(z.object({ title: textSchema, goto: z.string().min(1) })).min(1).max(3),
});

const HumanOptionSchema = z.object({
  ...OptionBase,
  kind: z.literal('human'),
  handoff: HandoffSchema,
});

const OptionSchema = z.discriminatedUnion('kind', [CaptureOptionSchema, InfoOptionSchema, HumanOptionSchema]);

/**
 * Palabras de escape (C-08): funcionan en cualquier paso. Opcional para que
 * las especificaciones guardadas antes sigan abriendo igual; sin ella el
 * motor usa las palabras de siempre.
 */
const EscapeSpecSchema = z.object({
  /** Vuelven al menú principal sin borrar lo que el cliente ya dijo. */
  menuWords: keywordsSchema,
  /** Borran lo capturado y empiezan desde el saludo. */
  restartWords: keywordsSchema,
  /** Pasan a una persona desde cualquier paso (WhatsApp exige esta vía). */
  humanWords: keywordsSchema.min(1, 'Hace falta al menos una palabra para hablar con una persona'),
  /** Baja: el bot deja de escribirle al cliente. Obligatoria. */
  optOutWords: keywordsSchema.min(1, 'Hace falta al menos una palabra para darse de baja'),
  handoff: HandoffSchema,
});

/** Ids que usa el compilador para sus propios pasos. */
const HUMAN_ESCAPE = 'hablar_persona';
const RESERVED_IDS = new Set(['bienvenida', 'no_entendi', 'despedida', 'fin', 'farewell', HUMAN_ESCAPE]);
export const FAREWELL = 'farewell';

export const WizardSpecSchema = z
  .object({
    version: z.literal(1),
    menu: z.object({
      /** Solo para menú de lista (4 a 10 opciones). */
      listButtonLabel: textSchema,
      listSectionTitle: textSchema,
    }),
    options: z.array(OptionSchema).min(1).max(10),
    notUnderstood: z.object({
      /** Cuántas veces se vuelve a mostrar el menú antes de pasar a una persona. */
      attempts: z.number().int().min(1).max(3),
      /** Texto del segundo intento en adelante (el primero es el "no te entendí" del negocio). */
      retryText: textSchema,
      handoff: HandoffSchema,
    }),
    farewell: z.object({
      text: textSchema,
      keywords: keywordsSchema,
    }),
    escape: EscapeSpecSchema.optional(),
  })
  .superRefine((spec, ctx) => {
    const ids = new Set<string>();
    spec.options.forEach((o, i) => {
      if (RESERVED_IDS.has(o.id) || o.id.startsWith('no_entendi')) {
        ctx.addIssue({ code: 'custom', path: ['options', i, 'id'], message: `"${o.id}" está reservado` });
      }
      if (ids.has(o.id)) {
        ctx.addIssue({ code: 'custom', path: ['options', i, 'id'], message: `id repetido: "${o.id}"` });
      }
      ids.add(o.id);
    });
    spec.options.forEach((o, i) => {
      if (o.kind !== 'info') return;
      o.actions.forEach((a, j) => {
        if (a.goto !== FAREWELL && !ids.has(a.goto)) {
          ctx.addIssue({ code: 'custom', path: ['options', i, 'actions', j, 'goto'], message: `no existe la opción "${a.goto}"` });
        }
      });
    });
  });

export type WizardSpec = z.infer<typeof WizardSpecSchema>;
export type WizardOption = WizardSpec['options'][number];

// ============================================================================
// Compilador
// ============================================================================

const NOT_UNDERSTOOD = 'no_entendi';
const START = 'bienvenida';
const END = 'fin';
const FAREWELL_NODE = 'despedida';

const ids = {
  choices: (o: string) => `${o}__lista`,
  question: (o: string) => `${o}__pregunta`,
  confirm: (o: string) => `${o}__confirmar`,
  handoff: (o: string) => `${o}__persona`,
  info: (o: string) => `${o}__info`,
  notUnderstood: (attempt: number) => (attempt === 1 ? NOT_UNDERSTOOD : `${NOT_UNDERSTOOD}_${attempt}`),
  notUnderstoodHandoff: `${NOT_UNDERSTOOD}__persona`,
};

const go = (condition: Transition['condition'], next: string): Transition => ({ condition, next_node_id: next });
const byDefault = (next: string) => go({ type: 'default' }, next);

/** Primer paso de una opción: a dónde lleva elegirla. */
function entryOf(o: WizardOption): string {
  switch (o.kind) {
  case 'capture':
    return o.choices ? ids.choices(o.id) : ids.question(o.id);
  case 'info':
    return ids.info(o.id);
  case 'human':
    return ids.handoff(o.id);
  }
}

/**
 * Convierte la especificación en un flow del motor. Determinista: la misma
 * especificación produce siempre el mismo flow, que es lo que permite a
 * readWizardSpec detectar ediciones hechas fuera del asistente.
 */
export function compileWizard(spec: WizardSpec): BotFlow {
  const nodes: FlowNode[] = [];
  const firstRetry = ids.notUnderstood(1);

  // Menú principal y cada intento de "no te entendí": mismas opciones, mismas
  // salidas; cambia el texto y a dónde lleva no entender.
  const menuNode = (id: string, text: string, onDefault: string, configBound?: FlowNode['config_bound']): FlowNode => {
    const useButtons = spec.options.length <= 3;
    const transitions: Transition[] = [
      ...spec.options.map((o) => go({ type: useButtons ? 'button' : 'list_item', value: o.id }, entryOf(o))),
      ...spec.options
        .filter((o) => o.keywords.length > 0)
        .map((o) => go({ type: 'keyword', values: o.keywords }, entryOf(o))),
      byDefault(onDefault),
    ];
    const bound = configBound ? { config_bound: configBound } : {};
    if (useButtons) {
      return {
        id,
        type: 'send_buttons',
        ...bound,
        content: { text, buttons: spec.options.map((o) => ({ id: o.id, title: o.title })) },
        transitions,
      };
    }
    return {
      id,
      type: 'send_list',
      ...bound,
      content: {
        text,
        button_label: spec.menu.listButtonLabel,
        sections: [{
          type: 'static',
          title: spec.menu.listSectionTitle,
          items: spec.options.map((o) => ({ id: o.id, title: o.title, ...(o.description ? { description: o.description } : {}) })),
        }],
      },
      transitions,
    };
  };

  nodes.push(menuNode(START, '{{welcome_message}}\n\n{{menu_message}}', firstRetry, ['welcome_message', 'menu_message']));

  const handoffNode = (id: string, h: { userResponse: string; ownerAlert: string }): FlowNode => ({
    id,
    type: 'escape_to_human',
    content: { user_response: h.userResponse, owner_alert_template: h.ownerAlert },
    transitions: [byDefault(END)],
  });

  let farewellUsed = false;
  for (const o of spec.options) {
    if (o.kind === 'capture') {
      if (o.choices) {
        nodes.push({
          id: ids.choices(o.id),
          type: 'send_list',
          content: {
            text: o.choices.text,
            button_label: o.choices.buttonLabel,
            sections: [{
              type: 'static',
              title: o.choices.sectionTitle,
              // El id de cada fila es su título, como en el molde: así la
              // variable guardada es legible en la alerta al dueño.
              items: o.choices.items.map((it) => ({ id: it.title, title: it.title, ...(it.description ? { description: it.description } : {}) })),
            }],
          },
          transitions: [
            go({ type: 'list_item_any', save_to_context: o.choices.saveAs }, ids.question(o.id)),
            byDefault(firstRetry),
          ],
        });
      }
      const check = o.check
        ? {
          validation: o.check.rule,
          ...(o.check.errorText ? { validation_error: o.check.errorText } : {}),
          max_attempts: o.check.maxAttempts,
          on_exhausted: o.check.onExhausted === 'human' ? ids.notUnderstoodHandoff : START,
        }
        : {};
      nodes.push({
        id: ids.question(o.id),
        type: 'wait_input',
        content: { prompt: o.question, save_to_context: o.saveAs, ...check },
        transitions: [byDefault(o.confirm ? ids.confirm(o.id) : ids.handoff(o.id))],
      });
      if (o.confirm) {
        const c = o.confirm;
        nodes.push({
          id: ids.confirm(o.id),
          type: 'send_buttons',
          content: { text: c.text, buttons: [{ id: 'correcto', title: c.yesTitle }, { id: 'corregir', title: c.noTitle }] },
          transitions: [
            go({ type: 'button', value: 'correcto' }, ids.handoff(o.id)),
            go({ type: 'button', value: 'corregir' }, ids.question(o.id)),
            ...(c.yesKeywords.length ? [go({ type: 'keyword', values: c.yesKeywords }, ids.handoff(o.id))] : []),
            ...(c.noKeywords.length ? [go({ type: 'keyword', values: c.noKeywords }, ids.question(o.id))] : []),
            byDefault(ids.handoff(o.id)),
          ],
        });
      }
      nodes.push(handoffNode(ids.handoff(o.id), o.handoff));
    }

    if (o.kind === 'info') {
      const target = (goto: string) => (goto === FAREWELL ? FAREWELL_NODE : entryOf(spec.options.find((x) => x.id === goto)!));
      const keywordsOf = (goto: string) =>
        goto === FAREWELL ? spec.farewell.keywords : (spec.options.find((x) => x.id === goto)?.keywords ?? []);
      if (o.actions.some((a) => a.goto === FAREWELL)) farewellUsed = true;
      nodes.push({
        id: ids.info(o.id),
        type: 'send_buttons',
        content: {
          text: o.text,
          buttons: o.actions.map((a) => ({ id: a.goto === FAREWELL ? 'salir' : a.goto, title: a.title })),
        },
        transitions: [
          ...o.actions.map((a) => go({ type: 'button', value: a.goto === FAREWELL ? 'salir' : a.goto }, target(a.goto))),
          ...o.actions
            .filter((a) => keywordsOf(a.goto).length > 0)
            .map((a) => go({ type: 'keyword', values: keywordsOf(a.goto) }, target(a.goto))),
          byDefault(firstRetry),
        ],
      });
    }

    if (o.kind === 'human') nodes.push(handoffNode(ids.handoff(o.id), o.handoff));
  }

  // Escalera de "no te entendí": el primero usa el texto del negocio; los
  // siguientes, el texto de reintento; al final, a una persona.
  const attempts = spec.notUnderstood.attempts;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const next = attempt < attempts ? ids.notUnderstood(attempt + 1) : ids.notUnderstoodHandoff;
    nodes.push(
      attempt === 1
        ? menuNode(ids.notUnderstood(1), '{{not_understood_message}}', next, ['not_understood_message'])
        : menuNode(ids.notUnderstood(attempt), spec.notUnderstood.retryText, next),
    );
  }
  nodes.push(handoffNode(ids.notUnderstoodHandoff, spec.notUnderstood.handoff));
  if (spec.escape) nodes.push(handoffNode(HUMAN_ESCAPE, spec.escape.handoff));

  if (farewellUsed) {
    nodes.push({ id: FAREWELL_NODE, type: 'send_text', content: { text: spec.farewell.text }, transitions: [byDefault(END)] });
  }
  nodes.push({ id: END, type: 'end', content: {}, transitions: [] });

  return {
    version: '1.0',
    start_node_id: START,
    nodes,
    ...(spec.escape ? { escape: compileEscape(spec.escape) } : {}),
    studio: { wizard: spec },
  };
}

function compileEscape(e: NonNullable<WizardSpec['escape']>): NonNullable<BotFlow['escape']> {
  return {
    ...(e.menuWords.length ? { menu: { words: e.menuWords } } : {}),
    ...(e.restartWords.length ? { restart: { words: e.restartWords } } : {}),
    human: { words: e.humanWords, node_id: HUMAN_ESCAPE },
    opt_out: { words: e.optOutWords },
  };
}

// ============================================================================
// Lectura de vuelta
// ============================================================================

export type WizardReadResult =
  | { ok: true; spec: WizardSpec }
  | {
      ok: false;
      /**
       * no_spec: el flow no lo generó el asistente (p. ej. un molde JSON).
       * invalid_spec: trae especificación pero ya no es válida.
       * edited_elsewhere: se editó en el Designer después; abrirlo en el
       * asistente perdería esos cambios.
       */
      reason: 'no_spec' | 'invalid_spec' | 'edited_elsewhere';
    };

export function readWizardSpec(flow: unknown): WizardReadResult {
  const wizard = (flow as { studio?: { wizard?: unknown } } | null)?.studio?.wizard;
  if (wizard === undefined) return { ok: false, reason: 'no_spec' };
  const parsed = WizardSpecSchema.safeParse(wizard);
  if (!parsed.success) return { ok: false, reason: 'invalid_spec' };

  const expected = compileWizard(parsed.data);
  const actual = flow as { start_node_id?: unknown; nodes?: unknown; escape?: unknown };
  const same =
    actual.start_node_id === expected.start_node_id &&
    deepEqual(actual.nodes, expected.nodes) &&
    deepEqual(actual.escape, expected.escape);
  return same ? { ok: true, spec: parsed.data } : { ok: false, reason: 'edited_elsewhere' };
}

/**
 * Igualdad profunda sin importar el orden de las claves: el flow pasa por
 * jsonb de Postgres, que reordena las claves de los objetos. El orden de los
 * arreglos sí importa (en las transiciones desempata).
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const bb = b as unknown[];
    return a.length === bb.length && a.every((v, i) => deepEqual(v, bb[i]));
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const keys = (o: Record<string, unknown>) => Object.keys(o).filter((k) => o[k] !== undefined);
  const ak = keys(ao);
  const bk = keys(bo);
  return ak.length === bk.length && ak.every((k) => deepEqual(ao[k], bo[k]));
}
