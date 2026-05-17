import { NotificationPort } from '@/domain/ports';

/**
 * Adaptador de consola para NotificationPort.
 * Fallback en dev cuando no hay credenciales Meta para el tenant.
 * Imprime cada envío con un prefijo visual claro.
 */
export class ConsoleNotificationAdapter implements NotificationPort {
  async sendMessage(
    tenantId: string,
    phoneNumber: string,
    message: string,
  ): Promise<void> {
    console.log(`\n📱 [${tenantId} -> ${phoneNumber}]:\n${message}\n`);
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
    const lines: string[] = [
      `\n📋 [${tenantId} -> ${phoneNumber}] LIST:`,
      bodyText,
      `[Botón: "${buttonLabel}"]`,
      '',
    ];
    for (const section of sections) {
      lines.push(`▶ ${section.title}`);
      for (const row of section.rows) {
        const desc = row.description ? ` — ${row.description}` : '';
        lines.push(`   • ${row.title}${desc}`);
      }
    }
    console.log(lines.join('\n') + '\n');
  }

  async sendLocation(
    tenantId: string,
    phoneNumber: string,
    latitude: number,
    longitude: number,
    name?: string,
    address?: string,
  ): Promise<void> {
    console.log(
      `\n📍 [${tenantId} -> ${phoneNumber}] LOCATION:` +
        `\n  lat=${latitude}, lng=${longitude}` +
        (name ? `\n  name=${name}` : '') +
        (address ? `\n  address=${address}` : '') +
        '\n',
    );
  }

  async sendDocument(
    tenantId: string,
    phoneNumber: string,
    documentUrl: string,
    filename: string,
    caption?: string,
  ): Promise<void> {
    console.log(
      `\n📄 [${tenantId} -> ${phoneNumber}] DOCUMENT:` +
        `\n  filename=${filename}` +
        `\n  url=${documentUrl}` +
        (caption ? `\n  caption=${caption}` : '') +
        '\n',
    );
  }
}
