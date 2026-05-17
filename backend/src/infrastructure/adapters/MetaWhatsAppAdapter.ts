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
          text?: { body: string };
          interactive?: {
            button_reply?: { id: string; title: string };
            list_reply?: { id: string; title: string };
          };
          timestamp: string;
          id?: string;
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
  content: string;
  businessNumber: string;
  timestamp: string;
  messageId?: string;
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

type MetaSendPayload =
  | MetaTextPayload
  | MetaButtonPayload
  | MetaImagePayload
  | MetaListPayload
  | MetaLocationPayload
  | MetaDocumentPayload;

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

      // Soportar text e interactive (botones/listas)
      let content: string | undefined;
      if (message.text?.body) {
        content = message.text.body;
      } else if (message.interactive?.button_reply?.title) {
        content = message.interactive.button_reply.title;
      } else if (message.interactive?.list_reply?.title) {
        content = message.interactive.list_reply.title;
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