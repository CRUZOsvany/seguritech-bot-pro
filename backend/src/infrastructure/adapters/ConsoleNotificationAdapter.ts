import { NotificationPort } from '@/domain/ports';

/**
 * Adaptador de consola para NotificationPort.
 * Fallback en dev cuando no hay credenciales Meta para el tenant.
 * En producción, Bootstrap inyecta MetaWhatsAppAdapter.
 */
export class ConsoleNotificationAdapter implements NotificationPort {
  async sendMessage(
    tenantId: string,
    phoneNumber: string,
    message: string,
  ): Promise<void> {
    console.log(
      `\n📱 [${tenantId} -> ${phoneNumber}]:\n${message}\n`,
    );
  }

  async sendButtons(
    tenantId: string,
    phoneNumber: string,
    message: string,
    buttons: string[],
  ): Promise<void> {
    console.log(
      `\n📱 [${tenantId} -> ${phoneNumber}]:\n${message}\n\nOpciones:\n${buttons
        .map((b) => `  ▸ ${b}`)
        .join('\n')}\n`,
    );
  }

  async sendImage(
    tenantId: string,
    phoneNumber: string,
    imageUrl: string,
    caption?: string,
  ): Promise<void> {
    console.log(
      `\n📷 [${tenantId} -> ${phoneNumber}] IMAGE: ${imageUrl}${
        caption ? `\nCaption: ${caption}` : ''
      }\n`,
    );
  }
}