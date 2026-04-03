import { Message, BotResponse, User, UserState } from '../entities';
import { UserRepository, NotificationPort } from '../ports';

/**
 * Caso de uso: Manejar mensaje entrante
 * Orquesta la lógica de negocio sin conocer detalles de implementación
 *
 * Responsabilidades:
 * - Procesar el mensaje
 * - Determinar el estado del usuario
 * - Generar respuesta apropiada
 */
export class HandleMessageUseCase {
  constructor(
    private userRepository: UserRepository,
    private notificationPort: NotificationPort,
  ) {}

  async execute(message: Message): Promise<BotResponse> {
    // Obtener o crear usuario
    let user = await this.userRepository.findByPhoneNumber(message.from);

    if (!user) {
      user = {
        id: this.generateId(),
        phoneNumber: message.from,
        currentState: UserState.INITIAL,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      await this.userRepository.save(user);
    }

    // Procesar según estado actual
    let response: BotResponse;

    switch (user.currentState) {
    case UserState.INITIAL:
      response = await this.handleInitialState(message, user);
      break;

    case UserState.MENU:
      response = await this.handleMenuState(message, user);
      break;

    case UserState.MAKING_ORDER:
      response = await this.handleMakingOrderState(message, user);
      break;

    default:
      response = this.getDefaultResponse();
    }

    // Actualizar estado del usuario si cambia
    if (response.nextState && response.nextState !== user.currentState) {
      user.currentState = response.nextState;
      user.updatedAt = new Date();
      await this.userRepository.update(user);
    }

    return response;
  }

  private async handleInitialState(message: Message, user: User): Promise<BotResponse> {
    const content = message.content.toLowerCase().trim();

    // Detectar saludo
    if (this.isGreeting(content)) {
      return {
        message: '¡Hola! Bienvenido a SegurITech Bot Pro. ¿Qué deseas hacer?',
        buttons: ['1. Productos', '2. Precios', '3. Hacer pedido'],
        nextState: UserState.MENU,
      };
    }

    return this.getDefaultResponse();
  }

  private async handleMenuState(message: Message, user: User): Promise<BotResponse> {
    const content = message.content.trim();

    switch (content) {
    case '1':
      return {
        message: 'Productos disponibles:\n\n1. Seguro Básico - $10/mes\n2. Seguro Premium - $25/mes\n3. Seguro Enterprise - $50/mes\n\n¿Deseas conocer más detalles?',
        buttons: ['Sí', 'No'],
        nextState: UserState.VIEWING_PRODUCTS,
      };

    case '2':
      return {
        message: 'Nuestros precios:\n\n• Básico: $10/mes\n• Premium: $25/mes (20% desc. anual)\n• Enterprise: $50/mes (30% desc. anual)',
        buttons: ['Volver al menú'],
        nextState: UserState.MENU,
      };

    case '3':
      return {
        message: 'Bien, vamos a hacer un pedido. ¿Cuál producto deseas?',
        buttons: ['1. Básico', '2. Premium', '3. Enterprise'],
        nextState: UserState.MAKING_ORDER,
      };

    default:
      return {
        message: 'No entiendo tu opción. Por favor, elige una opción válida.',
        buttons: ['1. Productos', '2. Precios', '3. Hacer pedido'],
      };
    }
  }

  private async handleMakingOrderState(message: Message, user: User): Promise<BotResponse> {
    const content = message.content.trim();

    const productMap: { [key: string]: string } = {
      '1': 'Básico',
      '2': 'Premium',
      '3': 'Enterprise',
    };

    if (productMap[content]) {
      return {
        message: `Perfecto. Has seleccionado: ${productMap[content]}\n\n¿Deseas confirmar este pedido?`,
        buttons: ['Sí, confirmar', 'No, cancelar'],
        nextState: UserState.CONFIRMING_ORDER,
      };
    }

    return {
      message: 'Por favor, elige una opción válida.',
      buttons: ['1. Básico', '2. Premium', '3. Enterprise'],
    };
  }

  private isGreeting(content: string): boolean {
    const greetings = ['hola', 'hi', 'hey', 'buenos días', 'buenas noches', 'buenas tardes', 'holá'];
    return greetings.some((g) => content.includes(g));
  }

  private getDefaultResponse(): BotResponse {
    return {
      message: 'Escribe "hola" para empezar.',
    };
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
