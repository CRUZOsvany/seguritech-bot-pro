import { NotificationPort, MetaCredentialsRepository } from '@/domain/ports';
import type { OutboundContent } from '@/domain/conversation/OutboundMessage';
import { buildMetaPayload, type MetaSendPayload } from './meta/metaPayloads';
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

/**
 * Traduce el webhook de Meta al mensaje que entiende el motor. Función pura
 * (solo registra en el logger): la usan el webhook real y el simulador del
 * Studio, que arma webhooks sintéticos para que un toque de botón o de fila
 * llegue al motor exactamente como llegaría de WhatsApp.
 */
export function parseMetaWebhook(
  requestBody: unknown,
  logger: pino.Logger,
): ParsedIncomingMessage | null {
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
      // Preferimos el id del reply SALVO que sea uno de los sintéticos que
      // genera sendButtons (`btn_0`/`btn_1`/`btn_2`): ahí el id del nodo se
      // descartó al enviar y el único dato con significado es el título.
      //
      // Un carrusel sí conserva el id real de su quick_reply
      // (sendMediaCarousel lo pasa tal cual), y en las cards dinámicas ese
      // id es el id del producto — sin esta rama todas las cards llegarían
      // con el MISMO texto (el button_title compartido) y sería imposible
      // saber cuál tocó el cliente.
      const replyId = message.interactive.button_reply.id;
      content =
        replyId && !/^btn_\d+$/.test(replyId)
          ? replyId
          : message.interactive.button_reply.title;
    } else if (message.interactive?.list_reply) {
      // El id de la fila, no el título. sendList conserva los ids del flow
      // (a diferencia de sendButtons), y en una sección dinámica ese id es
      // el del producto o del servicio: con el título, `list_item_any`
      // guardaba "Engargolado" como matched_service_id y
      // {{matched_service_name}} salía vacío. El intérprete sigue
      // aceptando el título para quien escribe la opción en vez de tocarla.
      content =
        message.interactive.list_reply.id || message.interactive.list_reply.title;
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
      logger.warn(
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
    logger.error(
      { err: error, payload: JSON.stringify(requestBody).slice(0, 500) },
      '❌ Error parseando incoming',
    );
    return null;
  }
}

export class MetaWhatsAppAdapter implements NotificationPort {
  private readonly metaApiUrl: string;

  constructor(
    private readonly logger: pino.Logger,
    private readonly credsRepo: MetaCredentialsRepository,
    metaApiUrl?: string,
  ) {
    this.metaApiUrl = metaApiUrl || 'https://graph.facebook.com/v23.0';
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
    return parseMetaWebhook(requestBody, this.logger);
  }

  // ========================================================================
  // ENVÍO DE MENSAJES
  //
  // Cada método traduce sus argumentos a un OutboundContent y el payload lo
  // arma buildMetaPayload (meta/metaPayloads.ts), la misma función que usa
  // el simulador del Studio.
  // ========================================================================

  async sendMessage(tenantId: string, phoneNumber: string, message: string): Promise<void> {
    await this.send(tenantId, phoneNumber, { kind: 'text', text: message },
      '⚠️  Sin credenciales Meta para este tenant — mensaje no enviado');
  }

  async sendButtons(
    tenantId: string,
    phoneNumber: string,
    message: string,
    buttons: string[],
  ): Promise<void> {
    // El id real del botón no llega hasta aquí (NotificationPort solo recibe
    // títulos): buildMetaPayload los numera btn_0..2, como siempre.
    await this.send(
      tenantId,
      phoneNumber,
      { kind: 'buttons', text: message, buttons: buttons.map((title, i) => ({ id: `btn_${i}`, title })) },
      '⚠️  Sin credenciales Meta para este tenant — mensaje no enviado',
    );
  }

  async sendImage(
    tenantId: string,
    phoneNumber: string,
    imageUrl: string,
    caption?: string,
  ): Promise<void> {
    await this.send(tenantId, phoneNumber, { kind: 'image', url: imageUrl, caption },
      '⚠️  Sin credenciales Meta para este tenant — imagen no enviada');
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
    await this.send(
      tenantId,
      phoneNumber,
      {
        kind: 'list',
        text: bodyText,
        buttonLabel,
        sections: sections.map((s) => ({ title: s.title, items: s.rows })),
      },
      '⚠️  Sin credenciales Meta para este tenant — list no enviado',
    );
  }

