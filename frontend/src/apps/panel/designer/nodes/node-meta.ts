import type { FlowNodeType } from '../flow-types';

/**
 * Metadatos visuales por tipo de nodo.
 *
 * Paleta de colores:
 *   Originales (7): send_text morado · send_buttons azul · send_list verde ·
 *   send_media gris · wait_input naranja · escape_to_human rojo · end neutro.
 *
 *   v23.0 (6): send_cta_url índigo · send_location_request cian ·
 *   send_media_carousel violeta · send_reaction amarillo ·
 *   request_call_permission rosa · send_whatsapp_flow esmeralda.
 */
export const NODE_META: Record<FlowNodeType, { label: string; header: string }> = {
  // — Originales —
  send_text:         { label: 'Enviar texto',      header: 'bg-purple-500' },
  send_buttons:      { label: 'Botones',            header: 'bg-blue-500' },
  send_list:         { label: 'Lista',              header: 'bg-green-600' },
  send_media:        { label: 'Media',              header: 'bg-gray-500' },
  wait_input:        { label: 'Esperar input',      header: 'bg-orange-500' },
  escape_to_human:   { label: 'Escalar a humano',   header: 'bg-red-500' },
  end:               { label: 'Fin',                header: 'bg-neutral-400' },
  // — WhatsApp v23.0 —
  send_cta_url:           { label: 'CTA URL',           header: 'bg-indigo-500' },
  send_location_request:  { label: 'Pedir ubicación',   header: 'bg-cyan-600' },
  send_media_carousel:    { label: 'Carrusel',          header: 'bg-violet-500' },
  send_reaction:          { label: 'Reacción',          header: 'bg-yellow-500' },
  request_call_permission:{ label: 'Permiso llamada',   header: 'bg-pink-500' },
  send_whatsapp_flow:     { label: 'WA Flow',           header: 'bg-emerald-600' },
};
