import { NotificationPort, MetaCredentialsRepository } from '@/domain/ports';
import pino from 'pino';
import { Request, Response } from 'express';

/**
 * =========================================================================
 * MetaWhatsAppAdapter — Sprint C (multi-tenant)
 * =========================================================================
 *
 * Cambios vs Sprint 2:
 *   - YA NO recibe phoneNumberId/accessToken en el constructor. Los resuelve
 *     por tenantId vía MetaCredentialsRepository en cada llamada.
 *   - Implementa sendImage (nuevo en NotificationPort).
 *   - verifyWebhook y parseIncomingMessage siguen siendo agnósticos al tenant
 *     porque trabajan sobre el payload bruto antes de saber el tenantId.
 */

interface MetaWebhookPayload {
  entry: Array<{
    changes: Array<{
      value: {
        messaging_product: string;
        metadata: {
          display_phone_number: string;
          phone_number_id: string;
        };
        messages?: Array<{
          from: string;
          id?: string;
          timestamp: string;
          type?: string;
          // Mensaje de texto plano
          text?: { body: string };
          // Respuesta interactiva (botón, lista, WhatsApp Flow)
          interactive?: {
            type?: string;
            button_reply?: { id: string; title: string };
            list_reply?: { id: string; title: string };
            // Respuesta a send_whatsapp_flow (nfm_reply)
            nfm_reply?: {
              response_json: string; // JSON-stringificado con datos del formulario
              body: string;
              name: string;
            };
          };
          // Mensaje de ubicación (respuesta a send_location_request)
          location?: {
            latitude: number;
            longitude: number;
            name?: string;
            address?: string;
          };
          // Señal de permiso de llamada
          // Meta webhook docs: type="interactive", interactive.type="call_permission_reply"
          // con interactive.call_permission_reply.status = "accepted" | "declined"
          // Ref: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/payload-examples
        }>;
        contacts?: Array<{
          wa_id: string;
          profile: { name: string };
        }>;
        statuses?: Array<{
          id: string;
          status: string;
          timestamp: string;
        }>;
      };
    }>;
  }>;
}

export interface ParsedIncomingMessage {
  from: string;
  /**
   * Para mensajes de texto/botón/lista: el texto plano.
   * Para location: "__LOCATION__" (señal especial).
   * Para nfm_reply (WhatsApp Flow): "__FLOW_RESPONSE__".
   * Para call_permission_reply aceptada: "__CALL_PERMISSION_GRANTED__".
   * Para call_permission_reply rechazada: "__CALL_PERMISSION_DENIED__".
   */
  content: string;
  businessNumber: string;
  timestamp: string;
  messageId?: string;
  /** Populated cuando type="location" (respuesta a send_location_request) */
  locationPayload?: {
    latitude: number;
    longitude: number;
    name?: string;
    address?: string;
  };
  /** Populated cuando interactive.type="nfm_reply" (respuesta a send_whatsapp_flow) */
  flowResponsePayload?: Record<string, unknown>;
}

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

// ---- Payloads Meta v23.0 ----

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

