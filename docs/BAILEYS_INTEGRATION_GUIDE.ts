/**
 * EJEMPLO FUTURO: Integración completa con Baileys
 *
 * Este archivo muestra cómo conectar el proyecto a WhatsApp real usando Baileys
 * cuando la librería esté disponible en npm
 *
 * Instalación futura:
 * npm install @whiskeysockets/baileys
 *
 * O con yarn:
 * yarn add @whiskeysockets/baileys
 */

import pino from 'pino';
import { NotificationPort } from '@/domain/ports';

// Importaría Baileys cuando esté disponible
// import makeWASocket, { DisconnectReason, useMultiFileAuthState } from '@whiskeysockets/baileys';

/**
 * IMPLEMENTACIÓN COMPLETA DE BAILEYS (cuando esté listo)
 *
 * Este es el código que reemplazaría BaileysWhatsAppAdapter.ts
 */

/*
export class BaileysWhatsAppAdapter implements NotificationPort {
  private wa: ReturnType<typeof makeWASocket> | null = null;
  private logger: pino.Logger;
  private sessionName: string;
  private phoneNumber: string;

  constructor(logger: pino.Logger, sessionName: string, phoneNumber: string) {
    this.logger = logger;
    this.sessionName = sessionName;
    this.phoneNumber = phoneNumber;
  }

  async initialize(): Promise<void> {
    try {
      this.logger.info('🚀 Inicializando Baileys...');

      // 1. Obtener o crear estado de autenticación
      const { state, saveCreds } = await useMultiFileAuthState(
        `./sessions/${this.sessionName}`,
      );

      // 2. Crear instancia de WhatsApp
      this.wa = makeWASocket({
        auth: state,
        printQRInTerminal: true,
        logger: this.logger,
        connectTimeoutMs: 60000,
      });

      // 3. Guardar credenciales cuando cambien
      this.wa.ev.on('creds.update', saveCreds);

      // 4. Manejar conexión
      this.wa.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          this.logger.info('📱 Escanea el código QR con WhatsApp');
        }

        if (connection === 'open') {
          this.logger.info('✅ Conectado a WhatsApp');
          const user = this.wa!.user;
          this.logger.info(`Conectado como: ${user?.name || user?.id}`);
        }

        if (connection === 'close') {
          if (
            (lastDisconnect?.error as any)?.output?.statusCode !==
            DisconnectReason.loggedOut
          ) {
            await this.initialize(); // Reintentar
          } else {
            this.logger.info('Sesión cerrada');
          }
        }
      });

      // 5. Manejar mensajes entrantes
      this.wa.ev.on('messages.upsert', async (m) => {
        const message = m.messages[0];

        // Solo procesar mensajes normales (no notificaciones)
        if (message.key.fromMe || message.messageStubType) return;

        const from = message.key.remoteJid!;
        const content = message.message?.conversation || '';

        if (!content) return;

        this.logger.info(`📱 Mensaje de ${from}: ${content}`);

        // Aquí entraría el BotController
        // await botController.processMessage(from, content);
      });
    } catch (error) {
      this.logger.error('Error inicializando Baileys:', error);
      throw error;
    }
  }

  async sendMessage(phoneNumber: string, message: string): Promise<void> {
    try {
      if (!this.wa) {
        throw new Error('WhatsApp no inicializado');
      }

      const jid = phoneNumber.includes('@') ? phoneNumber : `${phoneNumber}@s.whatsapp.net`;

      await this.wa.sendMessage(jid, { text: message });

      this.logger.info(`✉️  Mensaje enviado a ${phoneNumber}`);
    } catch (error) {
      this.logger.error(`Error enviando mensaje a ${phoneNumber}:`, error);
      throw error;
    }
  }

  async sendButtons(
    phoneNumber: string,
    message: string,
    buttons: string[],
  ): Promise<void> {
    try {
      if (!this.wa) {
        throw new Error('WhatsApp no inicializado');
      }

      const jid = phoneNumber.includes('@') ? phoneNumber : `${phoneNumber}@s.whatsapp.net`;

      // Crear botones para WhatsApp
      const buttonMessages = buttons.map((btn, idx) => ({
        buttonId: `${idx}`,
        buttonText: { displayText: btn },
        type: 1 as any,
      }));

      await this.wa.sendMessage(jid, {
        text: message,
        footer: 'SegurITech Bot Pro',
        buttons: buttonMessages,
        headerType: 1,
      });

      this.logger.info(`✉️  Mensaje con botones enviado a ${phoneNumber}`);
    } catch (error) {
      this.logger.error(`Error enviando botones a ${phoneNumber}:`, error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      if (this.wa) {
        await this.wa.logout();
        this.logger.info('Desconectado de WhatsApp');
      }
    } catch (error) {
      this.logger.error('Error desconectando:', error);
    }
  }
}
*/

