/**
 * Tests de los 6 tipos de nodo WhatsApp v23.0 (Prompt 2), refactorizados al
 * patrón unificado del Prompt 2.5: id + content + transitions[] (igual que los
 * 7 originales). Se valida a nivel NODO contra FlowNodeSchema un caso válido +
 * uno o más inválidos por tipo.
 *
 * El último describe valida el FlowSchema COMPLETO para demostrar que el crash
 * latente del Prompt 2 (superRefine iterando node.transitions) quedó cerrado:
 * todos los tipos ahora tienen transitions[].
 */

import { describe, expect, it } from '@jest/globals';
import { FlowNodeSchema, FlowSchema } from '@/domain/validators/flowSchema';

describe('FlowNodeSchema — tipos WhatsApp v23.0 (Prompt 2)', () => {
  describe('send_cta_url', () => {
    it('acepta un nodo válido con header text', () => {
      const result = FlowNodeSchema.safeParse({
        id: 'cta_1',
        type: 'send_cta_url',
        content: {
          header: { type: 'text', text: 'Visítanos' },
          body: 'Conoce nuestros planes de cámaras',
          footer: 'SECURITECH',
          button: {
            display_text: 'Ver planes',
            url: 'https://seguritech.mx/planes',
          },
        },
        transitions: [],
      });
      expect(result.success).toBe(true);
    });

    it('rechaza display_text de más de 20 chars', () => {
      const result = FlowNodeSchema.safeParse({
        id: 'cta_1',
        type: 'send_cta_url',
        content: {
          body: 'body válido',
          button: {
            display_text: 'Este texto es claramente mayor a veinte chars',
            url: 'https://example.com',
          },
        },
        transitions: [],
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((i) => i.path.includes('display_text'))).toBe(true);
      }
    });

    it('rechaza url sin https://', () => {
      const result = FlowNodeSchema.safeParse({
        id: 'cta_1',
        type: 'send_cta_url',
        content: {
          body: 'body válido',
          button: { display_text: 'Ir', url: 'http://example.com' },
        },
        transitions: [],
      });
      expect(result.success).toBe(false);
    });
  });

  describe('send_location_request', () => {
    it('acepta un nodo válido', () => {
      const result = FlowNodeSchema.safeParse({
        id: 'loc_1',
        type: 'send_location_request',
        content: {
          body: 'Compárteme tu ubicación para enviarte al técnico',
        },
        transitions: [{ condition: { type: 'default' }, next_node_id: 'next' }],
      });
      expect(result.success).toBe(true);
    });

    it('rechaza body vacío', () => {
      const result = FlowNodeSchema.safeParse({
        id: 'loc_1',
        type: 'send_location_request',
        content: { body: '' },
        transitions: [],
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((i) => i.path.includes('body'))).toBe(true);
      }
    });

    it('rechaza header presente (Meta no lo permite)', () => {
      const result = FlowNodeSchema.safeParse({
        id: 'loc_1',
        type: 'send_location_request',
        content: {
          body: 'Compárteme tu ubicación',
          header: 'No permitido', // strict() debe rechazar
        },
        transitions: [],
      });
      expect(result.success).toBe(false);
    });
  });

  describe('send_media_carousel', () => {
    it('acepta un carrusel válido con botones quick_reply homogéneos', () => {
      const result = FlowNodeSchema.safeParse({
        id: 'car_1',
        type: 'send_media_carousel',
        content: {
          body: 'Nuestros kits de cámaras',
          cards: [
            {
              header: { type: 'image', link: 'https://cdn.seguritech.mx/kit1.jpg' },
              body: 'Kit básico 4 cámaras',
              buttons: [{ type: 'quick_reply', id: 'kit1', title: 'Quiero este' }],
            },
            {
              header: { type: 'image', link: 'https://cdn.seguritech.mx/kit2.jpg' },
              body: 'Kit pro 8 cámaras',
              buttons: [{ type: 'quick_reply', id: 'kit2', title: 'Quiero este' }],
            },
          ],
        },
        transitions: [
          { condition: { type: 'button', value: 'kit1' }, next_node_id: 'n1' },
          { condition: { type: 'button', value: 'kit2' }, next_node_id: 'n2' },
        ],
      });
      expect(result.success).toBe(true);
    });

    it('rechaza cards array vacío (min 1)', () => {
      const result = FlowNodeSchema.safeParse({
        id: 'car_1',
        type: 'send_media_carousel',
        content: { body: 'body', cards: [] },
        transitions: [],
      });
      expect(result.success).toBe(false);
    });

    it('rechaza mezcla de quick_reply + cta_url entre cards', () => {
      const result = FlowNodeSchema.safeParse({
        id: 'car_1',
        type: 'send_media_carousel',
        content: {
          body: 'body',
          cards: [
            {
              header: { type: 'image', link: 'https://cdn.seguritech.mx/a.jpg' },
              body: 'A',
              buttons: [{ type: 'quick_reply', id: 'a', title: 'A' }],
            },
            {
              header: { type: 'image', link: 'https://cdn.seguritech.mx/b.jpg' },
              body: 'B',
              buttons: [{ type: 'cta_url', display_text: 'Ir', url: 'https://seguritech.mx' }],
            },
          ],
        },
        transitions: [],
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((i) => i.message.includes('mismo tipo de botón'))).toBe(
          true,
        );
      }
    });
  });

  describe('send_reaction', () => {
    it('acepta un emoji válido con target last_user_message', () => {
      const result = FlowNodeSchema.safeParse({
        id: 'rea_1',
        type: 'send_reaction',
        content: { emoji: '✅', target: 'last_user_message' },
        transitions: [],
      });
      expect(result.success).toBe(true);
    });

    it('acepta string vacío (deshacer reacción)', () => {
      const result = FlowNodeSchema.safeParse({
        id: 'rea_1',
        type: 'send_reaction',
        content: { emoji: '', target: 'last_user_message' },
        transitions: [],
      });
      expect(result.success).toBe(true);
    });

    it('acepta emoji compuesto con ZWJ (familia)', () => {
      const result = FlowNodeSchema.safeParse({
        id: 'rea_1',
        type: 'send_reaction',
        content: { emoji: '👨‍👩‍👧', target: 'last_user_message' },
        transitions: [],
      });
      expect(result.success).toBe(true);
    });

    it('rechaza texto plano "ok" como emoji', () => {
      const result = FlowNodeSchema.safeParse({
        id: 'rea_1',
        type: 'send_reaction',
        content: { emoji: 'ok', target: 'last_user_message' },
        transitions: [],
      });
      expect(result.success).toBe(false);
    });

    it('rechaza target distinto a last_user_message', () => {
      const result = FlowNodeSchema.safeParse({
        id: 'rea_1',
        type: 'send_reaction',
        content: { emoji: '👍', target: 'some_message_id' },
        transitions: [],
      });
      expect(result.success).toBe(false);
    });
  });

  describe('request_call_permission', () => {
    it('acepta un nodo válido', () => {
      const result = FlowNodeSchema.safeParse({
        id: 'call_1',
        type: 'request_call_permission',
        content: {
          body: '¿Nos permites llamarte para coordinar la instalación?',
          footer: 'SECURITECH',
        },
        transitions: [{ condition: { type: 'default' }, next_node_id: 'next' }],
      });
      expect(result.success).toBe(true);
    });

    it('rechaza footer de más de 60 chars', () => {
      const result = FlowNodeSchema.safeParse({
        id: 'call_1',
        type: 'request_call_permission',
        content: {
          body: 'body válido',
          footer:
            'Este footer es claramente mucho más largo que el límite de sesenta chars de Meta',
        },
        transitions: [],
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((i) => i.path.includes('footer'))).toBe(true);
      }
    });
  });

  describe('send_whatsapp_flow', () => {
    it('acepta un nodo válido con UUID y mode published', () => {
      const result = FlowNodeSchema.safeParse({
        id: 'wf_1',
        type: 'send_whatsapp_flow',
        content: {
          header: 'Agenda tu visita',
          body: 'Completa el formulario para agendar',
          footer: 'SECURITECH',
          whatsapp_flow_id: '786c56a2-0000-4000-8000-000000000000',
          flow_cta: 'Agendar',
          mode: 'published',
          flow_action: 'navigate',
          flow_action_payload: { screen: 'WELCOME', data: { source: 'bot' } },
        },
        transitions: [],
      });
      expect(result.success).toBe(true);
    });

    it('rechaza whatsapp_flow_id que no es UUID', () => {
      const result = FlowNodeSchema.safeParse({
        id: 'wf_1',
        type: 'send_whatsapp_flow',
        content: {
          body: 'body válido',
          whatsapp_flow_id: 'no-es-uuid',
          flow_cta: 'Agendar',
          mode: 'published',
        },
        transitions: [],
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((i) => i.path.includes('whatsapp_flow_id'))).toBe(true);
      }
    });

    it('rechaza mode con valor distinto a draft/published', () => {
      const result = FlowNodeSchema.safeParse({
        id: 'wf_1',
        type: 'send_whatsapp_flow',
        content: {
          body: 'body válido',
          whatsapp_flow_id: '786c56a2-0000-4000-8000-000000000000',
          flow_cta: 'Agendar',
          mode: 'testing',
        },
        transitions: [],
      });
      expect(result.success).toBe(false);
    });
  });
});

