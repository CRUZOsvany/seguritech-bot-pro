import makeWASocket, {
  BaileysEventMap,
  DisconnectReason,
  isJidBroadcast,
  isJidGroup,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
  WAMessage,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import qrcodeTerminal from 'qrcode-terminal';
import * as path from 'path';
import { config } from '@/config/env';
import logger from '@/config/logger';
import { DefaultMessageHandler } from '@/handlers/messageHandler';

/**
 * Bot principal de WhatsApp utilizando Baileys
 * Maneja conexión, QR, reconexión automática y procesamiento de mensajes
 */
export class WhatsAppBot {
  private socket: ReturnType<typeof makeWASocket> | null = null;
  private qrGenerated: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 10;
  private reconnectDelay: number = 5000;
  private messageHandler: DefaultMessageHandler;
  private isShuttingDown: boolean = false;

  constructor() {
    this.messageHandler = new DefaultMessageHandler();
  }

  /**
   * Inicia el bot y establece conexión con WhatsApp
   */
  async start(): Promise<void> {
    try {
      logger.info('🚀 Iniciando SegurITech Bot...');
      await this.connect();
    } catch (error) {
      logger.error({ error }, '❌ Error fatal al iniciar el bot');
      process.exit(1);
    }
  }

  /**
   * Conecta con WhatsApp y configura listeners
   */
  private async connect(): Promise<void> {
    try {
      const { state, saveCreds } = await useMultiFileAuthState(
        path.join(process.cwd(), '.bot_auth'),
      );

      this.socket = makeWASocket({
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, logger),
        },
        logger: pino({ level: 'silent' }),
        browser: ['SegurITech', 'Chrome', '120.0.0.0'],
        syncFullHistory: false,
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 0,
        keepAliveIntervalMs: 30000,
      });

      // Event: QR generado (para login)
      this.socket.ev.on('connection.update', this.handleConnectionUpdate.bind(this));

      // Event: Credenciales actualizadas
      this.socket.ev.on('creds.update', saveCreds);

      // Event: Mensajes recibidos
      this.socket.ev.on('messages.upsert', this.handleIncomingMessage.bind(this));

      // Event: Cambios de conexión
      this.socket.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'connecting') {
          logger.info('⏳ Conectando...');
        } else if (connection === 'open') {
          this.qrGenerated = false;
          this.reconnectAttempts = 0;
          logger.info(
            `✅ Conectado exitosamente como ${this.socket?.user?.name}`,
          );
          logger.info(`📱 Número: ${this.socket?.user?.id}`);
        } else if (connection === 'close') {
          this.handleDisconnection(lastDisconnect);
        }
      });

      logger.info('📡 Listeners configurados correctamente');
    } catch (error) {
      logger.error({ error }, 'Error durante la conexión inicial');
      throw error;
    }
  }

  /**
   * Maneja updates de conexión (incluyendo QR)
   */
  private async handleConnectionUpdate(
    update: Partial<BaileysEventMap['connection.update']>,
  ): Promise<void> {
    const { qr, isOnline } = update;

    if (qr && !this.qrGenerated) {
      this.qrGenerated = true;
      logger.info('📲 QR Code generado. Escanea con tu teléfono:');
      console.log('\n');
      qrcodeTerminal.generate(qr, { small: true }, (code: string) => {
        console.log(code);
      });
    }

    if (isOnline === true) {
      logger.info('✅ En línea');
    } else if (isOnline === false) {
      logger.warn('⚠️ Sin conexión');
    }
  }

  /**
   * Maneja la desconexión y reconexión automática
   */
  private handleDisconnection(lastDisconnect?: {
    error?: any;
    date: Date;
  }): void {
    const statusCode = (lastDisconnect?.error as any)?.statusCode;

    if (
      statusCode === DisconnectReason.badSession ||
      statusCode === DisconnectReason.loggedOut ||
      statusCode === DisconnectReason.restartRequired
    ) {
      logger.error('❌ Sesión inválida o expirada. Limpiando...');

      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        logger.info(
          `🔄 Reconectando (intento ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`,
        );
        setTimeout(() => {
          if (this.socket) {
            this.socket.end(new Error('Reconectando'));
          }
          this.connect();
        }, this.reconnectDelay);
      } else {
        logger.fatal('❌ Máximo de intentos de reconexión alcanzado');
        process.exit(1);
      }
    } else if (statusCode !== DisconnectReason.connectionClosed) {
      logger.info('🔄 Reconectando...');
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        setTimeout(() => {
          if (this.socket) {
            this.socket.end(new Error('Reconectando'));
          }
          this.connect();
        }, this.reconnectDelay);
      }
    }
  }

  /**
   * Procesa mensajes entrantes
   */
  private async handleIncomingMessage(
    data: { messages: WAMessage[]; type: string; requestId?: string },
  ): Promise<void> {
    const { messages } = data;

    for (const message of messages) {
      try {
        // Ignorar mensajes del bot
        if (message.key.fromMe) {
          continue;
        }

        // Ignorar broadcast y grupos (por ahora)
        if (isJidGroup(message.key.remoteJid!) || isJidBroadcast(message.key.remoteJid!)) {
          logger.debug('Mensaje de grupo ignorado');
          continue;
        }

        const senderJid = message.key.remoteJid!;

        logger.info(
          { jid: senderJid, text: message.message?.conversation },
          '📩 Mensaje recibido',
        );

        // Obtener respuesta del handler
        const response = await this.messageHandler.handle(message, senderJid);

        if (response) {
          await this.sendMessage(senderJid, response);
        }
      } catch (error) {
        logger.error({ error, message }, 'Error procesando mensaje');
      }
    }
  }

  /**
   * Envía un mensaje de texto
   */
  async sendMessage(jid: string, text: string): Promise<void> {
    try {
      if (!this.socket) {
        throw new Error('Socket no disponible');
      }

      await this.socket.sendMessage(jid, { text });
      logger.debug({ jid, text }, '✉️ Mensaje enviado');
    } catch (error) {
      logger.error({ error, jid }, 'Error enviando mensaje');
    }
  }

  /**
   * Obtiene el estado actual del bot
   */
  private getStatus(): {
    isConnected: boolean;
    user: { id?: string; name?: string } | null;
    phoneNumber: string;
  } {
    return {
      isConnected: !!this.socket?.user,
      user: this.socket?.user || null,
      phoneNumber: config.whatsapp.phoneNumber,
    };
  }

  /**
   * Cierra la conexión gracefully
   */
  async shutdown(): Promise<void> {
    if (this.isShuttingDown) return;

    this.isShuttingDown = true;
    logger.info('🛑 Cerrando conexión...');

    try {
      if (this.socket) {
        await this.socket.end(new Error('Shutting down'));
      }
      logger.info('✅ Conexión cerrada correctamente');
    } catch (error) {
      logger.error({ error }, 'Error cerrando conexión');
    }

    process.exit(0);
  }
}

// Crear instancia global del bot
export const bot = new WhatsAppBot();

// Gracias handlers para cierre graceful
process.on('SIGINT', () => bot.shutdown());
process.on('SIGTERM', () => bot.shutdown());

