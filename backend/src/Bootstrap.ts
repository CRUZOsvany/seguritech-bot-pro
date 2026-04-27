import pino from 'pino';
import { config, validateConfig } from '@/config/env';
import { createLogger } from '@/config/logger';
import { ApplicationContainer } from '@/app/ApplicationContainer';
import { SqliteUserRepository } from '@/infrastructure/repositories/SqliteUserRepository';
import { ConsoleNotificationAdapter } from '@/infrastructure/adapters/ConsoleNotificationAdapter';
import { ReadlineAdapter } from '@/infrastructure/adapters/ReadlineAdapter';
import { ExpressServer } from '@/infrastructure/server/ExpressServer';

/**
 * Bootstrap - API Oficial de WhatsApp (Sin Baileys)
 * - Validar configuración
 * - Crear logger
 * - Iniciar Express Server (webhook)
 * - Iniciar terminal interactiva (pruebas)
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
      this.logger.info('🚀 SegurITech Bot Pro (API Oficial)');
      this.logger.info(`Entorno: ${config.environment}\n`);

      this.logger.info('⚙️  Inicializando...');

      // Inicializar repositorio SQLite
      const userRepository = new SqliteUserRepository();
      await userRepository.initialize();

      const notificationPort = new ConsoleNotificationAdapter();

      this.container = new ApplicationContainer(
        userRepository,
        notificationPort,
        this.logger,
      );
      this.logger.info('✅ Contenedor DI creado');

      // Iniciar Express con webhook
      this.expressServer = new ExpressServer(this.logger);
      const botController = this.container.getBotController();
      this.expressServer.setupRoutes(
        async (tenantId: string, phoneNumber: string, text: string): Promise<string | null> =>
          await botController.processMessage(tenantId, phoneNumber, text)
      );
      await this.expressServer.start();

      // Iniciar terminal interactiva
      this.readlineAdapter = new ReadlineAdapter(this.logger);
      this.logger.info('✅ Bot iniciado\n');
      await this.readlineAdapter.start(
        async (tenantId: string, phoneNumber: string, text: string): Promise<string | null> =>
          await botController.processMessage(tenantId, phoneNumber, text)
      );
    } catch (error) {
      if (this.logger) {
        this.logger.error('❌ Error en bootstrap:', error);
      } else {
        console.error('❌ Error:', error);
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
