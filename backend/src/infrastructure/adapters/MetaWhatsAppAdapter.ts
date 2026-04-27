import { NotificationPort } from '@/domain/ports';
import pino from 'pino';
import { Request, Response } from 'express';

/**
 * =========================================================================
 * MetaWhatsAppAdapter - Traductor oficial Meta ↔ SegurITech
 * =========================================================================
 *
 * Responsabilidades:
 * 1. Verificar webhooks (Handshake con Meta)
 * 2. Parsear payloads de Meta Cloud API a formato interno
 * 3. Enviar mensajes a Meta (texto e interactivos)
 *
 * Notas arquitectónicas:
 * - Implementa NotificationPort para inyección de dependencias
 * - No contamina lógica de negocio con JSON de Meta
 * - Tipado estricto: interfaces para cada payload de Meta
 */

// ============================================================================
// 📋 TIPOS - Interfases para payloads de Meta (solo lo necesario)
// ============================================================================

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
          text: {
            body: string;
          };
          timestamp: string;
        }>;
        contacts?: Array<{
          wa_id: string;
          profile: {
            name: string;
          };
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

interface ParsedIncomingMessage {
  from: string;
  content: string;
  businessNumber: string;
  timestamp: string;
  messageId?: string;
}

interface BotResponse {
  message: string;
  buttons?: string[];
}

interface MetaTextPayload {
  messaging_product: string;
  to: string;
  type: 'text';
  text: {
    body: string;
  };
}

interface MetaButtonPayload {
  messaging_product: string;
  to: string;
  type: 'interactive';
  interactive: {
    type: 'button';
    body: {
      text: string;
    };
    action: {
      buttons: Array<{
        type: 'reply';
        reply: {
          id: string;
          title: string;
        };
      }>;
    };
  };
}

type MetaSendPayload = MetaTextPayload | MetaButtonPayload;

// ============================================================================
// 🔌 ADAPTADOR
// ============================================================================

export class MetaWhatsAppAdapter implements NotificationPort {
  private logger: pino.Logger;
  private metaApiUrl: string;
  private phoneNumberId: string;
  private accessToken: string;

  constructor(
    logger: pino.Logger,
    phoneNumberId?: string,
    accessToken?: string,
    metaApiUrl?: string,
  ) {
    this.logger = logger;
    this.phoneNumberId = phoneNumberId || process.env.META_PHONE_NUMBER_ID || '';
    this.accessToken = accessToken || process.env.META_ACCESS_TOKEN || '';
    this.metaApiUrl = metaApiUrl || 'https://graph.instagram.com/v19.0';

    this.validateConfiguration();
  }

  /**
   * Valida que las credenciales de Meta estén disponibles
   * En desarrollo, puede funcionar sin ellas, pero nos lo advierte
   */
  private validateConfiguration(): void {
    if (!this.phoneNumberId || !this.accessToken) {
      this.logger.warn(
        {
          hasPhoneNumberId: !!this.phoneNumberId,
          hasAccessToken: !!this.accessToken,
        },
        '⚠️  MetaWhatsAppAdapter: Credenciales incompletas. Meta sendMessage fallará.',
      );
    }
  }

  // ========================================================================
  // ✅ VERIFICACIÓN DE WEBHOOK (Handshake)
  // ========================================================================

  /**
   * Intercepta GET /webhook - Handshake obligatorio de Meta
   *
   * Meta envía:
   *   GET /webhook?hub.mode=subscribe
   *                &hub.verify_token=YOUR_TOKEN
   *                &hub.challenge=CHALLENGE_STRING
   *
   * Nosotros respondemos:
   *   HTTP 200
   *   Body: CHALLENGE_STRING (sin quotes, sin JSON)
   */
  verifyWebhook(req: Request, res: Response): void {
    try {
      const mode = req.query['hub.mode'] as string;
      const verifyToken = req.query['hub.verify_token'] as string;
      const challenge = req.query['hub.challenge'] as string;

      const expectedToken = process.env.META_VERIFY_TOKEN || 'tu_token_secreto';

      if (!mode || !verifyToken || !challenge) {
        this.logger.warn(
          { missingParams: { mode: !mode, verifyToken: !verifyToken, challenge: !challenge } },
          '❌ Intento de verificación incompleto',
        );
        res.sendStatus(403);
        return;
      }

      if (mode === 'subscribe' && verifyToken === expectedToken) {
        this.logger.info(
          { phoneNumberId: this.phoneNumberId },
          '✅ Webhook verificado exitosamente por Meta',
        );
        // Meta espera solo el challenge, sin JSON, sin comillas
        res.status(200).send(challenge);
      } else {
        this.logger.warn(
          { receivedToken: verifyToken, expectedToken },
          '❌ Token de verificación incorrecto o mode inválido',
        );
        res.sendStatus(403);
      }
    } catch (error) {
      this.logger.error(
        { error, stack: (error as Error).stack },
        '❌ Error en verifyWebhook',
      );
      res.sendStatus(500);
    }
  }

  // ========================================================================
  // 📥 PARSEO DE ENTRADA (Meta → SegurITech)
  // ========================================================================

  /**
   * Parsea el gigantesco payload de Meta en nuestro formato limpio
   *
   * Entrada (ejemplo):
   * {
   *   "entry": [{
   *     "changes": [{
   *       "value": {
   *         "messaging_product": "whatsapp",
   *         "metadata": {
   *           "display_phone_number": "34123456789",
   *           "phone_number_id": "1234567890"
   *         },
   *         "messages": [{
   *           "from": "34612345678",
   *           "text": { "body": "Hola!" },
   *           "timestamp": "1234567890"
   *         }],
   *         "contacts": [{
   *           "wa_id": "34612345678",
   *           "profile": { "name": "Juan" }
   *         }]
   *       }
   *     }]
   *   }]
   * }
   *
   * Salida (nuestro estándar):
   * {
   *   from: "34612345678",
   *   content: "Hola!",
   *   businessNumber: "34123456789",
   *   timestamp: "1234567890"
   * }
   */
  parseIncomingMessage(requestBody: unknown): ParsedIncomingMessage | null {
    try {
      const payload = requestBody as MetaWebhookPayload;

      // Navegación defensiva: entrada[0].cambios[0].valor.mensajes[0]
      if (
        !payload.entry ||
        !Array.isArray(payload.entry) ||
        payload.entry.length === 0
      ) {
        this.logger.warn({ payload }, '⚠️  Payload sin entries');
        return null;
      }

      const entry = payload.entry[0];
      if (
        !entry.changes ||
        !Array.isArray(entry.changes) ||
        entry.changes.length === 0
      ) {
        this.logger.warn({ entry }, '⚠️  Entry sin changes');
        return null;
      }

      const change = entry.changes[0];
      const value = change.value;

      // Ignorar si no hay mensajes (podría ser estatus de entrega)
      if (!value.messages || value.messages.length === 0) {
        this.logger.debug(
          { valueKeys: Object.keys(value) },
          'ℹ️  Payload recibido pero sin mensajes (probablemente estatus)',
        );
        return null;
      }

      const message = value.messages[0];
      const businessNumber = value.metadata?.display_phone_number;

      if (!message.from || !message.text?.body || !businessNumber) {
        this.logger.warn(
          { message, businessNumber },
          '⚠️  Mensaje incompleto: falta from, text.body o businessNumber',
        );
        return null;
      }

      const parsed: ParsedIncomingMessage = {
        from: message.from,
        content: message.text.body,
        businessNumber,
        timestamp: message.timestamp || new Date().toISOString(),
      };

      this.logger.info(
        { from: parsed.from, businessNumber: parsed.businessNumber, contentLength: parsed.content.length },
        '✅ Mensaje parseado exitosamente',
      );

      return parsed;
    } catch (error) {
      this.logger.error(
        { error, stack: (error as Error).stack, payload: JSON.stringify(requestBody).slice(0, 500) },
        '❌ Error parseando incoming message de Meta',
      );
      return null;
    }
  }

  // ========================================================================
  // 📤 ENVÍO DE MENSAJES (SegurITech → Meta)
  // ========================================================================

  /**
   * Envía un mensaje de texto simple a un número WhatsApp
   * Implementa la interfaz NotificationPort
   *
   * POST https://graph.instagram.com/v19.0/{phoneNumberId}/messages
   * {
   *   "messaging_product": "whatsapp",
   *   "to": "34612345678",
   *   "type": "text",
   *   "text": { "body": "Hola desde SegurITech!" }
   * }
   */
  async sendMessage(phoneNumber: string, message: string): Promise<void> {
    try {
      if (!this.phoneNumberId || !this.accessToken) {
        this.logger.warn(
          { phoneNumber },
          '⚠️  sendMessage: Credenciales META no configuradas. Simulando envío.',
        );
        return;
      }

      const payload: MetaTextPayload = {
        messaging_product: 'whatsapp',
        to: phoneNumber,
        type: 'text',
        text: {
          body: message,
        },
      };

      await this.sendToMeta(payload, phoneNumber);
    } catch (error) {
      this.logger.error(
        { error, phoneNumber, stack: (error as Error).stack },
        '❌ Error en sendMessage',
      );
      throw error;
    }
  }

  /**
   * Envía un mensaje con botones interactivos
   * Implementa la interfaz NotificationPort
   *
   * Nuestro formato (entrada):
   *   botResponse = {
   *     message: "¿Qué deseas hacer?",
   *     buttons: ["Opción A", "Opción B", "Opción C"]
   *   }
   *
   * Formato Meta (salida):
   *   POST /messages
   *   {
   *     "type": "interactive",
   *     "interactive": {
   *       "type": "button",
   *       "body": { "text": "¿Qué deseas hacer?" },
   *       "action": {
   *         "buttons": [
   *           { "type": "reply", "reply": { "id": "btn_0", "title": "Opción A" } },
   *           { "type": "reply", "reply": { "id": "btn_1", "title": "Opción B" } },
   *           ...
   *         ]
   *       }
   *     }
   *   }
   *
   * Limites de Meta:
   * - Máximo 3 botones
   * - Máximo 20 caracteres por botón
   */
  async sendButtons(
    phoneNumber: string,
    message: string,
    buttons: string[],
  ): Promise<void> {
    try {
      if (!this.phoneNumberId || !this.accessToken) {
        this.logger.warn(
          { phoneNumber, buttonCount: buttons.length },
          '⚠️  sendButtons: Credenciales META no configuradas. Simulando envío.',
        );
        return;
      }

      // Validar límites de Meta
      if (buttons.length > 3) {
        this.logger.warn(
          { buttonCount: buttons.length },
          '⚠️  Meta solo soporta máximo 3 botones. Truncando.',
        );
      }

      if (buttons.some((btn) => btn.length > 20)) {
        this.logger.warn(
          '⚠️  Algunos botones exceden 20 caracteres. Meta puede rechazarlos.',
        );
      }

      // Construir payload interactivo
      const buttonPayload = buttons.slice(0, 3).map((title, index) => ({
        type: 'reply' as const,
        reply: {
          id: `btn_${index}`,
          title: title.slice(0, 20), // Truncar a 20 caracteres
        },
      }));

      const payload: MetaButtonPayload = {
        messaging_product: 'whatsapp',
        to: phoneNumber,
        type: 'interactive',
        interactive: {
          type: 'button',
          body: {
            text: message,
          },
          action: {
            buttons: buttonPayload,
          },
        },
      };

      await this.sendToMeta(payload, phoneNumber);
    } catch (error) {
      this.logger.error(
        { error, phoneNumber, buttonCount: buttons.length, stack: (error as Error).stack },
        '❌ Error en sendButtons',
      );
      throw error;
    }
  }

  /**
   * Método auxiliar que ejecuta la petición HTTP a Meta
   * Centraliza lógica de retry, logging, y manejo de errores
   */
  private async sendToMeta(payload: MetaSendPayload, phoneNumber: string): Promise<void> {
    const url = `${this.metaApiUrl}/${this.phoneNumberId}/messages`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(
          {
            statusCode: response.status,
            statusText: response.statusText,
            errorBody: errorText.slice(0, 500),
            phoneNumber,
          },
          '❌ Meta API retornó error',
        );
        throw new Error(
          `Meta API error: ${response.status} ${response.statusText} - ${errorText}`,
        );
      }

      const responseData = await response.json();
      this.logger.info(
        { phoneNumber, messageId: (responseData as any).messages?.[0]?.id },
        '✅ Mensaje enviado a Meta exitosamente',
      );
    } catch (error) {
      if (error instanceof Error && error.message.includes('fetch')) {
        this.logger.error(
          { error: error.message, phoneNumber },
          '❌ Error de red al conectar con Meta API',
        );
      }
      throw error;
    }
  }

  // ========================================================================
  // 🔄 CICLO DE VIDA (implementa NotificationPort)
  // ========================================================================

  async initialize(): Promise<void> {
    this.logger.info(
      {
        phoneNumberId: this.phoneNumberId,
        hasAccessToken: !!this.accessToken,
      },
      'Inicializando MetaWhatsAppAdapter',
    );
    // Meta Cloud API no requiere conexión continua, solo credenciales
  }

  async disconnect(): Promise<void> {
    this.logger.info('Desconectando MetaWhatsAppAdapter');
    // Nada que desconectar en Cloud API
  }
}

