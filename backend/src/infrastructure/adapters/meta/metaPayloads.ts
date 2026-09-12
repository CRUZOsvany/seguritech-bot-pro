import type { OutboundContent } from '@/domain/conversation/OutboundMessage';

/**
 * JSON exacto que se manda a la Cloud API (`POST /{phone-number-id}/messages`).
 *
 * Una sola función arma el payload de cada tipo de mensaje, y la usan los
 * dos caminos: MetaWhatsAppAdapter para enviar de verdad y el simulador del
 * Studio para mostrar qué se habría enviado. Que sea la misma función es lo
 * que hace cierta la garantía "el bot real responde igual que el simulador".
 *
 * Los recortes (`.slice`) y reglas raras de aquí son los de siempre del
 * adaptador, movidos sin cambios — incluido que los botones de respuesta
 * salen con ids sintéticos `btn_0..2` (hallazgo H-3 del inventario).
 */

interface MetaTextPayload {
  messaging_product: 'whatsapp';
  to: string;
  type: 'text';
  text: { body: string };
}

interface MetaButtonPayload {
  messaging_product: 'whatsapp';
  to: string;
  type: 'interactive';
  interactive: {
    type: 'button';
    body: { text: string };
    action: {
      buttons: Array<{
        type: 'reply';
        reply: { id: string; title: string };
      }>;
    };
  };
}

interface MetaImagePayload {
  messaging_product: 'whatsapp';
  to: string;
  type: 'image';
  image: { link: string; caption?: string };
}

interface MetaListPayload {
  messaging_product: 'whatsapp';
  to: string;
  type: 'interactive';
  interactive: {
    type: 'list';
    body: { text: string };
    action: {
      button: string;
      sections: Array<{
        title: string;
        rows: Array<{ id: string; title: string; description?: string }>;
      }>;
    };
  };
}

interface MetaLocationPayload {
  messaging_product: 'whatsapp';
  to: string;
  type: 'location';
  location: {
    latitude: number;
    longitude: number;
    name?: string;
    address?: string;
  };
}

interface MetaDocumentPayload {
  messaging_product: 'whatsapp';
  to: string;
  type: 'document';
  document: {
    link: string;
    filename: string;
    caption?: string;
  };
}

interface MetaCtaUrlPayload {
  messaging_product: 'whatsapp';
  to: string;
  type: 'interactive';
  interactive: {
    type: 'cta_url';
    header?: (
      | { type: 'text'; text: string }
      | { type: 'image'; image: { link: string } }
      | { type: 'video'; video: { link: string } }
      | { type: 'document'; document: { link: string } }
    );
    body: { text: string };
    footer?: { text: string };
    action: {
      name: 'cta_url';
      parameters: { display_text: string; url: string };
    };
  };
}

interface MetaLocationRequestPayload {
  messaging_product: 'whatsapp';
  to: string;
  type: 'interactive';
  interactive: {
    type: 'location_request_message';
    body: { text: string };
    action: { name: 'send_location' };
  };
}

type MetaCarouselCard = {
  header: { type: 'image' | 'video'; image?: { link: string }; video?: { link: string } };
  body: { text: string };
  action: {
    buttons: Array<
      | { type: 'reply'; reply: { id: string; title: string } }
      | { type: 'cta_url'; parameters: { display_text: string; url: string } }
    >;
  };
};

interface MetaMediaCarouselPayload {
  messaging_product: 'whatsapp';
  to: string;
  type: 'interactive';
  interactive: {
    type: 'media_carousel';
    body?: { text: string };
    action: { sections: Array<{ cards: MetaCarouselCard[] }> };
  };
}

interface MetaReactionPayload {
  messaging_product: 'whatsapp';
  to: string;
  type: 'reaction';
  reaction: {
    message_id: string;
    emoji: string;
  };
}

interface MetaCallPermissionPayload {
  messaging_product: 'whatsapp';
  to: string;
  type: 'interactive';
  interactive: {
    type: 'call_permission_request';
    body: { text: string };
    footer?: { text: string };
    action: { name: 'send_call_permission' };
  };
}

interface MetaWhatsappFlowPayload {
  messaging_product: 'whatsapp';
  to: string;
  type: 'interactive';
  interactive: {
    type: 'flow';
    header?: { type: 'text'; text: string };
    body: { text: string };
    footer?: { text: string };
    action: {
      name: 'flow';
      parameters: {
        flow_message_version: '3';
        flow_token: string;
        flow_id: string;
        flow_cta: string;
        mode: 'draft' | 'published';
        flow_action?: 'navigate' | 'data_exchange';
        flow_action_payload?: {
          screen?: string;
          data?: Record<string, unknown>;
        };
      };
    };
  };
}

