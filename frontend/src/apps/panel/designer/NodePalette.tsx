import { NODE_META } from './nodes/node-meta';
import type { FlowNodeType } from './flow-types';
import { cn } from '@/lib/utils';

/**
 * Paleta lateral de tipos de nodo arrastrables al canvas.
 *
 * Drag-and-drop: al iniciar el drag, guarda `{ type }` en dataTransfer.
 * El canvas lo recoge en su handler `onDrop` y llama `addNode`.
 *
 * Categorías visuales:
 *   Básicos      — send_text, send_buttons, send_list, send_media
 *   Control      — wait_input, escape_to_human, end
 *   WhatsApp v23 — send_cta_url, send_location_request, send_media_carousel,
 *                  send_reaction, request_call_permission, send_whatsapp_flow
 */

const CATEGORIES: { label: string; types: FlowNodeType[] }[] = [
  {
    label: 'Básicos',
    types: ['send_text', 'send_buttons', 'send_list', 'send_media'],
  },
  {
    label: 'Control',
    types: ['wait_input', 'escape_to_human', 'end'],
  },
  {
    label: 'WhatsApp v23',
    types: [
      'send_cta_url',
      'send_location_request',
      'send_media_carousel',
      'send_reaction',
      'request_call_permission',
      'send_whatsapp_flow',
    ],
  },
];

export function NodePalette() {
  function onDragStart(e: React.DragEvent, type: FlowNodeType) {
    e.dataTransfer.setData('application/seguritech-node', JSON.stringify({ type }));
    e.dataTransfer.effectAllowed = 'move';
  }

  return (
    <div className="flex flex-col gap-3 overflow-y-auto rounded-md border p-2 text-xs">
      <p className="font-semibold text-muted-foreground uppercase tracking-wide px-1">
        Nodos
      </p>
      {CATEGORIES.map((cat) => (
        <div key={cat.label} className="flex flex-col gap-1">
          <p className="px-1 text-[10px] font-medium text-muted-foreground">{cat.label}</p>
          {cat.types.map((type) => {
            const meta = NODE_META[type];
            return (
              <div
                key={type}
                draggable
                onDragStart={(e) => onDragStart(e, type)}
                className={cn(
                  'flex cursor-grab items-center gap-2 rounded-md px-2 py-1.5',
                  'border border-transparent hover:border-border hover:bg-muted/50',
                  'active:cursor-grabbing select-none',
                )}
              >
                <div className={cn('h-2.5 w-2.5 rounded-sm flex-shrink-0', meta.header)} />
                <span className="truncate">{meta.label}</span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
