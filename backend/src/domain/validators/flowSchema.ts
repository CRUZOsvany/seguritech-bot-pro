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

/**
 * URL https válida, ≤ 2000 chars. Reutilizado por los nodos WhatsApp v23.0
 * (cta_url, carousel media/botones). Meta exige https para todos los links.
 */
const httpsUrlSchema = z
  .string()
  .url('URL inválida')
  .startsWith('https://', 'La URL debe iniciar con https://')
  .max(2000, 'URL excede 2000 caracteres');

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
    type: z.literal('call_permission_granted'),
  }),
  z.object({
    type: z.literal('call_permission_denied'),
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
    title: z
      .string()
      .min(1)
      .max(24, 'Meta: section title ≤ 24 chars'),
    items: z.array(ListItemSchema).min(1),
  }),
  z.object({
    type: z.literal('dynamic'),
    title: z
      .string()
      .min(1)
      .max(24, 'Meta: section title ≤ 24 chars'),
    items_source: z.literal('catalog_items'),
  }),
]);

// ============================================================================
// NODOS
// ============================================================================

const SendTextNodeSchema = z.object({
  id: z.string().min(1),
  type: z.literal('send_text'),
  content: z.object({
    text: z
      .string()
      .min(1)
      .max(4096, 'Meta: text body ≤ 4096 chars (recomendado ≤ 1024)'),
  }),
  transitions: z.array(TransitionSchema),
});