export type MetaSendPayload =
  | MetaTextPayload
  | MetaButtonPayload
  | MetaImagePayload
  | MetaListPayload
  | MetaLocationPayload
  | MetaDocumentPayload
  | MetaCtaUrlPayload
  | MetaLocationRequestPayload
  | MetaMediaCarouselPayload
  | MetaReactionPayload
  | MetaCallPermissionPayload
  | MetaWhatsappFlowPayload;

export type BuildResult =
  | { ok: true; payload: MetaSendPayload }
  /** El mensaje no se puede enviar tal cual (lista o carrusel fuera de rango): el adaptador lo registra y no lo manda. */
  | { ok: false; reason: string };

/**
 * México (+52) y Argentina (+54): WhatsApp entrega el wa_id con un dígito extra
 * (52 1 NNNNNNNNNN / 54 9 NNNNNNNNNN) pero el ENVÍO debe ir sin él, o Meta
 * responde (#131030) recipient not in allowed list. Normalizamos al enviar.
 */
/**
 * "Escribiendo…" (C-07): no es un mensaje, es un cambio de estado sobre el
 * mensaje que mandó el cliente. Lo marca como leído y muestra el indicador
 * hasta que el bot responde o pasan 25 s. Meta pide mostrarlo solo si el bot
 * va a contestar. Doc: developers.facebook.com/docs/whatsapp/cloud-api/typing-indicators
 */
export interface MetaTypingPayload {
  messaging_product: 'whatsapp';
  status: 'read';
  message_id: string;
  typing_indicator: { type: 'text' };
}

export function buildTypingPayload(messageId: string): MetaTypingPayload {
  return { messaging_product: 'whatsapp', status: 'read', message_id: messageId, typing_indicator: { type: 'text' } };
}

export function normalizeWaId(to: string): string {
  const d = to.replace(/\D/g, '');
  if (d.startsWith('521') && d.length === 13) return '52' + d.slice(3);
  if (d.startsWith('549') && d.length === 13) return '54' + d.slice(3);
  return d;
}

