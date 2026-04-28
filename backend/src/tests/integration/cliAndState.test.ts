import { HandleMessageUseCase } from '@/domain/use-cases/HandleMessageUseCase';
import { InMemoryUserRepository } from '@/infrastructure/repositories/InMemoryUserRepository';
import { ConsoleNotificationAdapter } from '@/infrastructure/adapters/ConsoleNotificationAdapter';
import { Message, UserState } from '@/domain/entities';

describe('CLI and State Management Integration', () => {
  let userRepository: InMemoryUserRepository;
  let handleMessageUseCase: HandleMessageUseCase;
  const tenantA = 'tenant-a-uuid';
  const tenantB = 'tenant-b-uuid';
  const phoneA = '+521234567890';
  const phoneB = '+529876543210';

  beforeEach(() => {
    userRepository = new InMemoryUserRepository();
    const notificationPort = new ConsoleNotificationAdapter();
    handleMessageUseCase = new HandleMessageUseCase(userRepository, notificationPort);
  });

  afterEach(() => {
    userRepository.clear();
  });

  // TEST 1: Crear tenant y aislamiento
  test('TEST 1: Multi-tenant isolation - tenant_A changes should not affect tenant_B', async () => {
    // Crear usuario A en tenant A
    const messageA: Message = {
      id: 'msg-1',
      tenantId: tenantA,
      from: phoneA,
      content: 'hola',
      timestamp: new Date(),
    };

    const responseA = await handleMessageUseCase.execute(messageA);

    // Verificar que usuario A está en MENU
    expect(responseA.nextState).toBe(UserState.MENU);

    // Crear usuario B en tenant B (sin cambiar estado)
    const messageB: Message = {
      id: 'msg-2',
      tenantId: tenantB,
      from: phoneB,
      content: 'hola',
      timestamp: new Date(),
    };

    const responseB = await handleMessageUseCase.execute(messageB);

    // Verificar que usuario B también está en MENU
    expect(responseB.nextState).toBe(UserState.MENU);

    // CRÍTICO: Verificar que usuario B en tenant B sigue en INITIAL si no ha interactuado
    const userB = await userRepository.findByPhoneNumber(tenantB, phoneB);
    expect(userB).not.toBeNull();
    expect(userB?.currentState).toBe(UserState.MENU);

    // Verificar aislamiento: cambio en tenant A no afecta tenant B
    const userA = await userRepository.findByPhoneNumber(tenantA, phoneA);
    expect(userA).not.toBeNull();
    expect(userA?.currentState).toBe(UserState.MENU);
    expect(userA?.tenantId).toBe(tenantA);
    expect(userB?.tenantId).toBe(tenantB);
  });

  // TEST 2: Ruta de escape funciona
  test('TEST 2: Escape route resets user state from MAKING_ORDER to INITIAL', async () => {
    // Poner usuario en estado MAKING_ORDER
    const userPhone = '+525551234567';
    
    // Crear usuario
    const messageHello: Message = {
      id: 'msg-1',
      tenantId: tenantA,
      from: userPhone,
      content: 'hola',
      timestamp: new Date(),
    };
    await handleMessageUseCase.execute(messageHello);

    // Seleccionar opción 3 (Hacer pedido) para entrar en MAKING_ORDER
    const messageOrder: Message = {
      id: 'msg-2',
      tenantId: tenantA,
      from: userPhone,
      content: '3',
      timestamp: new Date(),
    };
    const responseOrder = await handleMessageUseCase.execute(messageOrder);
    expect(responseOrder.nextState).toBe(UserState.MAKING_ORDER);

    // Ahora enviar comando de escape "salir"
    const messageEscape: Message = {
      id: 'msg-3',
      tenantId: tenantA,
      from: userPhone,
      content: 'salir',
      timestamp: new Date(),
    };
    const responseEscape = await handleMessageUseCase.execute(messageEscape);

    // Verificar que regresó al estado INITIAL (via MENU)
    expect(responseEscape.nextState).toBe(UserState.MENU);

    // Verificar en la base de datos que el usuario está en INITIAL
    const user = await userRepository.findByPhoneNumber(tenantA, userPhone);
    expect(user?.currentState).toBe(UserState.INITIAL);
  });

  // TEST 3: Escape es case-insensitive
  test('TEST 3: Escape words are case-insensitive and work for multiple keywords', async () => {
    const escapeWords = ['SALIR', 'Cancelar', 'MENU', 'INICIO'];
    const userPhone = '+525559876543';

    for (const escapeWord of escapeWords) {
      // Crear usuario
      const messageHello: Message = {
        id: `msg-hello-${escapeWord}`,
        tenantId: tenantA,
        from: userPhone,
        content: 'hola',
        timestamp: new Date(),
      };
      await handleMessageUseCase.execute(messageHello);

      // Entrar en MAKING_ORDER
      const messageOrder: Message = {
        id: `msg-order-${escapeWord}`,
        tenantId: tenantA,
        from: userPhone,
        content: '3',
        timestamp: new Date(),
      };
      const responseOrder = await handleMessageUseCase.execute(messageOrder);
      expect(responseOrder.nextState).toBe(UserState.MAKING_ORDER);

      // Enviar palabra de escape (variante de caso)
      const messageEscape: Message = {
        id: `msg-escape-${escapeWord}`,
        tenantId: tenantA,
        from: userPhone,
        content: escapeWord,
        timestamp: new Date(),
      };
      const responseEscape = await handleMessageUseCase.execute(messageEscape);

      // Verificar que se reseteó
      expect(responseEscape.nextState).toBe(UserState.MENU);
      const user = await userRepository.findByPhoneNumber(tenantA, userPhone);
      expect(user?.currentState).toBe(UserState.INITIAL);

      // Limpiar para siguiente iteración
      userRepository.clear();
    }
  });
});

