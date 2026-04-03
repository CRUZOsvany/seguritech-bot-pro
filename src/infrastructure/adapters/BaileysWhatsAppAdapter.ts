import { NotificationPort } from '@/domain/ports';
import pino from 'pino';

/**
 * Adaptador de WhatsApp usando Baileys
 * Implementación futura que se conectará a Baileys
 *
 * Características:
 * - Enviar mensajes simples
 * - Enviar mensajes con botones
 * - Manejar reconexiones
 * - Almacenar sesión
 */
export class BaileysWhatsAppAdapter implements NotificationPort {
  private logger: pino.Logger;

  // TODO: Agregar propiedades de Baileys cuando esté disponible
  // private wa: WhatsAppWeb;
  // private qrCode: string = '';

  constructor(logger: pino.Logger) {
    this.logger = logger;
  }

  async sendMessage(phoneNumber: string, message: string): Promise<void> {
    try {
      this.logger.info(`Enviando mensaje a ${phoneNumber}`);
      // TODO: Implementar envío real con Baileys
      // const jid = `${phoneNumber}@s.whatsapp.net`;
      // await this.wa.sendMessage(jid, { text: message });
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
      this.logger.info(`Enviando mensaje con botones a ${phoneNumber}`);
      // TODO: Implementar envío de botones con Baileys
      // const jid = `${phoneNumber}@s.whatsapp.net`;
      // await this.wa.sendMessage(jid, {
      //   text: message,
      //   buttons: buttons.map((btn) => ({ buttonId: btn, buttonText: { displayText: btn } })),
      // });
    } catch (error) {
      this.logger.error(`Error enviando botones a ${phoneNumber}:`, error);
      throw error;
    }
  }

  // Métodos de ciclo de vida
  async initialize(): Promise<void> {
    this.logger.info('Inicializando adaptador de WhatsApp (Baileys)');
    // TODO: Conectar a Baileys, manejar QR, etc.
  }

  async disconnect(): Promise<void> {
    this.logger.info('Desconectando adaptador de WhatsApp');
    // TODO: Desconectar de Baileys
  }
}
