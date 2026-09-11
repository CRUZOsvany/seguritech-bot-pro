/**
 * Filas de lista por id (hallazgo H-1 del inventario del Studio, 2026-09-10).
 *
 * El parser de Meta convertía `list_reply` en su TÍTULO, y `list_item_any`
 * sobre una sección dinámica aceptaba cualquier texto y lo guardaba crudo.
 * En `menu_servicios` de papelería el cliente tocaba "Engargolado" y recibía
 * "Perfecto, **. Dinos cuántas hojas…": `matched_service_id` valía
 * "Engargolado" y {{matched_service_name}} no encontraba nada.
 *
 * Estos tests usan el molde real (`backend/scripts/papeleria-flow.json`), el
 * parser real y el VariableResolver real: lo que se afirma es el texto que
 * recibe el cliente, no un detalle interno.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import pino from 'pino';
import { BotTone, UserState } from '@/domain/entities';
import type { TenantConfig, User } from '@/domain/entities';
import type { BotFlow } from '@/domain/entities/flow';
import { FlowInterpreter } from '@/domain/services/FlowInterpreter';
import { VariableResolver } from '@/domain/services/VariableResolver';
import { DynamicSectionResolver } from '@/domain/services/DynamicSectionResolver';
import { CarouselCardResolver } from '@/domain/services/CarouselCardResolver';
import { ServiceDirectoryMatcher } from '@/domain/services/ServiceDirectoryMatcher';
import type { CatalogSearchService } from '@/domain/services/CatalogSearchService';
import type { PosProductRepository } from '@/domain/ports/pos/PosProductRepository';
import type { MetaCredentialsRepository } from '@/domain/ports';
import { MetaWhatsAppAdapter } from '@/infrastructure/adapters/MetaWhatsAppAdapter';

const logger = pino({ level: 'silent' });

const papeleria = JSON.parse(
  readFileSync(join(__dirname, '../../../scripts/papeleria-flow.json'), 'utf8'),
) as BotFlow;

const SVC_ID = '7c1e2a90-0000-4000-8000-000000000001';

function makeTenantConfig(): TenantConfig {
  return {
    tenantId: 't1',
    botName: 'Bot',
    nombreNegocio: 'Papelería Prueba',
    tone: BotTone.AMIGABLE,
    welcomeMessage: 'Hola',
    menuMessage: 'Menú',
    outOfHoursMessage: 'Cerrado',
    notUnderstoodMessage: 'No te entendí',
    orderConfirmationMessage: 'Listo',
    catalog: [],
    horarioSemana: null,
    horarioSabado: null,
    abreDomingo: false,
    catalogSynonyms: {},
    serviceDirectory: [
      {
        id: SVC_ID,
        tenantId: 't1',
        nombre: 'Engargolado',
        keywords: ['engargolado'],
        respuesta: 'Hasta 100 hojas $35',
        activo: true,
        orden: 0,
      },
    ],
  };
}

function makeInterpreter(): FlowInterpreter {
  const posProductRepository = {
    findById: jest.fn().mockResolvedValue(null),
  } as unknown as PosProductRepository;
  return new FlowInterpreter(
    new VariableResolver({} as never, posProductRepository, logger),
    new DynamicSectionResolver(logger),
    new CarouselCardResolver(logger),
    new ServiceDirectoryMatcher(),
    { search: jest.fn().mockResolvedValue(null) } as unknown as CatalogSearchService,
    logger,
  );
}

function userAt(nodeId: string, flowStart = false): User {
  return {
    id: 'u1',
    tenantId: 't1',
    phoneNumber: '5217471111111',
    currentState: UserState.INITIAL,
    currentNodeId: flowStart ? undefined : nodeId,
    context: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

async function sendAt(nodeId: string, content: string, flow: BotFlow = papeleria) {
  return makeInterpreter().execute({
    flow,
    user: userAt(nodeId),
    tenantConfig: makeTenantConfig(),
    message: { id: 'm1', tenantId: 't1', from: '5217471111111', content, timestamp: new Date() },
  });
}

function textOf(result: { outputs: Array<{ kind: string }> }): string {
  const first = result.outputs[0] as { kind: string; text?: string };
  return first?.text ?? '';
}

describe('papelería · menu_servicios (lista dinámica del directorio)', () => {
  it('tocar la fila en WhatsApp: el parser real entrega el id y el cliente ve el nombre del servicio', async () => {
    const adapter = new MetaWhatsAppAdapter(logger, {} as MetaCredentialsRepository);
    const parsed = adapter.parseIncomingMessage({
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { display_phone_number: '5217470000000' },
                messages: [
                  {
                    from: '5217471111111',
                    id: 'wamid.1',
                    timestamp: '1757480000',
                    type: 'interactive',
                    interactive: {
                      type: 'list_reply',
                      list_reply: { id: SVC_ID, title: 'Engargolado' },
                    },
                  },
                ],
              },
            },
          ],
        },
      ],
    });

    const result = await sendAt('menu_servicios', parsed!.content);

    expect(result.nextNodeId).toBe('servicio_captura');
    expect(result.contextUpdates.matched_service_id).toBe(SVC_ID);
    expect(textOf(result)).toContain('Perfecto, *Engargolado*.');
  });

  it('escribir el nombre de la fila en vez de tocarla también la elige', async () => {
    const result = await sendAt('menu_servicios', 'engargolado');

    expect(result.nextNodeId).toBe('servicio_captura');
    expect(result.contextUpdates.matched_service_id).toBe(SVC_ID);
    expect(textOf(result)).toContain('*Engargolado*');
  });

  it('un texto que no es ninguna fila cae al default y no guarda basura en contexto', async () => {
    const result = await sendAt('menu_servicios', 'quiero copias a color');

    expect(result.nextNodeId).toBe('no_entendi');
    expect(result.contextUpdates).not.toHaveProperty('matched_service_id');
  });

  it('una palabra de escape ya no queda absorbida como fila elegida', async () => {
    const result = await sendAt('menu_servicios', 'menu');

    expect(result.nextNodeId).toBe(papeleria.start_node_id);
    expect(result.contextUpdates.matched_service_id).not.toBe('menu');
  });
});

describe('lista estática: id y título siguen funcionando', () => {
  const flow: BotFlow = {
    version: '1.0',
    start_node_id: 'menu',
    nodes: [
      {
        id: 'menu',
        type: 'send_list',
        content: {
          text: 'Elige',
          button_label: 'Ver',
          sections: [
            {
              type: 'static',
              title: 'Opciones',
              items: [
                { id: 'op_puerta', title: 'Apertura de puerta' },
                { id: 'op_carro', title: 'Apertura de carro' },
              ],
            },
          ],
        },
        transitions: [
          { condition: { type: 'list_item_any', save_to_context: 'servicio' }, next_node_id: 'fin' },
          { condition: { type: 'default' }, next_node_id: 'fin' },
        ],
      },
      { id: 'fin', type: 'end', content: {}, transitions: [] },
    ],
  };

  it.each([
    ['el id (lo que entrega Meta)', 'op_carro'],
    ['el título escrito a mano', 'APERTURA DE CARRO'],
  ])('%s guarda el id de la fila', async (_caso, content) => {
    const result = await sendAt('menu', content, flow);

    expect(result.contextUpdates.servicio).toBe('op_carro');
  });

  it('un texto que no es ninguna fila no guarda nada', async () => {
    const result = await sendAt('menu', 'otra cosa', flow);

    expect(result.contextUpdates).not.toHaveProperty('servicio');
  });
});