describe('FlowSchema (flow completo) — cierre del crash latente del Prompt 2', () => {
  it('valida un flow con un nodo send_cta_url sin TypeError', () => {
    const result = FlowSchema.safeParse({
      version: '1.0',
      start_node_id: 'cta_1',
      nodes: [
        {
          id: 'cta_1',
          type: 'send_cta_url',
          content: {
            body: 'Visita nuestro sitio',
            button: { display_text: 'Ir', url: 'https://seguritech.mx' },
          },
          transitions: [{ condition: { type: 'default' }, next_node_id: 'end_1' }],
        },
        {
          id: 'end_1',
          type: 'end',
          content: {},
          transitions: [],
        },
      ],
    });
    // No nos importa success vs failure; nos importa que NO crashee.
    expect(result).toBeDefined();
  });

  it('valida un flow mixto (send_text + send_whatsapp_flow + end) sin TypeError', () => {
    const result = FlowSchema.safeParse({
      version: '1.0',
      start_node_id: 'txt_1',
      nodes: [
        {
          id: 'txt_1',
          type: 'send_text',
          content: { text: 'Bienvenido' },
          transitions: [{ condition: { type: 'default' }, next_node_id: 'wf_1' }],
        },
        {
          id: 'wf_1',
          type: 'send_whatsapp_flow',
          content: {
            body: 'Completa el formulario',
            whatsapp_flow_id: '786c56a2-0000-4000-8000-000000000000',
            flow_cta: 'Empezar',
            mode: 'published',
          },
          transitions: [{ condition: { type: 'default' }, next_node_id: 'end_1' }],
        },
        {
          id: 'end_1',
          type: 'end',
          content: {},
          transitions: [],
        },
      ],
    });
    expect(result).toBeDefined();
    // Confirmar que pasa la validación (todas las referencias resuelven).
    expect(result.success).toBe(true);
  });

  it('detecta referencia rota en transitions de un nodo WhatsApp v23.0', () => {
    const result = FlowSchema.safeParse({
      version: '1.0',
      start_node_id: 'cta_1',
      nodes: [
        {
          id: 'cta_1',
          type: 'send_cta_url',
          content: {
            body: 'body',
            button: { display_text: 'Ir', url: 'https://x.com' },
          },
          transitions: [{ condition: { type: 'default' }, next_node_id: 'nodo_inexistente' }],
        },
        { id: 'end_1', type: 'end', content: {}, transitions: [] },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const hasRefError = result.error.issues.some((i) => i.message.includes('nodo_inexistente'));
      expect(hasRefError).toBe(true);
    }
  });
});
