import pino from 'pino';
import { config, validateConfig } from '@/config/env';
import { createLogger } from '@/config/logger';
import { ApplicationContainer } from '@/app/ApplicationContainer';
import { SupabaseUserRepository } from '@/infrastructure/repositories/SupabaseUserRepository';
import { ConsoleNotificationAdapter } from '@/infrastructure/adapters/ConsoleNotificationAdapter';
import { MetaWhatsAppAdapter } from '@/infrastructure/adapters/MetaWhatsAppAdapter';
import { ReadlineAdapter } from '@/infrastructure/adapters/ReadlineAdapter';
import { ExpressServer } from '@/infrastructure/server/ExpressServer';
import { getSupabaseClient } from '@/infrastructure/services/SupabaseClientFactory';
import { SupabaseTenantConfigService } from '@/infrastructure/services/SupabaseTenantConfigService';
import { MessageLogService } from '@/infrastructure/services/MessageLogService';
import { NotificationPort } from '@/domain/ports';

/**
 * Bootstrap — arma todo el grafo de objetos.
 *
 * Sprint 2:
 * - Persistencia: Supabase (vía SupabaseUserRepository).
 * - Notificación: MetaWhatsAppAdapter si hay credenciales, sino Console (dev).
 * - Config por tenant: SupabaseTenantConfigService con caché de 5 min.
 * - Idempotencia de webhook: MessageLogService chequea meta_message_id.
 */
export class Bootstrap {
  private logger!: pino.Logger;
  private container: ApplicationContainer | null = null;
  private expressServer: ExpressServer | null = null;
  private readlineAdapter: ReadlineAdapter | null = null;

  async run(): Promise<void> {
    try {
      validateConfig();
      this.logger = createLogger();
      this.logger.info('🚀 SegurITech Bot Pro');
      this.logger.info(`Entorno: ${config.environment}\n`);
      this.logger.info('⚙️  Inicializando...');

      // === Capa de infraestructura ===
      const supabase = getSupabaseClient();
      const userRepository = new SupabaseUserRepository(supabase, this.logger);
      const tenantConfigService = new SupabaseTenantConfigService(supabase, this.logger);
      const messageLogService = new MessageLogService(supabase, this.logger);

      // === Notification port: Meta si hay credenciales, sino Console ===
      let notificationPort: NotificationPort;
      let metaAdapter: MetaWhatsAppAdapter | undefined;

      if (config.meta.phoneNumberId && config.meta.accessToken) {
        metaAdapter = new MetaWhatsAppAdapter(
          this.logger,
          config.meta.phoneNumberId,
          config.meta.accessToken,
          config.meta.apiUrl,
        );
        notificationPort = metaAdapter;
        this.logger.info('✅ MetaWhatsAppAdapter activo (envío real a WhatsApp)');
      } else {
        this.logger.warn(
          '⚠️  META_PHONE_NUMBER_ID/META_ACCESS_TOKEN no configurados. ' +
          'Usando ConsoleNotificationAdapter (dev mode).',
        );
        notificationPort = new ConsoleNotificationAdapter();
      }

      // === Capa de aplicación ===
      this.container = new ApplicationContainer(
        userRepository,
        notificationPort,
        tenantConfigService,
        this.logger,
      );
      this.logger.info('✅ Contenedor DI listo');

      // === Servidor Express con webhook ===
      this.expressServer = new ExpressServer(
        this.logger,
        metaAdapter,
        messageLogService,
      );
      const botController = this.container.getBotController();
      this.expressServer.setupRoutes(
        async (tenantId, phoneNumber, text, metaMessageId) =>
          botController.processMessage(tenantId, phoneNumber, text, metaMessageId),
      );
      await this.expressServer.start();

      // === CLI interactiva (útil en dev) ===
      this.readlineAdapter = new ReadlineAdapter(this.logger);
      this.logger.info('✅ Bot iniciado\n');
      await this.readlineAdapter.start(
        async (tenantId, phoneNumber, text) =>
          botController.processMessage(tenantId, phoneNumber, text),
      );
    } catch (error) {
      if (this.logger) {
        this.logger.error({ err: error }, '❌ Error en bootstrap');
      } else {
        console.error('❌ Error en bootstrap:', error);
      }
      process.exit(1);
    }
  }

  getContainer(): ApplicationContainer {
    if (!this.container) {
      throw new Error('Container no inicializado');
    }
    return this.container;
  }
}