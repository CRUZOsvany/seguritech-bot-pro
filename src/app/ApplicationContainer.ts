import pino from 'pino';
import { BotController } from './controllers/BotController';
import { UserRepository, NotificationPort } from '@/domain/ports';

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

  constructor(
    private userRepository: UserRepository,
    private notificationPort: NotificationPort,
    private logger: pino.Logger,
  ) {
    this.botController = new BotController(
      userRepository,
      notificationPort,
      logger,
    );
  }

  getBotController(): BotController {
    return this.botController;
  }
}
