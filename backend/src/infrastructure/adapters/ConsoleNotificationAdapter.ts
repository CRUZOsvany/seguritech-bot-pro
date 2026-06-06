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

  // ----- WhatsApp v23.0 (Prompt 3) — stubs de consola -----

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
    console.log(
      `\n🔗 [${tenantId} -> ${phoneNumber}] CTA_URL:` +
        (opts?.header ? `\n  header=${JSON.stringify(opts.header)}` : '') +
        `\n  ${body}` +
        `\n  [${button.display_text}] → ${button.url}` +
        (opts?.footer ? `\n  footer=${opts.footer}` : '') +
        '\n',
    );
  }

  async sendLocationRequest(
    tenantId: string,
    phoneNumber: string,
    body: string,
  ): Promise<void> {
    console.log(
      `\n📍 [${tenantId} -> ${phoneNumber}] LOCATION_REQUEST:\n  ${body}\n  [Enviar ubicación]\n`,
    );
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
    const lines: string[] = [`\n🖼️  [${tenantId} -> ${phoneNumber}] MEDIA_CAROUSEL:`, body, ''];
    cards.forEach((card, i) => {
      lines.push(`▶ Card ${i + 1} (${card.header.type}: ${card.header.link})`);
      lines.push(`   ${card.body}`);
      for (const btn of card.buttons) {
        lines.push(
          btn.type === 'quick_reply'
            ? `   ▸ ${btn.title}`
            : `   ▸ ${btn.display_text} → ${btn.url}`,
        );
      }
    });
    console.log(lines.join('\n') + '\n');
  }

  async sendReaction(
    tenantId: string,
    phoneNumber: string,
    messageId: string,
    emoji: string,
  ): Promise<void> {
    console.log(
      `\n${emoji || '✖'} [${tenantId} -> ${phoneNumber}] REACTION on ${messageId}: "${emoji}"\n`,
    );
  }

  async sendCallPermissionRequest(
    tenantId: string,
    phoneNumber: string,
    body: string,
    footer?: string,
  ): Promise<void> {
    console.log(
      `\n📞 [${tenantId} -> ${phoneNumber}] CALL_PERMISSION_REQUEST:\n  ${body}` +
        (footer ? `\n  footer=${footer}` : '') +
        '\n',
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
    console.log(
      `\n🧩 [${tenantId} -> ${phoneNumber}] WHATSAPP_FLOW:` +
        (opts?.header ? `\n  header=${opts.header}` : '') +
        `\n  ${body}` +
        `\n  flow_id=${flow_id_meta} cta=[${flow_cta}] mode=${opts?.mode ?? 'published'}` +
        (opts?.footer ? `\n  footer=${opts.footer}` : '') +
        '\n',
    );
  }
}
