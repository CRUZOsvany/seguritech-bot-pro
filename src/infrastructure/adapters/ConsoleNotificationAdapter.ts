import { NotificationPort } from '@/domain/ports';

/**
 * Adaptador console de NotificationPort
 * Implementación de prueba que imprime en consola
 *
 * En producción, esto se reemplazaría por:
 * - BaileysWhatsAppAdapter (para WhatsApp real)
 * - EmailNotificationAdapter (para emails)
 * - SMSNotificationAdapter (para SMS)
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
