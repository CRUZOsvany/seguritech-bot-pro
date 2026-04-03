import pino from 'pino';
import { config, validateConfig } from '@/config/env';
import { createLogger } from '@/config/logger';
import { ApplicationContainer } from '@/app/ApplicationContainer';
import { InMemoryUserRepository } from '@/infrastructure/repositories/InMemoryUserRepository';
import { ConsoleNotificationAdapter } from '@/infrastructure/adapters/ConsoleNotificationAdapter';

/**
 * Bootstrap de la aplicación
 * Se encarga de:
 * - Validar configuración
 * - Crear logger
 * - Instanciar adaptadores
 * - Crear contenedor de DI
 * - Inicializar el bot
 */
export class Bootstrap {
  private logger!: pino.Logger;
  private container: ApplicationContainer | null = null;

  async run(): Promise<void> {
    try {
      // 1. Validar configuración
      validateConfig();

      // 2. Crear logger
      this.logger = createLogger();
      this.logger.info('🚀 SegurITech Bot Pro iniciando...');
      this.logger.info(`Entorno: ${config.environment}`);

      // 3. Crear adaptadores
      this.logger.info('⚙️  Inicializando adaptadores...');
      const userRepository = new InMemoryUserRepository();
      const notificationPort = new ConsoleNotificationAdapter();

      // 4. Crear contenedor DI
      this.container = new ApplicationContainer(
        userRepository,
        notificationPort,
        this.logger,
      );
      this.logger.info('✅ Contenedor de DI creado');

      // 5. Inicializar bot
      await this.initializeBot();

      this.logger.info('✅ Bot iniciado correctamente');
    } catch (error) {
      if (this.logger) {
        this.logger.error('❌ Error en el bootstrap:', error);
      } else {
        console.error('❌ Error en el bootstrap:', error);
      }
      process.exit(1);
    }
  }

  private async initializeBot(): Promise<void> {
    if (!this.container) {
      throw new Error('Container no inicializado');
    }

    const botController = this.container.getBotController();

    // Simular mensajes de prueba
    this.logger.info('📨 Simulando conversación de prueba...\n');

    try {
      // Test 1: Primer saludo
      await botController.processMessage('+34123456789', 'Hola');
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Test 2: Seleccionar opción de menú
      await botController.processMessage('+34123456789', '1');
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Test 3: Hacer pedido
      await botController.processMessage('+34987654321', 'Hola');
      await new Promise((resolve) => setTimeout(resolve, 500));
      await botController.processMessage('+34987654321', '3');
      await new Promise((resolve) => setTimeout(resolve, 500));
      await botController.processMessage('+34987654321', '2');
    } catch (error) {
      this.logger.error('Error en test de conversación:', error);
    }
  }

  getContainer(): ApplicationContainer {
    if (!this.container) {
      throw new Error('Container no inicializado');
    }
    return this.container;
  }
}
