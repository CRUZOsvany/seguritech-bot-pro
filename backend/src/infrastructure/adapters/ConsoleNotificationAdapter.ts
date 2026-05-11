import { NotificationPort } from '@/domain/ports';

/**
 * Adaptador console de NotificationPort.
 * Implementación de fallback que solo imprime en consola.
 *
 * Se usa en dev cuando faltan credenciales de Meta Cloud API.
 * En producción, Bootstrap inyecta MetaWhatsAppAdapter en su lugar.
 */
export class ConsoleNotificationAdapter implements NotificationPort {
  async sendMessage(phoneNumber: string, message: string): Promise<void> {
    console.log(`\n📱 [WhatsApp -> ${phoneNumber}]:\n${message}\n`);
  }

  async sendButtons(
    phoneNumber: string,
    message: string,
    buttons: string[],
  ): Promise<void> {
    console.log(
      `\n📱 [WhatsApp -> ${phoneNumber}]:\n${message}\n\nOpciones:\n${buttons.map((b) => `  ▸ ${b}`).join('\n')}\n`,
    );
  }
}