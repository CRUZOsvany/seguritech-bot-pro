import type { NotificationPort } from '@/domain/ports';
import type { MessengerPort, OutboundMessage } from './OutboundMessage';

/**
 * MessengerPort sobre el NotificationPort de siempre.
 *
 * Traduce cada mensaje a la MISMA llamada, con los MISMOS argumentos, que
 * hacía `BotController.dispatchOutputs` antes de la Fase 1. Así el motor
 * nuevo no cambia nada de lo que llega a MetaWhatsAppAdapter (ni a los mocks
 * de los tests existentes).
 */
export class NotificationPortMessenger implements MessengerPort {
  constructor(private readonly notificationPort: NotificationPort) {}

  async send(tenantId: string, message: OutboundMessage): Promise<void> {
    const to = message.to;
    const c = message.content;
    const n = this.notificationPort;

    switch (c.kind) {
    case 'text':
      return n.sendMessage(tenantId, to, c.text);

    case 'buttons':
      return n.sendButtons(
        tenantId,
        to,
        c.text,
        c.buttons.map((b) => b.title),
      );

    case 'list':
      return n.sendList(
        tenantId,
        to,
        c.text,
        c.buttonLabel,
        c.sections.map((section) => ({
          title: section.title,
          rows: section.items.map((item) => ({
            id: item.id,
            title: item.title,
            ...(item.description ? { description: item.description } : {}),
          })),
        })),
      );

    case 'image':
      return n.sendImage(tenantId, to, c.url, c.caption);

    case 'location':
      return n.sendLocation(tenantId, to, c.latitude, c.longitude, c.name, c.address);

    case 'document':
      return n.sendDocument(tenantId, to, c.url, c.filename, c.caption);

    case 'cta_url':
      return n.sendCtaUrl(tenantId, to, c.body, c.button, {
        ...(c.header ? { header: c.header } : {}),
        ...(c.footer ? { footer: c.footer } : {}),
      });

    case 'location_request':
      return n.sendLocationRequest(tenantId, to, c.body);

    case 'media_carousel':
      return n.sendMediaCarousel(tenantId, to, c.body, c.cards);

    case 'reaction':
      return n.sendReaction(tenantId, to, c.messageId, c.emoji);

    case 'call_permission_request':
      return n.sendCallPermissionRequest(tenantId, to, c.body, c.footer);

    case 'whatsapp_flow':
      return n.sendWhatsappFlow(tenantId, to, c.body, c.flow_id_meta, c.flow_cta, {
        header: c.header,
        footer: c.footer,
        mode: c.mode,
        flow_action: c.flow_action,
        flow_action_payload: c.flow_action_payload,
      });
    }
  }
}
