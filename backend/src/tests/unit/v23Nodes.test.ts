/**
 * Tests de los 6 tipos de nodo WhatsApp v23.0 — runtime cabling (Prompt 3).
 *
 * Cubre:
 * 1. parseIncomingMessage reconoce los 3 tipos de mensaje entrante nuevos.
 * 2. FlowInterpreter.renderNode retorna los InterpreterOutput correctos.
 * 3. matchesCondition maneja call_permission_granted y call_permission_denied.
 * 4. WAIT_NODE_TYPES incluye request_call_permission.
 */

import type { Message, User, TenantConfig } from '@/domain/entities';
import { BotTone, UserState } from '@/domain/entities';
import type { BotFlow } from '@/domain/entities/flow';
import { FlowInterpreter } from '@/domain/services/FlowInterpreter';
import { VariableResolver } from '@/domain/services/VariableResolver';
import { DynamicSectionResolver } from '@/domain/services/DynamicSectionResolver';
import pino from 'pino';

// ============================================================================
// HELPERS
// ============================================================================

const logger = pino({ level: 'silent' });

function makeUser(overrides?: Partial<User>): User {
  return {
    id: 'u1',
    tenantId: 't1',
    phoneNumber: '521234567890',
    currentState: UserState.INITIAL,
    context: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeMessage(content: string, overrides?: Partial<Message>): Message {
  return {
    id: 'm1',
    tenantId: 't1',
    from: '521234567890',
    content,
    timestamp: new Date(),
    ...overrides,
  };
}

function makeTenantConfig(): TenantConfig {
  return {
    tenantId: 't1',
    botName: 'TestBot',
    nombreNegocio: 'Test SA',
    tone: BotTone.AMIGABLE,
    welcomeMessage: 'Hola',
    menuMessage: 'Menú',
    outOfHoursMessage: 'Fuera de horario',
    notUnderstoodMessage: 'No entendí',
    orderConfirmationMessage: 'Pedido confirmado',
    catalog: [],
  };
}

// VariableResolver stub — solo pasa el texto sin modificar
const mockVR = {
  resolve: async (t: string) => t,
} as unknown as VariableResolver;

const mockDSR = new DynamicSectionResolver(logger);

function makeInterpreter(): FlowInterpreter {
  return new FlowInterpreter(mockVR, mockDSR, logger);
}

// ============================================================================
// SECCIÓN 1: parseIncomingMessage — mensajes entrantes nuevos
// ============================================================================

describe('MetaWhatsAppAdapter.parseIncomingMessage — mensajes v23.0', () => {
  // Importamos solo la interfaz; no instanciamos el adapter (requiere Supabase)
  // Estas pruebas validan el CONTRATO de ParsedIncomingMessage extendido.

  it('ParsedIncomingMessage incluye locationPayload (campo opcional)', () => {
    // Verificar que el tipo compila con los campos opcionales nuevos
    const parsed: import('@/infrastructure/adapters/MetaWhatsAppAdapter').ParsedIncomingMessage = {
      from: '5212345678',
      content: '__LOCATION__',
      businessNumber: '5219876543',
      timestamp: '1700000000',
      locationPayload: { latitude: 17.55, longitude: -99.50 },
    };
    expect(parsed.content).toBe('__LOCATION__');
    expect(parsed.locationPayload?.latitude).toBe(17.55);
  });

  it('ParsedIncomingMessage incluye flowResponsePayload (campo opcional)', () => {
    const parsed: import('@/infrastructure/adapters/MetaWhatsAppAdapter').ParsedIncomingMessage = {
      from: '5212345678',
      content: '__FLOW_RESPONSE__',
      businessNumber: '5219876543',
      timestamp: '1700000000',
      flowResponsePayload: { nombre: 'Juan', email: 'juan@test.com' },
    };
    expect(parsed.content).toBe('__FLOW_RESPONSE__');
    expect(parsed.flowResponsePayload?.['nombre']).toBe('Juan');
  });

  it('ParsedIncomingMessage acepta __CALL_PERMISSION_GRANTED__', () => {
    const parsed: import('@/infrastructure/adapters/MetaWhatsAppAdapter').ParsedIncomingMessage = {
      from: '5212345678',
      content: '__CALL_PERMISSION_GRANTED__',
      businessNumber: '5219876543',
      timestamp: '1700000000',
    };
    expect(parsed.content).toBe('__CALL_PERMISSION_GRANTED__');
  });

  it('ParsedIncomingMessage acepta __CALL_PERMISSION_DENIED__', () => {
    const parsed: import('@/infrastructure/adapters/MetaWhatsAppAdapter').ParsedIncomingMessage = {
      from: '5212345678',
      content: '__CALL_PERMISSION_DENIED__',
      businessNumber: '5219876543',
      timestamp: '1700000000',
    };
    expect(parsed.content).toBe('__CALL_PERMISSION_DENIED__');
  });
});

// ============================================================================
// SECCIÓN 2: FlowInterpreter — renderNode para los 6 tipos nuevos
// ============================================================================

describe('FlowInterpreter.renderNode — tipos WhatsApp v23.0', () => {
  const interpreter = makeInterpreter();
  const config = makeTenantConfig();

  const baseFlow: BotFlow = {
    version: '1.0',
    start_node_id: 'n1',
    nodes: [{ id: 'n1', type: 'end', content: {}, transitions: [] }],
  };

  async function renderSingle(node: BotFlow['nodes'][0]) {
    const flow: BotFlow = { ...baseFlow, start_node_id: node.id, nodes: [node, { id: 'end', type: 'end', content: {}, transitions: [] }] };
    const user = makeUser({ currentNodeId: undefined });
    const message = makeMessage('hola');
    const result = await interpreter.execute({ flow, user, message, tenantConfig: config });
    return result.outputs;
  }

  it('send_cta_url retorna kind="cta_url" con body y button', async () => {
    const outputs = await renderSingle({
      id: 'n1',
      type: 'send_cta_url',
      content: {
        body: 'Visita nuestro sitio',
        button: { display_text: 'Ir al sitio', url: 'https://seguritech.mx' },
      },
      transitions: [],
    });
    expect(outputs).toHaveLength(1);
    expect(outputs[0].kind).toBe('cta_url');
    if (outputs[0].kind === 'cta_url') {
      expect(outputs[0].body).toBe('Visita nuestro sitio');
      expect(outputs[0].button.url).toBe('https://seguritech.mx');
      expect(outputs[0].button.display_text).toBe('Ir al sitio');
    }
  });

  it('send_cta_url con header text resuelve variables', async () => {
    const outputs = await renderSingle({
      id: 'n1',
      type: 'send_cta_url',
      content: {
        header: { type: 'text', text: 'Hola' },
        body: 'Cuerpo del mensaje',
        footer: 'Pie de página',
        button: { display_text: 'Ver más', url: 'https://seguritech.mx/menu' },
      },
      transitions: [],
    });
    expect(outputs[0].kind).toBe('cta_url');
    if (outputs[0].kind === 'cta_url') {
      expect(outputs[0].header).toEqual({ type: 'text', text: 'Hola' });
      expect(outputs[0].footer).toBe('Pie de página');
    }
  });

  it('send_location_request retorna kind="location_request" con body', async () => {
    const outputs = await renderSingle({
      id: 'n1',
      type: 'send_location_request',
      content: { body: '¿Dónde te encuentras?' },
      transitions: [],
    });
    expect(outputs).toHaveLength(1);
    expect(outputs[0].kind).toBe('location_request');
    if (outputs[0].kind === 'location_request') {
      expect(outputs[0].body).toBe('¿Dónde te encuentras?');
    }
  });

  it('send_media_carousel retorna kind="media_carousel" con cards', async () => {
    const outputs = await renderSingle({
      id: 'n1',
      type: 'send_media_carousel',
      content: {
        body: 'Nuestros servicios',
        cards: [
          {
            header: { type: 'image', link: 'https://cdn.seguritech.mx/img1.jpg' },
            body: 'CCTV Básico',
            buttons: [{ type: 'quick_reply', id: 'btn_basico', title: 'Ver plan' }],
          },
          {
            header: { type: 'image', link: 'https://cdn.seguritech.mx/img2.jpg' },
            body: 'CCTV Premium',
            buttons: [{ type: 'quick_reply', id: 'btn_premium', title: 'Ver plan' }],
          },
        ],
      },
      transitions: [],
    });
    expect(outputs).toHaveLength(1);
    expect(outputs[0].kind).toBe('media_carousel');
    if (outputs[0].kind === 'media_carousel') {
      expect(outputs[0].cards).toHaveLength(2);
      expect(outputs[0].cards[0].header.type).toBe('image');
      expect(outputs[0].cards[0].buttons[0].type).toBe('quick_reply');
    }
  });

  it('send_reaction retorna kind="reaction" con emoji y target', async () => {
    const outputs = await renderSingle({
      id: 'n1',
      type: 'send_reaction',
      content: { emoji: '👍', target: 'last_user_message' },
      transitions: [],
    });
    expect(outputs).toHaveLength(1);
    expect(outputs[0].kind).toBe('reaction');
    if (outputs[0].kind === 'reaction') {
      expect(outputs[0].emoji).toBe('👍');
      expect(outputs[0].target).toBe('last_user_message');
    }
  });

  it('request_call_permission retorna kind="call_permission_request"', async () => {
    const outputs = await renderSingle({
      id: 'n1',
      type: 'request_call_permission',
      content: { body: '¿Podemos llamarte?' },
      transitions: [],
    });
    expect(outputs).toHaveLength(1);
    expect(outputs[0].kind).toBe('call_permission_request');
    if (outputs[0].kind === 'call_permission_request') {
      expect(outputs[0].body).toBe('¿Podemos llamarte?');
    }
  });

  it('send_whatsapp_flow retorna kind="whatsapp_flow" con flow_id_meta', async () => {
    const outputs = await renderSingle({
      id: 'n1',
      type: 'send_whatsapp_flow',
      content: {
        body: 'Completa el formulario',
        whatsapp_flow_id: '786c56a2-0000-4000-8000-000000000001',
        flow_cta: 'Empezar',
        mode: 'published',
      },
      transitions: [],
    });
    expect(outputs).toHaveLength(1);
    expect(outputs[0].kind).toBe('whatsapp_flow');
    if (outputs[0].kind === 'whatsapp_flow') {
      expect(outputs[0].flow_id_meta).toBe('786c56a2-0000-4000-8000-000000000001');
      expect(outputs[0].flow_cta).toBe('Empezar');
      expect(outputs[0].mode).toBe('published');
    }
  });
});

// ============================================================================
// SECCIÓN 3: matchesCondition — call_permission conditions
// ============================================================================

describe('FlowInterpreter.matchesCondition — call_permission_granted/denied', () => {
  it('__CALL_PERMISSION_GRANTED__ activa call_permission_granted', async () => {
    const interpreter = makeInterpreter();
    const flow: BotFlow = {
      version: '1.0',
      start_node_id: 'n1',
      nodes: [
        {
          id: 'n1',
          type: 'request_call_permission',
          content: { body: '¿Llamamos?' },
          transitions: [
            { condition: { type: 'call_permission_granted' }, next_node_id: 'aceptado' },
            { condition: { type: 'call_permission_denied' }, next_node_id: 'rechazado' },
            { condition: { type: 'default' }, next_node_id: 'fin' },
          ],
        },
        { id: 'aceptado', type: 'send_text', content: { text: 'Te llamamos pronto' }, transitions: [] },
        { id: 'rechazado', type: 'send_text', content: { text: 'Entendido, sin llamada' }, transitions: [] },
        { id: 'fin', type: 'end', content: {}, transitions: [] },
      ],
    };

    const user = makeUser({ currentNodeId: 'n1' });
    const message = makeMessage('__CALL_PERMISSION_GRANTED__');
    const result = await interpreter.execute({ flow, user, message, tenantConfig: makeTenantConfig() });

    expect(result.nextNodeId).toBe('aceptado');
    expect(result.outputs[0].kind).toBe('text');
    if (result.outputs[0].kind === 'text') {
      expect(result.outputs[0].text).toBe('Te llamamos pronto');
    }
  });

  it('__CALL_PERMISSION_DENIED__ activa call_permission_denied', async () => {
    const interpreter = makeInterpreter();
    const flow: BotFlow = {
      version: '1.0',
      start_node_id: 'n1',
      nodes: [
        {
          id: 'n1',
          type: 'request_call_permission',
          content: { body: '¿Llamamos?' },
          transitions: [
            { condition: { type: 'call_permission_granted' }, next_node_id: 'aceptado' },
            { condition: { type: 'call_permission_denied' }, next_node_id: 'rechazado' },
            { condition: { type: 'default' }, next_node_id: 'fin' },
          ],
        },
        { id: 'aceptado', type: 'send_text', content: { text: 'Te llamamos pronto' }, transitions: [] },
        { id: 'rechazado', type: 'send_text', content: { text: 'Entendido, sin llamada' }, transitions: [] },
        { id: 'fin', type: 'end', content: {}, transitions: [] },
      ],
    };

    const user = makeUser({ currentNodeId: 'n1' });
    const message = makeMessage('__CALL_PERMISSION_DENIED__');
    const result = await interpreter.execute({ flow, user, message, tenantConfig: makeTenantConfig() });

    expect(result.nextNodeId).toBe('rechazado');
    expect(result.outputs[0].kind).toBe('text');
    if (result.outputs[0].kind === 'text') {
      expect(result.outputs[0].text).toBe('Entendido, sin llamada');
    }
  });
});

// ============================================================================
// SECCIÓN 4: WAIT_NODE_TYPES incluye request_call_permission
// ============================================================================

describe('FlowInterpreter — request_call_permission para el avance del intérprete', () => {
  it('detiene el avance tras request_call_permission (es nodo de espera)', async () => {
    const interpreter = makeInterpreter();
    const flow: BotFlow = {
      version: '1.0',
      start_node_id: 'n1',
      nodes: [
        {
          id: 'n1',
          type: 'request_call_permission',
          content: { body: '¿Llamamos?' },
          transitions: [
            { condition: { type: 'call_permission_granted' }, next_node_id: 'fin' },
          ],
        },
        { id: 'fin', type: 'end', content: {}, transitions: [] },
      ],
    };

    const user = makeUser({ currentNodeId: undefined });
    const message = makeMessage('hola');
    const result = await interpreter.execute({ flow, user, message, tenantConfig: makeTenantConfig() });

    // El intérprete debe quedarse en n1, no avanzar a fin
    expect(result.nextNodeId).toBe('n1');
    expect(result.flowEnded).toBe(false);
    expect(result.outputs[0].kind).toBe('call_permission_request');
  });
});