interface MetaMediaCarouselPayload {
  messaging_product: 'whatsapp';
  to: string;
  type: 'interactive';
  interactive: {
    type: 'media_carousel';
    body?: { text: string };
    action: {
      sections: Array<{
        cards: Array<{
          header: { type: 'image' | 'video'; image?: { link: string }; video?: { link: string } };
          body: { text: string };
          action: {
            buttons: Array<
              | { type: 'reply'; reply: { id: string; title: string } }
              | {
                  type: 'cta_url';
                  parameters: { display_text: string; url: string };
                }
            >;
          };
        }>;
      }>;
    };
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

type MetaSendPayload =
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

/**
 * México (+52) y Argentina (+54): WhatsApp entrega el wa_id con un dígito extra
 * (52 1 NNNNNNNNNN / 54 9 NNNNNNNNNN) pero el ENVÍO debe ir sin él, o Meta
 * responde (#131030) recipient not in allowed list. Normalizamos al enviar.
 */
function normalizeWaId(to: string): string {
  const d = to.replace(/\D/g, '');
  if (d.startsWith('521') && d.length === 13) return '52' + d.slice(3);
  if (d.startsWith('549') && d.length === 13) return '54' + d.slice(3);
  return d;
}

export class MetaWhatsAppAdapter implements NotificationPort {
  private readonly metaApiUrl: string;

  constructor(
    private readonly logger: pino.Logger,
    private readonly credsRepo: MetaCredentialsRepository,
    metaApiUrl?: string,
  ) {
    this.metaApiUrl = metaApiUrl || 'https://graph.facebook.com/v21.0';
  }

  // ========================================================================
  // VERIFICACIÓN DE WEBHOOK
  // ========================================================================

  verifyWebhook(req: Request, res: Response): void {
    try {
      const mode = req.query['hub.mode'] as string;
      const verifyToken = req.query['hub.verify_token'] as string;
      const challenge = req.query['hub.challenge'] as string;

      const expectedToken = process.env.META_VERIFY_TOKEN || '';

      if (!mode || !verifyToken || !challenge) {
        this.logger.warn('❌ Verificación incompleta');
        res.sendStatus(403);
        return;
      }

      if (mode === 'subscribe' && verifyToken === expectedToken) {
        this.logger.info('✅ Webhook verificado por Meta');
        res.status(200).send(challenge);
      } else {
        this.logger.warn('❌ Token de verificación inválido');
        res.sendStatus(403);
      }
    } catch (error) {
      this.logger.error({ err: error }, '❌ Error en verifyWebhook');
      res.sendStatus(500);
    }
  }

  // ========================================================================
  // PARSEO DE ENTRADA
  // ========================================================================

  parseIncomingMessage(requestBody: unknown): ParsedIncomingMessage | null {
    try {
      const payload = requestBody as MetaWebhookPayload;

      if (!payload.entry?.length) return null;
      const entry = payload.entry[0];
      if (!entry.changes?.length) return null;

      const change = entry.changes[0];
      const value = change.value;

      if (!value.messages?.length) return null;
      const message = value.messages[0];
      const businessNumber = value.metadata?.display_phone_number;
      if (!businessNumber) return null;

      // Soportar text e interactive (botones/listas) + tipos v23.0
      let content: string | undefined;
      let locationPayload: ParsedIncomingMessage['locationPayload'];
      let flowResponsePayload: ParsedIncomingMessage['flowResponsePayload'];

      if (message.text?.body) {
        content = message.text.body;
      } else if (message.interactive?.button_reply?.title) {
        content = message.interactive.button_reply.title;
      } else if (message.interactive?.list_reply?.title) {
        content = message.interactive.list_reply.title;
      } else if (message.interactive?.type === 'call_permission_reply') {
        // Meta envía interactive.type = "call_permission_reply"
        // El campo status lo obtenemos del objeto raw via cast seguro
        const rawInteractive = message.interactive as Record<string, unknown>;
        const reply = rawInteractive['call_permission_reply'] as { status?: string } | undefined;
        if (reply?.status === 'accepted') {
          content = '__CALL_PERMISSION_GRANTED__';
        } else {
          content = '__CALL_PERMISSION_DENIED__';
        }
      } else if (message.interactive?.nfm_reply) {
        // Respuesta a un WhatsApp Flow (formulario multipantalla)
        content = '__FLOW_RESPONSE__';
        try {
          flowResponsePayload = JSON.parse(
            message.interactive.nfm_reply.response_json,
          ) as Record<string, unknown>;
        } catch {
          flowResponsePayload = {
            body: message.interactive.nfm_reply.body,
            name: message.interactive.nfm_reply.name,
          };
        }
      } else if (message.location) {
        // Respuesta a send_location_request
        content = '__LOCATION__';
        locationPayload = {
          latitude: message.location.latitude,
          longitude: message.location.longitude,
          ...(message.location.name ? { name: message.location.name } : {}),
          ...(message.location.address ? { address: message.location.address } : {}),
        };
      }

      if (!message.from || !content) {
        this.logger.warn(
          { messageType: Object.keys(message) },
          '⚠️  Mensaje sin contenido procesable',
        );
        return null;
      }

      return {
        from: message.from,
        content,
        businessNumber,
        timestamp: message.timestamp || new Date().toISOString(),
        messageId: message.id,
        ...(locationPayload ? { locationPayload } : {}),
        ...(flowResponsePayload ? { flowResponsePayload } : {}),
      };
    } catch (error) {
      this.logger.error(
        { err: error, payload: JSON.stringify(requestBody).slice(0, 500) },
        '❌ Error parseando incoming',
      );
      return null;
    }
  }

  // ========================================================================
  // ENVÍO DE MENSAJES
  // ========================================================================

  async sendMessage(
    tenantId: string,
    phoneNumber: string,
    message: string,
  ): Promise<void> {
    const creds = await this.credsRepo.findByTenantId(tenantId);
    if (!creds) {
      this.logger.warn(
        { tenantId, phoneNumber },
        '⚠️  Sin credenciales Meta para este tenant — mensaje no enviado',
      );
      return;
    }

    const payload: MetaTextPayload = {
      messaging_product: 'whatsapp',
      to: phoneNumber,
      type: 'text',
      text: { body: message },
    };

    await this.sendToMeta(creds, payload, phoneNumber);
  }

  async sendButtons(
    tenantId: string,
    phoneNumber: string,
    message: string,
    buttons: string[],
  ): Promise<void> {
    const creds = await this.credsRepo.findByTenantId(tenantId);
    if (!creds) {
      this.logger.warn(
        { tenantId, phoneNumber },
        '⚠️  Sin credenciales Meta para este tenant — mensaje no enviado',
      );
      return;
    }

    if (buttons.length === 0) {
      // Fallback: enviar como texto plano si no hay botones
      return this.sendMessage(tenantId, phoneNumber, message);
    }

    const buttonPayload = buttons.slice(0, 3).map((title, index) => ({
      type: 'reply' as const,
      reply: {
        id: `btn_${index}`,
        title: title.slice(0, 20),
      },
    }));

    const payload: MetaButtonPayload = {
      messaging_product: 'whatsapp',
      to: phoneNumber,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: message },
        action: { buttons: buttonPayload },
      },
    };

    await this.sendToMeta(creds, payload, phoneNumber);
  }