export function buildMetaPayload(
  to: string,
  content: OutboundContent,
  opts: {
    /**
     * Nonce por envío de un WhatsApp Flow; Meta lo devuelve en el nfm_reply.
     * El adaptador real lo genera al azar; el simulador pasa uno fijo.
     */
    flowToken?: string;
  } = {},
): BuildResult {
  const base = { messaging_product: 'whatsapp' as const, to: normalizeWaId(to) };

  switch (content.kind) {
  case 'text':
    return { ok: true, payload: { ...base, type: 'text', text: { body: content.text } } };

  case 'buttons': {
    if (content.buttons.length === 0) {
      // Fallback de siempre: sin botones se manda como texto plano.
      return { ok: true, payload: { ...base, type: 'text', text: { body: content.text } } };
    }
    const buttons = content.buttons.slice(0, 3).map((b, index) => ({
      type: 'reply' as const,
      reply: {
        id: `btn_${index}`,
        title: b.title.slice(0, 20),
      },
    }));
    return {
      ok: true,
      payload: {
        ...base,
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text: content.text },
          action: { buttons },
        },
      },
    };
  }

  case 'image':
    return {
      ok: true,
      payload: {
        ...base,
        type: 'image',
        image: { link: content.url, ...(content.caption ? { caption: content.caption } : {}) },
      },
    };

  case 'list': {
    // Validación defensiva en runtime (el Zod del flow ya valida, pero por
    // si llegan llamadas directas desde código externo)
    const sections = content.sections;
    if (sections.length === 0 || sections.length > 10) {
      return { ok: false, reason: 'List inválida: sections debe ser 1..10' };
    }
    const totalRows = sections.reduce((acc, s) => acc + s.items.length, 0);
    if (totalRows === 0 || totalRows > 10) {
      return { ok: false, reason: 'List inválida: total rows debe ser 1..10' };
    }
    return {
      ok: true,
      payload: {
        ...base,
        type: 'interactive',
        interactive: {
          type: 'list',
          body: { text: content.text.slice(0, 1024) },
          action: {
            button: content.buttonLabel.slice(0, 20),
            sections: sections.map((s) => ({
              title: s.title.slice(0, 24),
              rows: s.items.map((r) => ({
                id: r.id,
                title: r.title.slice(0, 24),
                ...(r.description ? { description: r.description.slice(0, 72) } : {}),
              })),
            })),
          },
        },
      },
    };
  }

  case 'location':
    return {
      ok: true,
      payload: {
        ...base,
        type: 'location',
        location: {
          latitude: content.latitude,
          longitude: content.longitude,
          ...(content.name ? { name: content.name } : {}),
          ...(content.address ? { address: content.address } : {}),
        },
      },
    };

  case 'document':
    return {
      ok: true,
      payload: {
        ...base,
        type: 'document',
        document: {
          link: content.url,
          filename: content.filename.slice(0, 240),
          ...(content.caption ? { caption: content.caption.slice(0, 1024) } : {}),
        },
      },
    };

  case 'cta_url': {
    let header: MetaCtaUrlPayload['interactive']['header'] | undefined;
    if (content.header) {
      const h = content.header;
      if (h.type === 'text') {
        header = { type: 'text', text: h.text.slice(0, 60) };
      } else if (h.type === 'image') {
        header = { type: 'image', image: { link: h.link } };
      } else if (h.type === 'video') {
        header = { type: 'video', video: { link: h.link } };
      } else if (h.type === 'document') {
        header = { type: 'document', document: { link: h.link } };
      }
    }
    return {
      ok: true,
      payload: {
        ...base,
        type: 'interactive',
        interactive: {
          type: 'cta_url',
          ...(header ? { header } : {}),
          body: { text: content.body.slice(0, 1024) },
          ...(content.footer ? { footer: { text: content.footer.slice(0, 60) } } : {}),
          action: {
            name: 'cta_url',
            parameters: {
              display_text: content.button.display_text.slice(0, 20),
              url: content.button.url.slice(0, 2000),
            },
          },
        },
      },
    };
  }

  case 'location_request':
    return {
      ok: true,
      payload: {
        ...base,
        type: 'interactive',
        interactive: {
          type: 'location_request_message',
          body: { text: content.body.slice(0, 1024) },
          action: { name: 'send_location' },
        },
      },
    };

  case 'media_carousel': {
    const cards = content.cards;
    if (cards.length === 0 || cards.length > 10) {
      return { ok: false, reason: 'Carrusel inválido: 1..10 cards' };
    }
    const metaCards: MetaCarouselCard[] = cards.map((card) => ({
      header:
        card.header.type === 'image'
          ? { type: 'image', image: { link: card.header.link } }
          : { type: 'video', video: { link: card.header.link } },
      body: { text: card.body.slice(0, 1024) },
      action: {
        buttons: card.buttons.slice(0, 2).map((btn) =>
          btn.type === 'quick_reply'
            ? { type: 'reply' as const, reply: { id: btn.id, title: btn.title.slice(0, 20) } }
            : {
              type: 'cta_url' as const,
              parameters: { display_text: btn.display_text.slice(0, 20), url: btn.url },
            },
        ),
      },
    }));
    return {
      ok: true,
      payload: {
        ...base,
        type: 'interactive',
        interactive: {
          type: 'media_carousel',
          ...(content.body.trim() ? { body: { text: content.body.slice(0, 1024) } } : {}),
          action: { sections: [{ cards: metaCards }] },
        },
      },
    };
  }

  case 'reaction':
    return {
      ok: true,
      payload: {
        ...base,
        type: 'reaction',
        reaction: { message_id: content.messageId, emoji: content.emoji },
      },
    };

  case 'call_permission_request':
    return {
      ok: true,
      payload: {
        ...base,
        type: 'interactive',
        interactive: {
          type: 'call_permission_request',
          body: { text: content.body.slice(0, 1024) },
          ...(content.footer ? { footer: { text: content.footer.slice(0, 60) } } : {}),
          action: { name: 'send_call_permission' },
        },
      },
    };

  case 'whatsapp_flow':
    return {
      ok: true,
      payload: {
        ...base,
        type: 'interactive',
        interactive: {
          type: 'flow',
          ...(content.header ? { header: { type: 'text', text: content.header.slice(0, 60) } } : {}),
          body: { text: content.body.slice(0, 1024) },
          ...(content.footer ? { footer: { text: content.footer.slice(0, 60) } } : {}),
          action: {
            name: 'flow',
            parameters: {
              flow_message_version: '3',
              flow_token: opts.flowToken ?? '',
              flow_id: content.flow_id_meta,
              flow_cta: content.flow_cta.slice(0, 20),
              mode: content.mode ?? 'published',
              ...(content.flow_action ? { flow_action: content.flow_action } : {}),
              ...(content.flow_action_payload
                ? { flow_action_payload: content.flow_action_payload }
                : {}),
            },
          },
        },
      },
    };
  }
}
