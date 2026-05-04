import { HandleMessageUseCase } from '@/domain/use-cases/HandleMessageUseCase';
import { InMemoryUserRepository } from '@/infrastructure/repositories/InMemoryUserRepository';
import { Message, TenantConfig, BotTone, UserState } from '@/domain/entities';

const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';
const PHONE = '521234567890';

const FAKE_CONFIG: TenantConfig = {
  tenantId: TENANT_A,
  botName: 'TestBot',
  tone: BotTone.AMIGABLE,
  welcomeMessage: '¡Hola! Soy TestBot.',
  menuMessage: '1. Productos\n2. Precios\n3. Pedido',
  outOfHoursMessage: 'Cerrado.',
  notUnderstoodMessage: 'No entendí.',
  orderConfirmationMessage: '✅ Pedido confirmado.',
  catalog: [
    { id: 'p1', name: 'Pizza Margarita', description: '', price: 100, category: 'pizza', available: true },
    { id: 'p2', name: 'Pizza Pepperoni', description: '', price: 120, category: 'pizza', available: true },
  ],
};

function makeMessage(content: string, tenantId = TENANT_A, from = PHONE): Message {
  return {
    id: 'msg-' + Math.random().toString(36).slice(2),
    tenantId,
    from,
    content,
    timestamp: new Date(),
  };
}

describe('HandleMessageUseCase', () => {
  let repo: InMemoryUserRepository;
  let useCase: HandleMessageUseCase;

  beforeEach(() => {
    repo = new InMemoryUserRepository();
    useCase = new HandleMessageUseCase(repo);
  });

  test('saludo inicial muestra welcomeMessage del tenant', async () => {
    const res = await useCase.execute(makeMessage('hola'), FAKE_CONFIG);
    expect(res.message).toContain('TestBot');
    expect(res.nextState).toBe(UserState.MENU);
  });

  test('palabra "menu" resetea estado y muestra welcome', async () => {
    await useCase.execute(makeMessage('hola'), FAKE_CONFIG);
    const res = await useCase.execute(makeMessage('menu'), FAKE_CONFIG);
    expect(res.message).toContain('TestBot');
  });

  test('opción 1 muestra catálogo', async () => {
    await useCase.execute(makeMessage('hola'), FAKE_CONFIG);
    const res = await useCase.execute(makeMessage('1'), FAKE_CONFIG);
    expect(res.message).toContain('Pizza Margarita');
    expect(res.message).toContain('Pizza Pepperoni');
  });

  test('aislamiento multi-tenant: usuarios de A no son visibles desde B', async () => {
    const cfgB = { ...FAKE_CONFIG, tenantId: TENANT_B };
    await useCase.execute(makeMessage('hola', TENANT_A), FAKE_CONFIG);

    const userA = await repo.findByPhoneNumber(TENANT_A, PHONE);
    const userB = await repo.findByPhoneNumber(TENANT_B, PHONE);
    expect(userA).not.toBeNull();
    expect(userB).toBeNull();
  });

  test('flujo completo: saludo → ver productos → hacer pedido → confirmar', async () => {
    await useCase.execute(makeMessage('hola'), FAKE_CONFIG);
    await useCase.execute(makeMessage('3'), FAKE_CONFIG); // hacer pedido
    await useCase.execute(makeMessage('1'), FAKE_CONFIG); // primer producto
    const res = await useCase.execute(makeMessage('sí, confirmar'), FAKE_CONFIG);
    expect(res.message).toContain('Pedido confirmado');
  });

  test('respuesta inválida en MENU repite el menú', async () => {
    await useCase.execute(makeMessage('hola'), FAKE_CONFIG);
    const res = await useCase.execute(makeMessage('xyz123'), FAKE_CONFIG);
    expect(res.message).toContain('No entendí');
  });
});