  async sendLocation(
    tenantId: string,
    phoneNumber: string,
    latitude: number,
    longitude: number,
    name?: string,
    address?: string,
  ): Promise<void> {
    await this.send(tenantId, phoneNumber, { kind: 'location', latitude, longitude, name, address },
      '⚠️  Sin credenciales Meta para este tenant — location no enviada');
  }

  async sendDocument(
    tenantId: string,
    phoneNumber: string,
    documentUrl: string,
    filename: string,
    caption?: string,
  ): Promise<void> {
    await this.send(tenantId, phoneNumber, { kind: 'document', url: documentUrl, filename, caption },
      '⚠️  Sin credenciales Meta para este tenant — document no enviado');
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
    await this.send(
      tenantId,
      phoneNumber,
      {
        kind: 'cta_url',
        body,
        button,
        ...(opts?.header ? { header: opts.header } : {}),
        ...(opts?.footer ? { footer: opts.footer } : {}),
      },
      '⚠️  Sin credenciales — sendCtaUrl no enviado',
    );
  }

  async sendLocationRequest(tenantId: string, phoneNumber: string, body: string): Promise<void> {
    await this.send(tenantId, phoneNumber, { kind: 'location_request', body },
      '⚠️  Sin credenciales — sendLocationRequest no enviado');
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
    await this.send(tenantId, phoneNumber, { kind: 'media_carousel', body, cards },
      '⚠️  Sin credenciales — sendMediaCarousel no enviado');
  }

  async sendReaction(
    tenantId: string,
    phoneNumber: string,
    messageId: string,
    emoji: string,
  ): Promise<void> {
    await this.send(tenantId, phoneNumber, { kind: 'reaction', emoji, messageId },
      '⚠️  Sin credenciales — sendReaction no enviado');
  }

  async sendCallPermissionRequest(
    tenantId: string,
    phoneNumber: string,
    body: string,
    footer?: string,
  ): Promise<void> {
    await this.send(
      tenantId,
      phoneNumber,
      { kind: 'call_permission_request', body, ...(footer ? { footer } : {}) },
      '⚠️  Sin credenciales — sendCallPermissionRequest no enviado',
    );
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
    // flow_token es un nonce único por envío. Meta lo incluye en el nfm_reply
    // del webhook para que puedas correlacionar la respuesta con la sesión.
    const flowToken = `ft_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await this.send(
      tenantId,
      phoneNumber,
      {
        kind: 'whatsapp_flow',
        body,
        flow_id_meta,
        flow_cta,
        mode: opts?.mode ?? 'published',
        ...(opts?.header ? { header: opts.header } : {}),
        ...(opts?.footer ? { footer: opts.footer } : {}),
        ...(opts?.flow_action ? { flow_action: opts.flow_action } : {}),
        ...(opts?.flow_action_payload ? { flow_action_payload: opts.flow_action_payload } : {}),
      },
      '⚠️  Sin credenciales — sendWhatsappFlow no enviado',
      { flowToken },
    );
  }

  /**
   * Credenciales → payload → Meta. Sin credenciales o con un mensaje que
   * Meta rechazaría por forma (lista o carrusel fuera de rango), se registra
   * y no se envía, igual que antes.
   */
  private async send(
    tenantId: string,
    phoneNumber: string,
    content: OutboundContent,
    noCredsWarning: string,
    buildOpts: { flowToken?: string } = {},
  ): Promise<void> {
    const creds = await this.credsRepo.findByTenantId(tenantId);
    if (!creds) {
      this.logger.warn({ tenantId, phoneNumber }, noCredsWarning);
      return;
    }

    const built = buildMetaPayload(phoneNumber, content, buildOpts);
    if (!built.ok) {
      this.logger.error({ tenantId, kind: content.kind }, `❌ ${built.reason}`);
      return;
    }

    await this.sendToMeta(creds, built.payload, phoneNumber);
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
    // `payload.to` ya viene normalizado (MX/AR sin el dígito legacy, #131030)
    // desde buildMetaPayload.
    const url = `${this.metaApiUrl}/${creds.phoneNumberId}/messages`;

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
