/**
 * Validación profunda del JSON de un flow con Zod.
 *
 * El CHECK de Postgres del Sprint A solo verifica que el JSON sea objeto
 * con claves obligatorias. Aquí validamos:
 *  - estructura recursiva de nodos y transiciones (discriminated union)
 *  - referencias: start_node_id y todos los next_node_id resuelven
 *  - reglas Meta: max 3 botones, max 10 list items en static sections,
 *    titles ≤ 20 chars (botones) / ≤ 24 chars (list items), etc.
 *
 * Uso: SupabaseBotFlowRepository llama validateFlow() antes de save/update.
 * Si la validación falla, lanza error con detalle del primer issue Zod.
 */

import { z } from 'zod';
import type { BotFlow } from '@/domain/entities/flow';

// ============================================================================
// SCHEMAS BASE
// ============================================================================

const TransitionConditionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('button'),
    value: z.string().min(1),
  }),
  z.object({
    type: z.literal('list_item'),
    value: z.string().min(1),
  }),
  z.object({
    type: z.literal('list_item_any'),
    save_to_context: z.string().min(1).optional(),
  }),
  z.object({
    type: z.literal('keyword'),
    values: z.array(z.string().min(1)).min(1),
  }),
  z.object({
    type: z.literal('default'),
  }),
]);

const TransitionSchema = z.object({
  condition: TransitionConditionSchema,
  next_node_id: z.string().min(1),
});

const ListItemSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(24, 'Meta: list item title ≤ 24 chars'),
  description: z.string().max(72, 'Meta: list item description ≤ 72 chars').optional(),
});

const ListSectionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('static'),
    title: z.string().min(1),
    items: z.array(ListItemSchema).min(1),
  }),
  z.object({
    type: z.literal('dynamic'),
    title: z.string().min(1),
    items_source: z.literal('catalog_items'),
  }),
]);

// ============================================================================
// NODOS
// ============================================================================

const SendTextNodeSchema = z.object({
  id: z.string().min(1),
  type: z.literal('send_text'),
  content: z.object({ text: z.string().min(1) }),
  transitions: z.array(TransitionSchema),
});

const SendButtonsNodeSchema = z.object({
  id: z.string().min(1),
  type: z.literal('send_buttons'),
  content: z.object({
    text: z.string().min(1),
    buttons: z
      .array(
        z.object({
          id: z.string().min(1),
          title: z.string().min(1).max(20, 'Meta: button title ≤ 20 chars'),
        }),
      )
      .min(1)
      .max(3, 'Meta: máximo 3 botones'),
  }),
  transitions: z.array(TransitionSchema),
});

const SendListNodeSchema = z
  .object({
    id: z.string().min(1),
    type: z.literal('send_list'),
    content: z.object({
      text: z.string().min(1),
      button_label: z.string().min(1).max(20, 'Meta: button_label ≤ 20 chars'),
      sections: z.array(ListSectionSchema).min(1),
    }),
    transitions: z.array(TransitionSchema),
  })
  .refine(
    (node) => {
      const totalStatic = node.content.sections.reduce((acc, s) => {
        if (s.type === 'static') return acc + s.items.length;
        return acc;
      }, 0);
      return totalStatic <= 10;
    },
    { message: 'Meta: máximo 10 items totales en static sections' },
  );

const SendMediaNodeSchema = z.object({
  id: z.string().min(1),
  type: z.literal('send_media'),
  content: z.discriminatedUnion('media_type', [
    z.object({
      media_type: z.literal('image'),
      url: z.string().url(),
      caption: z.string().optional(),
    }),
    z.object({
      media_type: z.literal('location'),
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
      name: z.string().optional(),
      address: z.string().optional(),
    }),
  ]),
  transitions: z.array(TransitionSchema),
});

const WaitInputNodeSchema = z.object({
  id: z.string().min(1),
  type: z.literal('wait_input'),
  content: z.object({
    prompt: z.string().optional(),
    save_to_context: z.string().optional(),
  }),
  transitions: z.array(TransitionSchema),
});

const EscapeToHumanNodeSchema = z.object({
  id: z.string().min(1),
  type: z.literal('escape_to_human'),
  content: z.object({
    user_response: z.string().min(1),
    owner_alert_template: z.string().min(1),
  }),
  transitions: z.array(TransitionSchema),
});

const EndNodeSchema = z.object({
  id: z.string().min(1),
  type: z.literal('end'),
  content: z.object({}).strict(),
  transitions: z.array(TransitionSchema).max(0, 'end node no debe tener transiciones'),
});

// EndNodeSchema tipa `transitions` con .max(0), lo que produce una rama
// estructuralmente más estrecha que las demás. TypeScript no infiere el
// tuplo como `readonly [Option, ...Option[]]` requerido por
// discriminatedUnion en zod 3.25+. El cast es seguro: en runtime todas
// las ramas son ZodObject con `type: literal`, condición que zod valida
// al evaluar el discriminated union.
const FlowNodeSchema = z.discriminatedUnion(
  'type',
  [
    SendTextNodeSchema,
    SendButtonsNodeSchema,
    SendListNodeSchema,
    SendMediaNodeSchema,
    WaitInputNodeSchema,
    EscapeToHumanNodeSchema,
    EndNodeSchema,
  ] as unknown as readonly [z.ZodDiscriminatedUnionOption<'type'>, ...z.ZodDiscriminatedUnionOption<'type'>[]],
);

// ============================================================================
// FLOW (con validación cruzada de referencias)
// ============================================================================

export const FlowSchema = z
  .object({
    version: z.literal('1.0'),
    start_node_id: z.string().min(1),
    nodes: z.array(FlowNodeSchema).min(1),
  })
  .superRefine((flow, ctx) => {
    const ids = new Set(flow.nodes.map((n) => n.id));

    if (ids.size !== flow.nodes.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Los ids de los nodos deben ser únicos dentro del flow',
      });
    }

    if (!ids.has(flow.start_node_id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `start_node_id "${flow.start_node_id}" no resuelve a ningún nodo`,
      });
    }

    for (const node of flow.nodes) {
      for (const t of node.transitions) {
        if (!ids.has(t.next_node_id)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Nodo "${node.id}" tiene transición a "${t.next_node_id}" que no existe`,
          });
        }
      }
    }

    const hasEnd = flow.nodes.some((n) => n.type === 'end');
    if (!hasEnd) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'El flow debe tener al menos un nodo de tipo "end"',
      });
    }
  });

// ============================================================================
// API PÚBLICA
// ============================================================================

export class FlowValidationError extends Error {
  constructor(
    message: string,
    public readonly issues: z.ZodIssue[],
  ) {
    super(message);
    this.name = 'FlowValidationError';
  }
}

/**
 * Valida un flow contra el contrato. Lanza FlowValidationError con detalle si falla.
 */
export function validateFlow(input: unknown): BotFlow {
  const result = FlowSchema.safeParse(input);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new FlowValidationError(
      `Flow inválido en "${first.path.join('.')}": ${first.message}`,
      result.error.issues,
    );
  }
  return result.data as BotFlow;
}