  async sendImage(
    tenantId: string,
    phoneNumber: string,
    imageUrl: string,
    caption?: string,
  ): Promise<void> {
    const creds = await this.credsRepo.findByTenantId(tenantId);
    if (!creds) {
      this.logger.warn(
        { tenantId, phoneNumber },
        '⚠️  Sin credenciales Meta para este tenant — imagen no enviada',
      );
      return;
    }

    const payload: MetaImagePayload = {
      messaging_product: 'whatsapp',
      to: phoneNumber,
      type: 'image',
      image: { link: imageUrl, ...(caption ? { caption } : {}) },
    };

    await this.sendToMeta(creds, payload, phoneNumber);
  }

  async sendList(
    tenantId: string,
    phoneNumber: string,
    bodyText: string,
    buttonLabel: string,
    sections: Array<{
      title: string;
      rows: Array<{ id: string; title: string; description?: string }>;
    }>,
  ): Promise<void> {
    const creds = await this.credsRepo.findByTenantId(tenantId);
    if (!creds) {
      this.logger.warn(
        { tenantId, phoneNumber },
        '⚠️  Sin credenciales Meta para este tenant — list no enviado',
      );
      return;
    }

    // Validación defensiva en runtime (el Zod del flow ya valida, pero por
    // si llegan llamadas directas desde código externo)
    if (sections.length === 0 || sections.length > 10) {
      this.logger.error(
        { tenantId, sectionsCount: sections.length },
        '❌ List inválida: sections debe ser 1..10',
      );
      return;
    }
    const totalRows = sections.reduce((acc, s) => acc + s.rows.length, 0);
    if (totalRows === 0 || totalRows > 10) {
      this.logger.error(
        { tenantId, totalRows },
        '❌ List inválida: total rows debe ser 1..10',
      );
      return;
    }

    const payload: MetaListPayload = {
      messaging_product: 'whatsapp',
      to: phoneNumber,
      type: 'interactive',
      interactive: {
        type: 'list',
        body: { text: bodyText.slice(0, 1024) },
        action: {
          button: buttonLabel.slice(0, 20),
          sections: sections.map((s) => ({
            title: s.title.slice(0, 24),
            rows: s.rows.map((r) => ({
              id: r.id,
              title: r.title.slice(0, 24),
              ...(r.description ? { description: r.description.slice(0, 72) } : {}),
            })),
          })),
        },
      },
    };

    await this.sendToMeta(creds, payload, phoneNumber);
  }

