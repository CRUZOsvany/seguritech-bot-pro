/**
 * Casos matched_service_* (Fase 5.4) — mirror del patrón selected_product_*
 * ya existente en VariableResolver.resolveOne. No requieren Supabase (leen
 * directo de tenantConfig.serviceDirectory), así que el stub del cliente
 * nunca se invoca.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import pino from 'pino';
import { VariableResolver } from '@/domain/services/VariableResolver';
import type { TenantConfig, User, Message, ServiceDirectoryEntry } from '@/domain/entities';
import { BotTone, UserState } from '@/domain/entities';
import type { PosProductRepository } from '@/domain/ports/pos/PosProductRepository';

const silentLogger = pino({ level: 'silent' });
const unusedSupabase = {} as unknown as SupabaseClient;
const unusedPosProducts = {} as unknown as PosProductRepository;

const SERVICE: ServiceDirectoryEntry = {
  id: 'svc-1',
  tenantId: 't1',
  nombre: 'Copia de llave',
  keywords: ['copia'],
  respuesta: 'Sí, hacemos copias de llave.',
  precio: 25,
  activo: true,
  orden: 0,
};

function makeTenantConfig(overrides: Partial<TenantConfig> = {}): TenantConfig {
  return {
    tenantId: 't1',
    botName: 'Bot',
    nombreNegocio: 'Cerrajería Prueba',
    tone: BotTone.AMIGABLE,
    welcomeMessage: 'Hola',
    menuMessage: 'Menú',
    outOfHoursMessage: 'Fuera de horario',
    notUnderstoodMessage: 'No entendí',
    orderConfirmationMessage: 'Pedido confirmado',
    catalog: [],
    serviceDirectory: [SERVICE],
    horarioSemana: null,
    horarioSabado: null,
    abreDomingo: false,
    catalogSynonyms: {},
    ...overrides,
  };
}

function makeUser(context: Record<string, unknown> = {}): User {
  return {
    id: 'u1',
    tenantId: 't1',
    phoneNumber: '521234567890',
    currentState: UserState.INITIAL,
    context,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makeMessage(): Message {
  return { id: 'm1', tenantId: 't1', from: '521234567890', content: 'hola', timestamp: new Date() };
}

describe('VariableResolver — matched_service_* (Fase 5.4)', () => {
  const resolver = new VariableResolver(unusedSupabase, unusedPosProducts, silentLogger);

  it('matched_service_name resuelve el nombre de la entrada matcheada', async () => {
    const result = await resolver.resolve('{{matched_service_name}}', {
      tenantId: 't1',
      tenantConfig: makeTenantConfig(),
      user: makeUser({ matched_service_id: 'svc-1' }),
      message: makeMessage(),
    });
    expect(result).toBe('Copia de llave');
  });

  it('matched_service_response resuelve la respuesta configurada', async () => {
    const result = await resolver.resolve('{{matched_service_response}}', {
      tenantId: 't1',
      tenantConfig: makeTenantConfig(),
      user: makeUser({ matched_service_id: 'svc-1' }),
      message: makeMessage(),
    });
    expect(result).toBe('Sí, hacemos copias de llave.');
  });

  it('matched_service_price resuelve el precio formateado a 2 decimales', async () => {
    const result = await resolver.resolve('{{matched_service_price}}', {
      tenantId: 't1',
      tenantConfig: makeTenantConfig(),
      user: makeUser({ matched_service_id: 'svc-1' }),
      message: makeMessage(),
    });
    expect(result).toBe('25.00');
  });

  it('matched_service_price vacío si la entrada no tiene precio', async () => {
    const result = await resolver.resolve('{{matched_service_price}}', {
      tenantId: 't1',
      tenantConfig: makeTenantConfig({
        serviceDirectory: [{ ...SERVICE, precio: undefined }],
      }),
      user: makeUser({ matched_service_id: 'svc-1' }),
      message: makeMessage(),
    });
    expect(result).toBe('');
  });

  it('vacío si no hay matched_service_id en el contexto', async () => {
    const result = await resolver.resolve('{{matched_service_name}}', {
      tenantId: 't1',
      tenantConfig: makeTenantConfig(),
      user: makeUser(),
      message: makeMessage(),
    });
    expect(result).toBe('');
  });

  it('vacío si el id no matchea ninguna entrada del directorio', async () => {
    const result = await resolver.resolve('{{matched_service_name}}', {
      tenantId: 't1',
      tenantConfig: makeTenantConfig(),
      user: makeUser({ matched_service_id: 'no-existe' }),
      message: makeMessage(),
    });
    expect(result).toBe('');
  });
});
