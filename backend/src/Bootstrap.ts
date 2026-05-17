import pino from 'pino';
import { config, validateConfig } from '@/config/env';
import { createLogger } from '@/config/logger';
import { ApplicationContainer } from '@/app/ApplicationContainer';
import { SupabaseUserRepository } from '@/infrastructure/repositories/SupabaseUserRepository';
import { SupabaseBotFlowRepository } from '@/infrastructure/repositories/SupabaseBotFlowRepository';
import { SupabaseTenantRepository } from '@/infrastructure/repositories/SupabaseTenantRepository';
import { SupabaseMetaCredentialsRepository } from '@/infrastructure/repositories/SupabaseMetaCredentialsRepository';
import { createAdminRouter } from '@/infrastructure/server/AdminRouter';
import { ConsoleNotificationAdapter } from '@/infrastructure/adapters/ConsoleNotificationAdapter';
import { MetaWhatsAppAdapter } from '@/infrastructure/adapters/MetaWhatsAppAdapter';
import { ReadlineAdapter } from '@/infrastructure/adapters/ReadlineAdapter';
import { ExpressServer } from '@/infrastructure/server/ExpressServer';
import { getSupabaseClient } from '@/infrastructure/services/SupabaseClientFactory';
import { SupabaseTenantConfigService } from '@/infrastructure/services/SupabaseTenantConfigService';
import { MessageLogService } from '@/infrastructure/services/MessageLogService';
import { TokenCrypto } from '@/infrastructure/services/TokenCrypto';
import { NotificationPort } from '@/domain/ports';

/**
 * Bootstrap — Sprint C (multi-tenant Meta).
 *
 * Cambios clave:
 *   - Quita la lectura de las vars Meta de phone/token a nivel de proceso.
 *   - Las credenciales Meta viven en la tabla tenant_meta_credentials.
 *   - El MetaWhatsAppAdapter las resuelve por tenantId en cada envío.
 *   - Si NO hay META_TOKEN_ENCRYPTION_KEY, NO se puede usar Meta; cae a
 *     ConsoleNotificationAdapter para que el dev pueda seguir trabajando
 *     contra el ReadlineAdapter sin tocar Meta.
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

      const supabase = getSupabaseClient();
      const userRepository = new SupabaseUserRepository(supabase, this.logger);
      const tenantConfigService = new SupabaseTenantConfigService(supabase, this.logger);
      const messageLogService = new MessageLogService(supabase, this.logger);
      const botFlowRepository = new SupabaseBotFlowRepository(supabase, this.logger);
      const tenantRepository = new SupabaseTenantRepository(supabase, this.logger);

      // === Notification port: Meta (si hay clave de cifrado) o Console ===
      let notificationPort: NotificationPort;
      let metaAdapter: MetaWhatsAppAdapter | undefined;

      if (config.meta.tokenEncryptionKey) {
        const crypto = new TokenCrypto(config.meta.tokenEncryptionKey);
        const credsRepo = new SupabaseMetaCredentialsRepository(
          supabase,
          crypto,
          this.logger,
        );
        metaAdapter = new MetaWhatsAppAdapter(
          this.logger,
          credsRepo,
          config.meta.apiUrl,
        );
        notificationPort = metaAdapter;
        this.logger.info('✅ MetaWhatsAppAdapter activo (multi-tenant)');
      } else {
        this.logger.warn(
          '⚠️  META_TOKEN_ENCRYPTION_KEY no configurada. ' +
          'Usando ConsoleNotificationAdapter (dev mode).',
        );
        notificationPort = new ConsoleNotificationAdapter();
      }

      this.container = new ApplicationContainer(
        userRepository,
        notificationPort,
        tenantConfigService,
        botFlowRepository,
        tenantRepository,
        supabase,
        this.logger,
      );
      this.logger.info('✅ Contenedor DI listo');

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

      const adminRouter = createAdminRouter({
        assignMoldeUseCase: this.container.getAssignMoldeUseCase(),
        setTenantStatusUseCase: this.container.getSetTenantStatusUseCase(),
        simulateMessageUseCase: this.container.getSimulateMessageUseCase(),
        tenantRepository,
        botFlowRepository,
        logger: this.logger,
      });
      this.expressServer.setupAdminRoutes(adminRouter);
      this.logger.info('✅ API Admin montada en /api/admin');

      await this.expressServer.start();

      // CLI multi-tenant para desarrollo
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