  async sendLocation(
    tenantId: string,
    phoneNumber: string,
    latitude: number,
    longitude: number,
    name?: string,
    address?: string,
  ): Promise<void> {
    const creds = await this.credsRepo.findByTenantId(tenantId);
    if (!creds) {
      this.logger.warn(
        { tenantId, phoneNumber },
        '⚠️  Sin credenciales Meta para este tenant — location no enviada',
      );
      return;
    }

    const payload: MetaLocationPayload = {
      messaging_product: 'whatsapp',
      to: phoneNumber,
      type: 'location',
      location: {
        latitude,
        longitude,
        ...(name ? { name } : {}),
        ...(address ? { address } : {}),
      },
    };

    await this.sendToMeta(creds, payload, phoneNumber);
  }

  async sendDocument(
    tenantId: string,
    phoneNumber: string,
    documentUrl: string,
    filename: string,
    caption?: string,
  ): Promise<void> {
    const creds = await this.credsRepo.findByTenantId(tenantId);
    if (!creds) {
      this.logger.warn(
        { tenantId, phoneNumber },
        '⚠️  Sin credenciales Meta para este tenant — document no enviado',
      );
      return;
    }

    const payload: MetaDocumentPayload = {
      messaging_product: 'whatsapp',
      to: phoneNumber,
      type: 'document',
      document: {
        link: documentUrl,
        filename: filename.slice(0, 240),
        ...(caption ? { caption: caption.slice(0, 1024) } : {}),
      },
    };

    await this.sendToMeta(creds, payload, phoneNumber);
  }

  // ========================================================================
  // ENVÍOS WhatsApp v23.0 (Prompt 3)
  // ========================================================================

  async sendCtaUrl(
    tenantId: string,
    phoneNumber: string,
    body: string,
    button: { display_text: string; url: string },
    opts?: {
      header?: { type: 'text'; text: string } | { type: 'image' | 'video' | 'document'; link: string };
      footer?: string;
    },
  ): Promise<void> {
    const creds = await this.credsRepo.findByTenantId(tenantId);
    if (!creds) {
      this.logger.warn({ tenantId, phoneNumber }, '⚠️  Sin credenciales — sendCtaUrl no enviado');
      return;
    }

    // Construir header Meta según tipo
    let metaHeader: MetaCtaUrlPayload['interactive']['header'] | undefined;
    if (opts?.header) {
      const h = opts.header;
      if (h.type === 'text') {
        metaHeader = { type: 'text', text: h.text.slice(0, 60) };
      } else if (h.type === 'image') {
        metaHeader = { type: 'image', image: { link: h.link } };
      } else if (h.type === 'video') {
        metaHeader = { type: 'video', video: { link: h.link } };
      } else if (h.type === 'document') {
        metaHeader = { type: 'document', document: { link: h.link } };
      }
    }

    const payload: MetaCtaUrlPayload = {
      messaging_product: 'whatsapp',
      to: phoneNumber,
      type: 'interactive',
      interactive: {
        type: 'cta_url',
        ...(metaHeader ? { header: metaHeader } : {}),
        body: { text: body.slice(0, 1024) },
        ...(opts?.footer ? { footer: { text: opts.footer.slice(0, 60) } } : {}),
        action: {
          name: 'cta_url',
          parameters: {
            display_text: button.display_text.slice(0, 20),
            url: button.url.slice(0, 2000),
          },
        },
      },
    };

    await this.sendToMeta(creds, payload, phoneNumber);
  }

