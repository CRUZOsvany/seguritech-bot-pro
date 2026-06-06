import type { FlowNodeType } from '../flow-types';

/**
 * Metadatos visuales por tipo de nodo. El color del header es el código de
 * color que pide la Fase 3:
 *   send_text morado · send_buttons azul · send_list verde · send_media gris ·
 *   wait_input naranja · escape_to_human rojo · end neutro.
 */
export const NODE_META: Record<FlowNodeType, { label: string; header: string }> = {
  send_text: { label: 'Enviar texto', header: 'bg-purple-500' },
  send_buttons: { label: 'Botones', header: 'bg-blue-500' },
  send_list: { label: 'Lista', header: 'bg-green-600' },
  send_media: { label: 'Media', header: 'bg-gray-500' },
  wait_input: { label: 'Esperar input', header: 'bg-orange-500' },
  escape_to_human: { label: 'Escalar a humano', header: 'bg-red-500' },
  end: { label: 'Fin', header: 'bg-neutral-400' },
};
