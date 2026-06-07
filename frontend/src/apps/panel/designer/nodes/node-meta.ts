import type { LucideIcon } from 'lucide-react';
import {
  Type, MousePointerClick, List, Image, Keyboard, Headset, Flag,
  ExternalLink, MapPin, Images, Smile, Phone, Workflow,
} from 'lucide-react';
import type { FlowNodeType } from '../flow-types';

/**
 * Metadatos visuales por tipo de nodo. Texto del header siempre blanco.
 *
 * Todas las entradas (originales + v23.0) usan tokens de marca --color-node-*
 * de globals.css (Tailwind 4 genera las utilidades bg-node-*). UNA sola fuente,
 * consumida por node-meta, NodeShell, el Inspector y el MiniMap.
 */
export const NODE_META: Record<
  FlowNodeType,
  { label: string; header: string; icon: LucideIcon }
> = {
  // — Originales —
  send_text:       { label: 'Enviar texto',     header: 'bg-node-text',    icon: Type },
  send_buttons:    { label: 'Botones',          header: 'bg-node-buttons', icon: MousePointerClick },
  send_list:       { label: 'Lista',            header: 'bg-node-list',    icon: List },
  send_media:      { label: 'Media',            header: 'bg-node-media',   icon: Image },
  wait_input:      { label: 'Esperar input',    header: 'bg-node-wait',    icon: Keyboard },
  escape_to_human: { label: 'Escalar a humano', header: 'bg-node-escape',  icon: Headset },
  end:             { label: 'Fin',              header: 'bg-node-end',     icon: Flag },
  // — WhatsApp v23.0 —
  send_cta_url:            { label: 'CTA URL',         header: 'bg-node-cta',      icon: ExternalLink },
  send_location_request:   { label: 'Pedir ubicación', header: 'bg-node-location', icon: MapPin },
  send_media_carousel:     { label: 'Carrusel',        header: 'bg-node-carousel', icon: Images },
  send_reaction:           { label: 'Reacción',        header: 'bg-node-reaction', icon: Smile },
  request_call_permission: { label: 'Permiso llamada', header: 'bg-node-call',     icon: Phone },
  send_whatsapp_flow:      { label: 'WA Flow',         header: 'bg-node-flow',     icon: Workflow },
};
