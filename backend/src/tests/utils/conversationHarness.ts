/**
 * Piezas compartidas por los tests del motor de conversación y del simulador
 * del Studio: el intérprete armado como en ApplicationContainer, una
 * configuración de tenant fija y las conversaciones grabadas de
 * `tests/fixtures/conversations/`.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import pino from 'pino';
import { BotTone } from '@/domain/entities';
import type { TenantConfig } from '@/domain/entities';
import type { BotFlow } from '@/domain/entities/flow';
import type { PosProduct } from '@/domain/entities/pos/Product';
import type { TenantConfigPort } from '@/domain/ports';
import type { PosProductRepository } from '@/domain/ports/pos/PosProductRepository';
import { FlowInterpreter } from '@/domain/services/FlowInterpreter';
import { VariableResolver } from '@/domain/services/VariableResolver';
import { DynamicSectionResolver } from '@/domain/services/DynamicSectionResolver';
import { CarouselCardResolver } from '@/domain/services/CarouselCardResolver';
import { ServiceDirectoryMatcher } from '@/domain/services/ServiceDirectoryMatcher';
import type { CatalogSearchService } from '@/domain/services/CatalogSearchService';
import type { SimEvent } from '@/infrastructure/server/admin/studioSimulation';

export const silentLogger = pino({ level: 'silent' });

export const HARNESS_TENANT_ID = '00000000-0000-4000-8000-00000000c0de';
export const HARNESS_OWNER_PHONE = '5217479990000';
/** Número MX con el 1 legacy: prueba de paso la normalización 521 → 52 al enviar. */
export const HARNESS_CUSTOMER_PHONE = '5217471234567';

export const MOLDS = ['cerrajeria', 'papeleria', 'securitech'] as const;
export type Mold = (typeof MOLDS)[number];

export interface RecordedConversation {
  mold: Mold;
  description: string;
  startAt: string;
  tenant: Pick<TenantConfig, 'horarioSemana' | 'horarioSabado' | 'abreDomingo'>;
  events: SimEvent[];
}

export function loadMold(mold: Mold): BotFlow {
  return JSON.parse(
    readFileSync(join(__dirname, '../../../scripts', `${mold}-flow.json`), 'utf8'),
  ) as BotFlow;
}

export function loadConversation(mold: Mold): RecordedConversation {
  return JSON.parse(
    readFileSync(join(__dirname, '../fixtures/conversations', `${mold}.json`), 'utf8'),
  ) as RecordedConversation;
}

export const CUADERNO: PosProduct = {
  id: 'pos-cuaderno-prof',
  tenantId: HARNESS_TENANT_ID,
  sku: 'CUA-PROF-100',
  barcode: null,
  name: 'Cuaderno profesional 100 hojas',
  description: null,
  categoryId: null,
  unitType: 'piece',
  unitPrice: 45.5,
  costPrice: null,
  taxRate: 0,
  stockQty: 20,
  stockMin: 0,
  trackStock: true,
  isActive: true,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

export function makeTenantConfig(
  overrides: Partial<TenantConfig> = {},
): TenantConfig {
  return {
    tenantId: HARNESS_TENANT_ID,
    botName: 'Asistente',
    nombreNegocio: 'Negocio de Prueba',
    tone: BotTone.AMIGABLE,
    welcomeMessage: '¡Hola! Bienvenido a Negocio de Prueba.',
    menuMessage: '¿En qué te ayudamos?',
    outOfHoursMessage: 'Ahorita estamos cerrados, te contestamos en cuanto abramos.',
    notUnderstoodMessage: 'No te entendí, elige una opción:',
    orderConfirmationMessage: 'Pedido confirmado.',
    catalog: [],
    ownerPhone: HARNESS_OWNER_PHONE,
    serviceDirectory: [
      {
        id: 'svc-engargolado',
        tenantId: HARNESS_TENANT_ID,
        nombre: 'Engargolado',
        keywords: ['engargolado', 'engargolar'],
        respuesta: 'Engargolado hasta 100 hojas $35',
        precio: 35,
        activo: true,
        orden: 0,
      },
      {
        id: 'svc-copias',
        tenantId: HARNESS_TENANT_ID,
        nombre: 'Copias',
        keywords: ['copias', 'copia'],
        respuesta: 'Copias blanco y negro $1 por hoja',
        precio: 1,
        activo: true,
        orden: 1,
      },
    ],
    horarioSemana: null,
    horarioSabado: null,
    abreDomingo: false,
    catalogSynonyms: {},
    ...overrides,
  };
}

export function makeTenantConfigPort(config: TenantConfig): TenantConfigPort {
  return { getConfig: async () => config, invalidate: () => undefined };
}

/**
 * El intérprete como lo arma ApplicationContainer. Lo único falso es el
 * acceso a pos_products: la búsqueda encuentra el cuaderno cuando el texto
 * dice "cuaderno", y el lookup por id devuelve ese mismo producto.
 */
export function makeInterpreter(): FlowInterpreter {
  const posProductRepository = {
    findById: async (_tenantId: string, id: string) => (id === CUADERNO.id ? CUADERNO : null),
  } as unknown as PosProductRepository;
  const catalogSearchService = {
    search: async (_tenantId: string, query: string) => (/cuaderno/i.test(query) ? CUADERNO : null),
  } as unknown as CatalogSearchService;
  return new FlowInterpreter(
    new VariableResolver({} as never, posProductRepository, silentLogger),
    new DynamicSectionResolver(silentLogger),
    new CarouselCardResolver(silentLogger),
    new ServiceDirectoryMatcher(),
    catalogSearchService,
    silentLogger,
  );
}
