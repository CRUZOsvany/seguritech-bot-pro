import {
  Message,
  BotResponse,
  User,
  UserState,
  TenantConfig,
} from '../entities';
import { UserRepository } from '../ports';

/**
 * Caso de uso: Manejar mensaje entrante.
 *
 * Capa de dominio pura — sin dependencias de infraestructura.
 * Recibe la TenantConfig precargada por el controller, así no necesita
 * conocer cómo se carga (Supabase, caché, etc.).
 */
export class HandleMessageUseCase {
  constructor(private readonly userRepository: UserRepository) {}

  async execute(message: Message, config: TenantConfig): Promise<BotResponse> {
    const tenantId = message.tenantId;

    // 1. Obtener o crear usuario
    let user = await this.userRepository.findByPhoneNumber(tenantId, message.from);

    if (!user) {
      user = {
        id: this.generateId(),
        tenantId,
        phoneNumber: message.from,
        currentState: UserState.INITIAL,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      await this.userRepository.save(user);
    }

    // 2. Ruta global de escape: palabras clave que resetean el estado
    const ESCAPE_WORDS = ['menu', 'salir', 'cancelar', 'inicio'];
    if (ESCAPE_WORDS.includes(message.content.toLowerCase().trim())) {
      await this.userRepository.resetUserState(tenantId, message.from);
      return this.welcomeResponse(config);
    }

    // 3. Procesar según estado actual
    let response: BotResponse;

    switch (user.currentState) {
    case UserState.INITIAL:
      response = this.handleInitial(message, config);
      break;
    case UserState.MENU:
      response = this.handleMenu(message, config);
      break;
    case UserState.MAKING_ORDER:
      response = this.handleMakingOrder(message, config);
      break;
    case UserState.CONFIRMING_ORDER:
      response = this.handleConfirmingOrder(message, config);
      break;
    default:
      response = { message: config.notUnderstoodMessage };
    }

    // 4. Persistir cambio de estado si aplica
    if (response.nextState && response.nextState !== user.currentState) {
      user.currentState = response.nextState;
      user.updatedAt = new Date();
      await this.userRepository.update(user);
    }

    return response;
  }

  private handleInitial(message: Message, config: TenantConfig): BotResponse {
    const content = message.content.toLowerCase().trim();
    if (this.isGreeting(content)) {
      return this.welcomeResponse(config);
    }
    return {
      message: `${config.notUnderstoodMessage}\n\nEscribe "hola" para empezar.`,
    };
  }

  private handleMenu(message: Message, config: TenantConfig): BotResponse {
    const content = message.content.trim();

    switch (content) {
    case '1': // Productos
      return {
        message: this.formatCatalog(config),
        buttons: ['Volver al menú'],
        nextState: UserState.VIEWING_PRODUCTS,
      };

    case '2': // Precios
      return {
        message: this.formatPriceList(config),
        buttons: ['Volver al menú'],
        nextState: UserState.MENU,
      };

    case '3': // Hacer pedido
      if (config.catalog.length === 0) {
        return {
          message:
              'Aún no hay productos en el catálogo. Por favor contacta directamente.',
          buttons: ['Volver al menú'],
          nextState: UserState.MENU,
        };
      }
      return {
        message: this.formatProductChoice(config),
        buttons: this.makeProductButtons(config),
        nextState: UserState.MAKING_ORDER,
      };

    default:
      return {
        message: config.notUnderstoodMessage + '\n\n' + config.menuMessage,
        buttons: ['1', '2', '3'],
      };
    }
  }

  private handleMakingOrder(message: Message, config: TenantConfig): BotResponse {
    const content = message.content.trim();
    const idx = parseInt(content, 10) - 1;

    if (Number.isNaN(idx) || idx < 0 || idx >= config.catalog.length) {
      return {
        message: 'Por favor elige un número válido de la lista.',
        buttons: this.makeProductButtons(config),
      };
    }

    const item = config.catalog[idx];
    return {
      message: `Has seleccionado: *${item.name}* — $${item.price.toFixed(2)}\n\n¿Confirmas el pedido?`,
      buttons: ['Sí, confirmar', 'No, cancelar'],
      nextState: UserState.CONFIRMING_ORDER,
    };
  }

  private handleConfirmingOrder(message: Message, config: TenantConfig): BotResponse {
    const content = message.content.toLowerCase().trim();

    if (content === 'sí' || content === 'si' || content.includes('confirmar')) {
      const orderId = this.generateId().slice(-8).toUpperCase();
      return {
        message: `${config.orderConfirmationMessage}\n\nNúmero de pedido: #${orderId}`,
        buttons: ['Volver al menú'],
        nextState: UserState.MENU,
      };
    }

    if (content === 'no' || content.includes('cancelar')) {
      return {
        message: '❌ Pedido cancelado.',
        buttons: ['Volver al menú'],
        nextState: UserState.MENU,
      };
    }

    return {
      message: 'Responde "Sí, confirmar" o "No, cancelar".',
      buttons: ['Sí, confirmar', 'No, cancelar'],
    };
  }

  private welcomeResponse(config: TenantConfig): BotResponse {
    return {
      message: `${config.welcomeMessage}\n\n${config.menuMessage}`,
      buttons: ['1', '2', '3'],
      nextState: UserState.MENU,
    };
  }

  private formatCatalog(config: TenantConfig): string {
    if (config.catalog.length === 0) {
      return 'Aún no hay productos en el catálogo.';
    }
    const lines = config.catalog
      .slice(0, 10)
      .map((p, i) => `${i + 1}. ${p.name} — $${p.price.toFixed(2)}`);
    return 'Productos disponibles:\n\n' + lines.join('\n');
  }

  private formatPriceList(config: TenantConfig): string {
    if (config.catalog.length === 0) {
      return 'Aún no hay productos cargados.';
    }
    return this.formatCatalog(config);
  }

  private formatProductChoice(config: TenantConfig): string {
    return (
      'Elige el producto que deseas pedir:\n\n' +
      config.catalog
        .slice(0, 10)
        .map((p, i) => `${i + 1}. ${p.name}`)
        .join('\n')
    );
  }

  private makeProductButtons(config: TenantConfig): string[] {
    return config.catalog
      .slice(0, 3)
      .map((_, i) => String(i + 1));
  }

  private isGreeting(content: string): boolean {
    const greetings = [
      'hola', 'hi', 'hey', 'buenos días', 'buenas noches', 'buenas tardes', 'holá',
    ];
    return greetings.some((g) => content.includes(g));
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  }
}