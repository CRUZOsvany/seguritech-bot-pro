import pino from 'pino';
import { BotController } from './controllers/BotController';
import { UserRepository, NotificationPort } from '@/domain/ports';
import { MetaWhatsAppAdapter } from '@/infrastructure/adapters/MetaWhatsAppAdapter';
import { config } from '@/config/env';

/**
 * Contenedor de inyección de dependencias
 * Gestiona la creación e inyección de todas las dependencias
 *
 * Ventajas:
 * - Centraliza la configuración
 * - Facilita testing (mock de dependencias)
 * - Desacopla clases
 * - Fácil de mantener
 */
export class ApplicationContainer {
  private botController: BotController;
  private metaWhatsAppAdapter: MetaWhatsAppAdapter;

  constructor(
    private userRepository: UserRepository,
    private notificationPort: NotificationPort,
    private logger: pino.Logger,
  ) {
    // Inicializar adaptador Meta para traducir webhooks de Meta Cloud API
    this.metaWhatsAppAdapter = new MetaWhatsAppAdapter(
      logger,
      config.meta.phoneNumberId,
      config.meta.accessToken,
      config.meta.apiUrl,
    );

    this.botController = new BotController(
      userRepository,
      notificationPort,
      logger,
    );
  }

  getBotController(): BotController {
    return this.botController;
  }

  /**
   * Obtener el adaptador Meta para procesar webhooks y enviar mensajes
   * Uso típico:
   *   const adapter = container.getMetaWhatsAppAdapter();
   *   const parsed = adapter.parseIncomingMessage(req.body);
   */
  getMetaWhatsAppAdapter(): MetaWhatsAppAdapter {
    return this.metaWhatsAppAdapter;
  }
}