/**
 * FORMA DE INTEGRAR EN BOOTSTRAP.TS
 *
 * En lugar de ConsoleNotificationAdapter, usar Baileys:
 */

/*
// src/Bootstrap.ts
async run(): Promise<void> {
  // ... código anterior ...

  // En lugar de:
  // const notificationPort = new ConsoleNotificationAdapter();

  // Usar:
  const notificationPort = new BaileysWhatsAppAdapter(
    this.logger,
    config.whatsapp.sessionName,
    config.whatsapp.phoneNumber,
  );

  // Inicializar
  await notificationPort.initialize();

  // ... resto del código ...
}
*/

/**
 * ESTRUCTURA DE CARPETAS PARA BAILEYS
 *
 * El bot creará automáticamente:
 *
 * sessions/
 * └── seguritech-session/
 *     ├── creds.json          (credenciales encriptadas)
 *     ├── keys.json           (claves de sesión)
 *     └── pre-keys.json       (pre-claves)
 *
 * logs/
 * ├── out.log               (PM2)
 * └── err.log               (PM2)
 */

/**
 * CONFIGURACIÓN RECOMENDADA PARA PRODUCCIÓN
 *
 * 1. Usar base de datos para sesiones (MongoDB):
 *
 *    const sessionStore = new MongoStore({ url: DATABASE_URL });
 *    this.wa = makeWASocket({
 *      auth: { ...state, store: sessionStore }
 *    });
 *
 * 2. Usar Redis para caché:
 *
 *    const cache = new RedisStore({ url: REDIS_URL });
 *
 * 3. Manejar reconexión con exponential backoff:
 *
 *    let reconnectAttempts = 0;
 *    const maxAttempts = 5;
 *
 *    if (connection === 'close') {
 *      if (reconnectAttempts < maxAttempts) {
 *        const delay = Math.pow(2, reconnectAttempts) * 1000;
 *        setTimeout(() => this.initialize(), delay);
 *        reconnectAttempts++;
 *      }
 *    }
 *
 * 4. Validar números de teléfono:
 *
 *    import { parsePhoneNumber } from 'libphonenumber-js';
 *    const parsed = parsePhoneNumber(phoneNumber, 'ES');
 *    if (!parsed?.isValid()) throw new Error('Número inválido');
 *
 * 5. Rate limiting:
 *
 *    import rateLimit from 'express-rate-limit';
 *    const limiter = rateLimit({
 *      windowMs: 60 * 1000,
 *      max: 100
 *    });
 */

/**
 * CARACTERÍSTICAS AVANZADAS CON BAILEYS
 *
 * // Escuchar cambios de estado de contacto
 * this.wa.ev.on('contacts.upsert', (contacts) => {
 *   contacts.forEach(contact => {
 *     console.log(`Contacto: ${contact.name || contact.id}`);
 *   });
 * });
 *
 * // Escuchar cambios en chats
 * this.wa.ev.on('chats.update', (chats) => {
 *   chats.forEach(chat => {
 *     console.log(`Chat: ${chat.name || chat.id}`);
 *   });
 * });
 *
 * // Escuchar cambios en grupos
 * this.wa.ev.on('groups.update', (groups) => {
 *   groups.forEach(group => {
 *     console.log(`Grupo: ${group.subject}`);
 *   });
 * });
 *
 * // Escuchar actualización de presencia (escribiendo, en línea)
 * this.wa.ev.on('presence.update', (presences) => {
 *   presences.forEach(p => {
 *     console.log(`${p.id}: ${p.type}`); // typing, available, unavailable
 *   });
 * });
 *
 * // Reacciones a mensajes
 * this.wa.ev.on('message-receipt.update', (updates) => {
 *   updates.forEach(update => {
 *     console.log(`Recibido: ${update.receipt}`); // read, delivered
 *   });
 * });
 */

/**
 * MANEJO DE ERRORES COMÚN
 *
 * Error: "Invalid credentials"
 * → Eliminar carpeta sessions/ y reintentar
 *
 * Error: "Socket closed"
 * → Reconectarse automáticamente (ya implementado)
 *
 * Error: "Rate limited"
 * → Esperar más tiempo entre mensajes
 *
 * Error: "Invalid JID"
 * → Validar formato: +34123456789 o 34123456789@s.whatsapp.net
 */

export {};