const SendButtonsNodeSchema = z.object({
  id: z.string().min(1),
  type: z.literal('send_buttons'),
  content: z.object({
    text: z
      .string()
      .min(1)
      .max(1024, 'Meta: interactive body ≤ 1024 chars'),
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

// IMPORTANTE: este schema NO debe usar `.refine()` directo — devolvería
// ZodEffects<ZodObject> y `z.discriminatedUnion` exige ZodObject puro en cada
// rama (lo evalúa leyendo `.shape[discriminator]` en runtime). La validación
// "max 10 items totales en static sections" se aplica en el superRefine global
// de FlowSchema.
const SendListNodeSchema = z.object({
  id: z.string().min(1),
  type: z.literal('send_list'),
  content: z.object({
    text: z
      .string()
      .min(1)
      .max(1024, 'Meta: list body ≤ 1024 chars'),
    button_label: z
      .string()
      .min(1)
      .max(20, 'Meta: button_label ≤ 20 chars'),
    sections: z
      .array(ListSectionSchema)
      .min(1)
      .max(10, 'Meta: máximo 10 sections en un list'),
  }),
  transitions: z.array(TransitionSchema),
});

const SendMediaNodeSchema = z.object({
  id: z.string().min(1),
  type: z.literal('send_media'),
  content: z.discriminatedUnion('media_type', [
    z.object({
      media_type: z.literal('image'),
      url: z.string().url(),
      caption: z
        .string()
        .max(1024, 'Meta: image caption ≤ 1024 chars')
        .optional(),
    }),
    z.object({
      media_type: z.literal('location'),
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
      name: z.string().max(1000).optional(),
      address: z.string().max(1000).optional(),
    }),
    z.object({
      media_type: z.literal('document'),
      url: z.string().url(),
      filename: z
        .string()
        .min(1)
        .max(240, 'Meta: document filename ≤ 240 chars'),
      caption: z
        .string()
        .max(1024, 'Meta: document caption ≤ 1024 chars')
        .optional(),
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

// ============================================================================
// NODOS WHATSAPP v23.0
//
// Mismo patrón estructural que los 7 originales: id + content + transitions.
// Las validaciones de límites Meta v23.0 viven en el campo `content`.
// Reglas cross-card (mismo tipo de botón en todas las cards de un carrusel)
// van en el wrapper .superRefine de FlowNodeSchema (más abajo).
// ============================================================================

const SendCtaUrlNodeSchema = z.object({
  id: z.string().min(1),
  type: z.literal('send_cta_url'),
  content: z.object({
    header: z
      .discriminatedUnion('type', [
        z.object({ type: z.literal('text'), text: z.string().min(1).max(60) }),
        z.object({ type: z.literal('image'), link: httpsUrlSchema }),
        z.object({ type: z.literal('video'), link: httpsUrlSchema }),
        z.object({ type: z.literal('document'), link: httpsUrlSchema }),
      ])
      .optional(),
    body: z.string().min(1).max(1024),
    footer: z.string().max(60).optional(),
    button: z.object({
      display_text: z.string().min(1).max(20),
      url: httpsUrlSchema,
    }),
  }),
  transitions: z.array(TransitionSchema),
});

const SendLocationRequestNodeSchema = z.object({
  id: z.string().min(1),
  type: z.literal('send_location_request'),
  content: z
    .object({
      body: z.string().min(1).max(1024),
    })
    .strict(), // Meta: header/footer NO PERMITIDOS; rechazar claves extra
  transitions: z.array(TransitionSchema),
});

const MediaCarouselButtonSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('quick_reply'),
    id: z.string().min(1).max(256),
    title: z.string().min(1).max(20),
  }),
  z.object({
    type: z.literal('cta_url'),
    display_text: z.string().min(1).max(20),
    url: httpsUrlSchema,
  }),
]);

const MediaCarouselCardSchema = z.object({
  header: z.discriminatedUnion('type', [
    z.object({ type: z.literal('image'), link: httpsUrlSchema }),
    z.object({ type: z.literal('video'), link: httpsUrlSchema }),
  ]),
  body: z.string().min(1).max(1024),
  buttons: z.array(MediaCarouselButtonSchema).min(1).max(2),
});

const SendMediaCarouselNodeSchema = z.object({
  id: z.string().min(1),
  type: z.literal('send_media_carousel'),
  content: z.object({
    body: z.string().min(1).max(1024),
    cards: z.array(MediaCarouselCardSchema).min(1).max(10),
  }),
  transitions: z.array(TransitionSchema),
});

// Emoji compuesto válido: pictogramas, ZWJ ‍, variation selector ️,
// keycap ⃣. Cap a 16 chars de longitud cruda como guard razonable
// (un emoji familia 👨‍👩‍👧‍👦 son 11 chars en UTF-16).
const SendReactionNodeSchema = z.object({
  id: z.string().min(1),
  type: z.literal('send_reaction'),
  content: z.object({
    emoji: z
      .string()
      .max(16, 'El emoji excede 16 chars (UTF-16)')
      .refine(
        (val) => val === '' || /^[\p{Extended_Pictographic}‍️⃣]+$/u.test(val),
        'Debe ser un emoji Unicode válido o string vacío',
      ),
    target: z.literal('last_user_message'),
  }),
  transitions: z.array(TransitionSchema),
});

const RequestCallPermissionNodeSchema = z.object({
  id: z.string().min(1),
  type: z.literal('request_call_permission'),
  content: z.object({
    body: z.string().min(1).max(1024),
    footer: z.string().max(60).optional(),
  }),
  transitions: z.array(TransitionSchema),
});

const SendWhatsappFlowNodeSchema = z.object({
  id: z.string().min(1),
  type: z.literal('send_whatsapp_flow'),
  content: z.object({
    header: z.string().max(60).optional(),
    body: z.string().min(1).max(1024),
    footer: z.string().max(60).optional(),
    whatsapp_flow_id: z.string().uuid('whatsapp_flow_id debe ser UUID válido'),
    flow_cta: z.string().min(1).max(20),
    mode: z.enum(['draft', 'published']),
    flow_action: z.enum(['navigate', 'data_exchange']).optional(),
    flow_action_payload: z
      .object({
        screen: z.string().optional(),
        data: z.record(z.unknown()).optional(),
      })
      .optional(),
  }),
  transitions: z.array(TransitionSchema),
});

// ============================================================================
// UNION DE NODOS — TODOS comparten shape: id + content + transitions
// ============================================================================

export const FlowNodeSchema = z
  .discriminatedUnion('type', [
    SendTextNodeSchema,
    SendButtonsNodeSchema,
    SendListNodeSchema,
    SendMediaNodeSchema,
    SendCtaUrlNodeSchema,
    SendLocationRequestNodeSchema,
    SendMediaCarouselNodeSchema,
    SendReactionNodeSchema,
    WaitInputNodeSchema,
    EscapeToHumanNodeSchema,
    RequestCallPermissionNodeSchema,
    EndNodeSchema,
    SendWhatsappFlowNodeSchema,
  ])
  // Regla cross-card del carrusel: todas las cards deben usar el mismo tipo
  // de botón (todo quick_reply o todo cta_url).
  .superRefine((node, ctx) => {
    if (node.type !== 'send_media_carousel') return;
    const cards = node.content.cards;
    if (cards.length === 0) return;
    const firstButtonType = cards[0]?.buttons[0]?.type;
    if (!firstButtonType) return;
    cards.forEach((card, i) => {
      for (const btn of card.buttons) {
        if (btn.type !== firstButtonType) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['content', 'cards', i, 'buttons'],
            message: `Todas las cards del carrusel deben usar el mismo tipo de botón (${firstButtonType}). Encontrado: ${btn.type}.`,
          });
        }
      }
    });
  });

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

    // Meta: max 10 items totales en static sections de cada send_list.
    // Aplicado aquí (en vez de en SendListNodeSchema.refine) porque
    // discriminatedUnion no acepta ZodEffects en sus ramas (ver nota arriba).
    for (const node of flow.nodes) {
      if (node.type === 'send_list') {
        const totalStatic = node.content.sections.reduce(
          (acc: number, s: { type: 'static' | 'dynamic'; items?: unknown[] }) => {
            if (s.type === 'static' && Array.isArray(s.items)) return acc + s.items.length;
            return acc;
          },
          0,
        );
        if (totalStatic > 10) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Nodo "${node.id}": Meta: máximo 10 items totales en static sections`,
          });
        }
      }
    }

    // Meta: hard cap de 10 rows totales sumando static + dynamic
    // (dynamic se valida en runtime en DynamicSectionResolver; aquí solo prevenimos
    // configuraciones absurdas como 11 secciones estáticas vacías).
    for (const node of flow.nodes) {
      if (node.type === 'send_list') {
        const sectionsCount = node.content.sections.length;
        if (sectionsCount > 10) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Nodo "${node.id}": Meta: máximo 10 sections (recibidas ${sectionsCount})`,
          });
        }
      }
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