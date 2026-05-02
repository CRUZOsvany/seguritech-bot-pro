/**
 * Unit tests para HandleMessageUseCase
 * Valida transiciones de estado y aislamiento multi-tenant
 *
 * NOTAS:
 * - Usa InMemoryUserRepository (no requiere DB real ni red).
 * - Mockea NotificationPort para evitar I/O.
 * - Usa la API real del use case: execute(message: Message).
 */

import { HandleMessageUseCase } from '@/domain/use-cases/HandleMessageUseCase';
import { InMemoryUserRepository } from '@/infrastructure/repositories/InMemoryUserRepository';
import { Message, UserState } from '@/domain/entities';
import { NotificationPort } from '@/domain/ports';

/**
 * Helper para construir un mensaje del dominio
 */
function buildMessage(tenantId: string, from: string, content: string): Message {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
    tenantId,
    from,
    content,
    timestamp: new Date(),
  };
}

describe('HandleMessageUseCase', () => {
  let useCase: HandleMessageUseCase;
  let repo: InMemoryUserRepository;
  let notificationPort: NotificationPort;

  beforeEach(() => {
    repo = new InMemoryUserRepository();

    // Mock silencioso de NotificationPort (no se usa en execute, pero el constructor lo pide)
    notificationPort = {
      sendMessage: jest.fn().mockResolvedValue(undefined),
      sendButtons: jest.fn().mockResolvedValue(undefined),
    };

    useCase = new HandleMessageUseCase(repo, notificationPort);
  });

  afterEach(() => {
    repo.clear();
  });

  // ============================================
  // ESTADO INITIAL
  // ============================================
  describe('Estado INITIAL', () => {
    it('debería transicionar a MENU cuando recibe un saludo', async () => {
      const result = await useCase.execute(
        buildMessage('tenant-1', '+5217471234567', 'hola')
      );

      expect(result).toBeDefined();
      expect(result.message).toContain('Bienvenido');
      expect(result.nextState).toBe(UserState.MENU);

      const user = await repo.findByPhoneNumber('tenant-1', '+5217471234567');
      expect(user).not.toBeNull();
      expect(user?.currentState).toBe(UserState.MENU);
    });

    it('debería responder con mensaje por defecto si no es saludo', async () => {
      const result = await useCase.execute(
        buildMessage('tenant-1', '+5217471234567', 'cualquier cosa rara')
      );

      expect(result.message).toContain('hola');
      // Sin nextState definido → permanece en INITIAL
      expect(result.nextState).toBeUndefined();
    });
  });

  // ============================================
  // ESTADO MENU
  // ============================================
  describe('Estado MENU', () => {
    beforeEach(async () => {
      // Pre-condición: usuario en MENU
      await useCase.execute(buildMessage('tenant-1', '+5217471234567', 'hola'));
    });

    it('opción 1 debería ir a VIEWING_PRODUCTS', async () => {
      const result = await useCase.execute(
        buildMessage('tenant-1', '+5217471234567', '1')
      );

      expect(result.message).toContain('Productos disponibles');
      expect(result.nextState).toBe(UserState.VIEWING_PRODUCTS);
    });

    it('opción 2 debería mostrar precios y permanecer en MENU', async () => {
      const result = await useCase.execute(
        buildMessage('tenant-1', '+5217471234567', '2')
      );

      expect(result.message).toContain('precios');
      expect(result.nextState).toBe(UserState.MENU);
    });

    it('opción 3 debería transicionar a MAKING_ORDER', async () => {
      const result = await useCase.execute(
        buildMessage('tenant-1', '+5217471234567', '3')
      );

      expect(result.message).toContain('pedido');
      expect(result.nextState).toBe(UserState.MAKING_ORDER);

      const user = await repo.findByPhoneNumber('tenant-1', '+5217471234567');
      expect(user?.currentState).toBe(UserState.MAKING_ORDER);
    });

    it('opción inválida debería pedir reintentar sin cambiar de estado', async () => {
      const result = await useCase.execute(
        buildMessage('tenant-1', '+5217471234567', '99')
      );

      expect(result.message).toContain('No entiendo');
      expect(result.nextState).toBeUndefined();
    });
  });

  // ============================================
  // ESTADO MAKING_ORDER
  // ============================================
  describe('Estado MAKING_ORDER', () => {
    beforeEach(async () => {
      // Pre-condición: usuario en MAKING_ORDER
      await useCase.execute(buildMessage('tenant-1', '+5217471234567', 'hola'));
      await useCase.execute(buildMessage('tenant-1', '+5217471234567', '3'));
    });

    it('opción 1 (Básico) debería transicionar a CONFIRMING_ORDER', async () => {
      const result = await useCase.execute(
        buildMessage('tenant-1', '+5217471234567', '1')
      );

      expect(result.message).toContain('Básico');
      expect(result.nextState).toBe(UserState.CONFIRMING_ORDER);

      const user = await repo.findByPhoneNumber('tenant-1', '+5217471234567');
      expect(user?.currentState).toBe(UserState.CONFIRMING_ORDER);
    });
  });

  // ============================================
  // ESTADO CONFIRMING_ORDER
  // ============================================
  describe('Estado CONFIRMING_ORDER', () => {
    beforeEach(async () => {
      // Pre-condición: usuario en CONFIRMING_ORDER
      await useCase.execute(buildMessage('tenant-1', '+5217471234567', 'hola'));
      await useCase.execute(buildMessage('tenant-1', '+5217471234567', '3'));
      await useCase.execute(buildMessage('tenant-1', '+5217471234567', '1'));
    });

    it('"sí" debería confirmar y volver a MENU con número de pedido', async () => {
      const result = await useCase.execute(
        buildMessage('tenant-1', '+5217471234567', 'sí')
      );

      expect(result.message).toContain('Pedido confirmado');
      expect(result.message).toMatch(/#[\w-]+/); // contiene un ID
      expect(result.nextState).toBe(UserState.MENU);
    });

    it('"no" debería cancelar y volver a MENU', async () => {
      const result = await useCase.execute(
        buildMessage('tenant-1', '+5217471234567', 'no')
      );

      expect(result.message).toContain('cancelado');
      expect(result.nextState).toBe(UserState.MENU);
    });

    it('respuesta inválida debería pedir confirmación de nuevo', async () => {
      const result = await useCase.execute(
        buildMessage('tenant-1', '+5217471234567', 'tal vez')
      );

      expect(result.message).toContain('No entiendo');
      expect(result.nextState).toBeUndefined();

      const user = await repo.findByPhoneNumber('tenant-1', '+5217471234567');
      expect(user?.currentState).toBe(UserState.CONFIRMING_ORDER);
    });
  });

  // ============================================
  // RUTA DE ESCAPE GLOBAL
  // ============================================
  describe('Escape routes globales', () => {
    it('"menu" debería resetear a INITIAL desde cualquier estado', async () => {
      // Llevar al usuario a MAKING_ORDER
      await useCase.execute(buildMessage('tenant-1', '+5217471234567', 'hola'));
      await useCase.execute(buildMessage('tenant-1', '+5217471234567', '3'));

      let user = await repo.findByPhoneNumber('tenant-1', '+5217471234567');
      expect(user?.currentState).toBe(UserState.MAKING_ORDER);

      // Decir "menu"
      const result = await useCase.execute(
        buildMessage('tenant-1', '+5217471234567', 'menu')
      );

      expect(result.message).toContain('Bienvenido');

      user = await repo.findByPhoneNumber('tenant-1', '+5217471234567');
      expect(user?.currentState).toBe(UserState.INITIAL);
    });

    it('"salir", "cancelar", "inicio" también deberían resetear', async () => {
      const escapeWords = ['salir', 'cancelar', 'inicio', 'SALIR', 'Cancelar'];

      for (const word of escapeWords) {
        const phone = `+521000${escapeWords.indexOf(word)}`;
        await useCase.execute(buildMessage('tenant-1', phone, 'hola'));
        await useCase.execute(buildMessage('tenant-1', phone, '3'));

        await useCase.execute(buildMessage('tenant-1', phone, word));

        const user = await repo.findByPhoneNumber('tenant-1', phone);
        expect(user?.currentState).toBe(UserState.INITIAL);
      }
    });
  });

  // ============================================
  // AISLAMIENTO MULTI-TENANT
  // ============================================
  describe('Multi-tenant isolation', () => {
    it('mismo phone con tenants distintos = usuarios independientes', async () => {
      const phone = '+5217471234567';

      // Tenant A llega hasta MAKING_ORDER
      await useCase.execute(buildMessage('tenant-a', phone, 'hola'));
      await useCase.execute(buildMessage('tenant-a', phone, '3'));

      // Tenant B se queda en MENU (opción 2 = ver precios)
      await useCase.execute(buildMessage('tenant-b', phone, 'hola'));
      await useCase.execute(buildMessage('tenant-b', phone, '2'));

      const userA = await repo.findByPhoneNumber('tenant-a', phone);
      const userB = await repo.findByPhoneNumber('tenant-b', phone);

      expect(userA?.currentState).toBe(UserState.MAKING_ORDER);
      expect(userB?.currentState).toBe(UserState.MENU);
      expect(userA?.id).not.toBe(userB?.id);
    });

    it('reset en un tenant no afecta al otro', async () => {
      const phone = '+5217471234567';

      // Ambos tenants llegan a MAKING_ORDER
      await useCase.execute(buildMessage('tenant-a', phone, 'hola'));
      await useCase.execute(buildMessage('tenant-a', phone, '3'));
      await useCase.execute(buildMessage('tenant-b', phone, 'hola'));
      await useCase.execute(buildMessage('tenant-b', phone, '3'));

      // Solo tenant A hace reset
      await useCase.execute(buildMessage('tenant-a', phone, 'menu'));

      const userA = await repo.findByPhoneNumber('tenant-a', phone);
      const userB = await repo.findByPhoneNumber('tenant-b', phone);

      expect(userA?.currentState).toBe(UserState.INITIAL);
      expect(userB?.currentState).toBe(UserState.MAKING_ORDER);
    });
  });
});