  async sendLocationRequest(
    tenantId: string,
    phoneNumber: string,
    body: string,
  ): Promise<void> {
    const creds = await this.credsRepo.findByTenantId(tenantId);
    if (!creds) {
      this.logger.warn({ tenantId, phoneNumber }, '⚠️  Sin credenciales — sendLocationRequest no enviado');
      return;
    }

    const payload: MetaLocationRequestPayload = {
      messaging_product: 'whatsapp',
      to: phoneNumber,
      type: 'interactive',
      interactive: {
        type: 'location_request_message',
        body: { text: body.slice(0, 1024) },
        action: { name: 'send_location' },
      },
    };

    await this.sendToMeta(creds, payload, phoneNumber);
  }

  async sendMediaCarousel(
    tenantId: string,
    phoneNumber: string,
    body: string,
    cards: Array<{
      header: { type: 'image' | 'video'; link: string };
      body: string;
      buttons: Array<
        | { type: 'quick_reply'; id: string; title: string }
        | { type: 'cta_url'; display_text: string; url: string }
      >;
    }>,
  ): Promise<void> {
    const creds = await this.credsRepo.findByTenantId(tenantId);
    if (!creds) {
      this.logger.warn({ tenantId, phoneNumber }, '⚠️  Sin credenciales — sendMediaCarousel no enviado');
      return;
    }

    if (cards.length === 0 || cards.length > 10) {
      this.logger.error({ tenantId, cardsCount: cards.length }, '❌ Carrusel inválido: 1..10 cards');
      return;
    }

    const metaCards: MetaMediaCarouselPayload['interactive']['action']['sections'][0]['cards'] =
      cards.map((card) => {
        const header: MetaMediaCarouselPayload['interactive']['action']['sections'][0]['cards'][0]['header'] =
          card.header.type === 'image'
            ? { type: 'image', image: { link: card.header.link } }
            : { type: 'video', video: { link: card.header.link } };

        const buttons: MetaMediaCarouselPayload['interactive']['action']['sections'][0]['cards'][0]['action']['buttons'] =
          card.buttons.slice(0, 2).map((btn) => {
            if (btn.type === 'quick_reply') {
              return {
                type: 'reply' as const,
                reply: { id: btn.id, title: btn.title.slice(0, 20) },
              };
            }
            return {
              type: 'cta_url' as const,
              parameters: { display_text: btn.display_text.slice(0, 20), url: btn.url },
            };
          });

        return {
          header,
          body: { text: card.body.slice(0, 1024) },
          action: { buttons },
        };
      });

    const payload: MetaMediaCarouselPayload = {
      messaging_product: 'whatsapp',
      to: phoneNumber,
      type: 'interactive',
      interactive: {
        type: 'media_carousel',
        ...(body.trim() ? { body: { text: body.slice(0, 1024) } } : {}),
        action: { sections: [{ cards: metaCards }] },
      },
    };

    await this.sendToMeta(creds, payload, phoneNumber);
  }

  async sendReaction(
    tenantId: string,
    phoneNumber: string,
    messageId: string,
    emoji: string,
  ): Promise<void> {
    const creds = await this.credsRepo.findByTenantId(tenantId);
    if (!creds) {
      this.logger.warn({ tenantId, phoneNumber }, '⚠️  Sin credenciales — sendReaction no enviado');
      return;
    }

    const payload: MetaReactionPayload = {
      messaging_product: 'whatsapp',
      to: phoneNumber,
      type: 'reaction',
      reaction: {
        message_id: messageId,
        emoji,
      },
    };

    await this.sendToMeta(creds, payload, phoneNumber);
  }

