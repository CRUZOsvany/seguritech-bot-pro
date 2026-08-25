/**
 * Fase 1.2 del plan Secretaria Digital (.claude/SEGURITECH_AI_SECRETARIA_PLAN.md).
 *
 * DoD del ticket: "Test unitario con mensajes reales de un tenant piloto
 * (papelería, cerrajería) clasificando correctamente flow vs. agente" —
 * más los guardrails obligatorios del plan §4 (timeout -> flow, error -> flow,
 * classify() nunca lanza).
 */

import pino from 'pino';
import { AnthropicIntentRouter } from '@/infrastructure/adapters/AnthropicIntentRouter';
import { Message, User, TenantConfig, UserState, BotTone } from '@/domain/entities';

const logger = pino({ level: 'silent' });

function makeMessage(tenantId: string, content: string): Message {
  return {
    id: 'msg-1',
    tenantId,
    from: '+5217441234567',
    content,
    timestamp: new Date(),
  };
}

function makeUser(tenantId: string): User {
  return {
    id: 'user-1',
    tenantId,
    phoneNumber: '+5217441234567',
    currentState: UserState.INITIAL,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makeTenantConfig(nombreNegocio: string): TenantConfig {
  return {
    tenantId: 'tenant-1',
    botName: 'Bot',
    nombreNegocio,
    tone: BotTone.AMIGABLE,
    welcomeMessage: 'Bienvenido',
    menuMessage: 'Elige una opción',
    outOfHoursMessage: 'Fuera de horario',
    notUnderstoodMessage: 'No entendí',
    orderConfirmationMessage: 'Pedido confirmado',
    catalog: [],
    serviceDirectory: [],
    horarioSemana: null,
    horarioSabado: null,
    abreDomingo: false,
  };
}

/** Respuesta shape de la API de Anthropic para un tool_use forzado. */
function mockAnthropicResponse(intent: string) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      content: [{ type: 'tool_use', name: 'classify_intent', input: { intent } }],
    }),
    text: async () => '',
  };
}

describe('AnthropicIntentRouter — clasificación (Fase 1.2)', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('papelería: pregunta libre sobre catálogo -> agent', async () => {
    global.fetch = jest.fn().mockResolvedValue(mockAnthropicResponse('agent')) as unknown as typeof fetch;
    const router = new AnthropicIntentRouter('fake-key', logger);

    const result = await router.classify({
      message: makeMessage('papeleria_01', '¿Tienen cuadernos profesionales de 100 hojas y cuánto cuestan?'),
      user: makeUser('papeleria_01'),
      tenantConfig: makeTenantConfig('Papelería El Estudiante'),
    });

    expect(result).toBe('agent');
  });

  it('papelería: selección de opción de menú -> flow', async () => {
    global.fetch = jest.fn().mockResolvedValue(mockAnthropicResponse('flow')) as unknown as typeof fetch;
    const router = new AnthropicIntentRouter('fake-key', logger);

    const result = await router.classify({
      message: makeMessage('papeleria_01', '1'),
      user: makeUser('papeleria_01'),
      tenantConfig: makeTenantConfig('Papelería El Estudiante'),
    });

    expect(result).toBe('flow');
  });

  it('cerrajería: pide hablar con alguien por emergencia -> human', async () => {
    global.fetch = jest.fn().mockResolvedValue(mockAnthropicResponse('human')) as unknown as typeof fetch;
    const router = new AnthropicIntentRouter('fake-key', logger);

    const result = await router.classify({
      message: makeMessage(
        'cerrajeria_01',
        'quedé encerrado afuera de mi casa, es urgente, necesito hablar con alguien YA',
      ),
      user: makeUser('cerrajeria_01'),
      tenantConfig: makeTenantConfig('Cerrajería Rápida GRO'),
    });

    expect(result).toBe('human');
  });

  it('cerrajería: saludo inicial -> flow', async () => {
    global.fetch = jest.fn().mockResolvedValue(mockAnthropicResponse('flow')) as unknown as typeof fetch;
    const router = new AnthropicIntentRouter('fake-key', logger);

    const result = await router.classify({
      message: makeMessage('cerrajeria_01', 'hola'),
      user: makeUser('cerrajeria_01'),
      tenantConfig: makeTenantConfig('Cerrajería Rápida GRO'),
    });

    expect(result).toBe('flow');
  });

  it('llama al modelo Haiku (nunca al modelo de razonamiento del orquestador)', async () => {
    const fetchMock = jest.fn().mockResolvedValue(mockAnthropicResponse('flow'));
    global.fetch = fetchMock as unknown as typeof fetch;
    const router = new AnthropicIntentRouter('fake-key', logger);

    await router.classify({
      message: makeMessage('papeleria_01', 'hola'),
      user: makeUser('papeleria_01'),
      tenantConfig: makeTenantConfig('Papelería El Estudiante'),
    });

    const [, requestInit] = fetchMock.mock.calls[0];
    const body = JSON.parse(requestInit.body);
    expect(body.model).toContain('haiku');
    expect(body.tool_choice).toEqual({ type: 'tool', name: 'classify_intent' });
  });

  // --------------------------------------------------------------------
  // Guardrails (plan §4): classify() NUNCA lanza, siempre cae a 'flow'.
  // --------------------------------------------------------------------

  it('sin ANTHROPIC_API_KEY -> flow, sin llamar a la API', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    const router = new AnthropicIntentRouter('', logger);

    const result = await router.classify({
      message: makeMessage('papeleria_01', 'hola'),
      user: makeUser('papeleria_01'),
      tenantConfig: makeTenantConfig('Papelería El Estudiante'),
    });

    expect(result).toBe('flow');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('la API responde error HTTP -> flow', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'internal error',
    }) as unknown as typeof fetch;
    const router = new AnthropicIntentRouter('fake-key', logger);

    const result = await router.classify({
      message: makeMessage('papeleria_01', 'hola'),
      user: makeUser('papeleria_01'),
      tenantConfig: makeTenantConfig('Papelería El Estudiante'),
    });

    expect(result).toBe('flow');
  });

  it('fetch rechaza (red caída) -> flow, no lanza', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network down')) as unknown as typeof fetch;
    const router = new AnthropicIntentRouter('fake-key', logger);

    await expect(
      router.classify({
        message: makeMessage('papeleria_01', 'hola'),
        user: makeUser('papeleria_01'),
        tenantConfig: makeTenantConfig('Papelería El Estudiante'),
      }),
    ).resolves.toBe('flow');
  });

  it('timeout (AbortError) -> flow', async () => {
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';
    global.fetch = jest.fn().mockRejectedValue(abortError) as unknown as typeof fetch;
    const router = new AnthropicIntentRouter('fake-key', logger, 'claude-haiku-4-5-20251001', 50);

    const result = await router.classify({
      message: makeMessage('papeleria_01', 'hola'),
      user: makeUser('papeleria_01'),
      tenantConfig: makeTenantConfig('Papelería El Estudiante'),
    });

    expect(result).toBe('flow');
  });

  it('respuesta sin tool_use válido -> flow', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ content: [{ type: 'text', text: 'no debería pasar esto' }] }),
      text: async () => '',
    }) as unknown as typeof fetch;
    const router = new AnthropicIntentRouter('fake-key', logger);

    const result = await router.classify({
      message: makeMessage('papeleria_01', 'hola'),
      user: makeUser('papeleria_01'),
      tenantConfig: makeTenantConfig('Papelería El Estudiante'),
    });

    expect(result).toBe('flow');
  });
});
