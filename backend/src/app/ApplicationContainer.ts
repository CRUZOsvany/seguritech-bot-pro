import pino from 'pino';
import { BotController } from './controllers/BotController';
import { UserRepository, NotificationPort, TenantConfigPort } from '@/domain/ports';

/**
 * Contenedor de inyección de dependencias.
 *
 * Recibe todos los puertos del dominio ya construidos por Bootstrap
 * y arma el árbol de objetos de la capa de aplicación.
 *
 * No conoce nada de infraestructura concreta — solo interfaces.
 */
export class ApplicationContainer {
  private readonly botController: BotController;

  constructor(
    userRepository: UserRepository,
    notificationPort: NotificationPort,
    tenantConfigPort: TenantConfigPort,
    logger: pino.Logger,
  ) {
    this.botController = new BotController(
      userRepository,
      notificationPort,
      tenantConfigPort,
      logger,
    );
  }

  getBotController(): BotController {
    return this.botController;
  }
}