  async sendCallPermissionRequest(
    tenantId: string,
    phoneNumber: string,
    body: string,
    footer?: string,
  ): Promise<void> {
    const creds = await this.credsRepo.findByTenantId(tenantId);
    if (!creds) {
      this.logger.warn({ tenantId, phoneNumber }, '⚠️  Sin credenciales — sendCallPermissionRequest no enviado');
      return;
    }

    const payload: MetaCallPermissionPayload = {
      messaging_product: 'whatsapp',
      to: phoneNumber,
      type: 'interactive',
      interactive: {
        type: 'call_permission_request',
        body: { text: body.slice(0, 1024) },
        ...(footer ? { footer: { text: footer.slice(0, 60) } } : {}),
        action: { name: 'send_call_permission' },
      },
    };

    await this.sendToMeta(creds, payload, phoneNumber);
  }

  async sendWhatsappFlow(
    tenantId: string,
    phoneNumber: string,
    body: string,
    flow_id_meta: string,
    flow_cta: string,
    opts?: {
      header?: string;
      footer?: string;
      mode?: 'draft' | 'published';
      flow_action?: 'navigate' | 'data_exchange';
      flow_action_payload?: { screen?: string; data?: Record<string, unknown> };
    },
  ): Promise<void> {
    const creds = await this.credsRepo.findByTenantId(tenantId);
    if (!creds) {
      this.logger.warn({ tenantId, phoneNumber }, '⚠️  Sin credenciales — sendWhatsappFlow no enviado');
      return;
    }

    // flow_token es un nonce único por envío. Meta lo incluye en el nfm_reply
    // del webhook para que puedas correlacionar la respuesta con la sesión.
    const flow_token = `ft_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const payload: MetaWhatsappFlowPayload = {
      messaging_product: 'whatsapp',
      to: phoneNumber,
      type: 'interactive',
      interactive: {
        type: 'flow',
        ...(opts?.header ? { header: { type: 'text', text: opts.header.slice(0, 60) } } : {}),
        body: { text: body.slice(0, 1024) },
        ...(opts?.footer ? { footer: { text: opts.footer.slice(0, 60) } } : {}),
        action: {
          name: 'flow',
          parameters: {
            flow_message_version: '3',
            flow_token,
            flow_id: flow_id_meta,
            flow_cta: flow_cta.slice(0, 20),
            mode: opts?.mode ?? 'published',
            ...(opts?.flow_action ? { flow_action: opts.flow_action } : {}),
            ...(opts?.flow_action_payload
              ? { flow_action_payload: opts.flow_action_payload }
              : {}),
          },
        },
      },
    };

    await this.sendToMeta(creds, payload, phoneNumber);
  }

  // ========================================================================
  // HTTP CLIENT
  // ========================================================================

  private async sendToMeta(
    creds: {
      phoneNumberId: string;
      accessToken: string;
    },
    payload: MetaSendPayload,
    phoneNumber: string,
  ): Promise<void> {
    const url = `${this.metaApiUrl}/${creds.phoneNumberId}/messages`;
    payload.to = normalizeWaId(payload.to); // MX/AR: quita el dígito legacy (#131030)

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${creds.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(
          {
            statusCode: response.status,
            errorBody: errorText.slice(0, 500),
            phoneNumber,
            phoneNumberId: creds.phoneNumberId,
          },
          '❌ Meta API retornó error',
        );
        throw new Error(
          `Meta API ${response.status}: ${errorText.slice(0, 200)}`,
        );
      }

      const data = (await response.json()) as { messages?: Array<{ id: string }> };
      this.logger.info(
        { phoneNumber, messageId: data.messages?.[0]?.id },
        '✅ Mensaje enviado a Meta',
      );
    } catch (error) {
      this.logger.error(
        { err: error, phoneNumber, phoneNumberId: creds.phoneNumberId },
        '❌ Error de red con Meta',
      );
      throw error;
    }
  }
}