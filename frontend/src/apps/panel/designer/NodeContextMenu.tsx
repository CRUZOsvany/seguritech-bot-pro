import { useEffect, useRef } from 'react';
import { useDesignerStore } from './store/designer-store';

/**
 * Menú contextual que aparece al hacer click derecho en un nodo del canvas.
 * Se posiciona absolutamente en las coordenadas del evento.
 * Se cierra al hacer click fuera o al presionar Escape.
 */
export interface ContextMenuState {
  x: number;
  y: number;
  nodeId: string;
}

export function NodeContextMenu({
  menu,
  onClose,
}: {
  menu: ContextMenuState;
  onClose: () => void;
}) {
  const deleteNode = useDesignerStore((s) => s.deleteNode);
  const setStartNode = useDesignerStore((s) => s.setStartNode);
  const startNodeId = useDesignerStore((s) => s.startNodeId);
  const ref = useRef<HTMLDivElement>(null);

  const isAlreadyStart = startNodeId === menu.nodeId;

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('keydown', handleKey);
    document.addEventListener('mousedown', handleClick);
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.removeEventListener('mousedown', handleClick);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute z-50 min-w-36 rounded-md border bg-popover shadow-md text-xs py-1"
      style={{ top: menu.y, left: menu.x }}
    >
      {!isAlreadyStart && (
        <button
          className="w-full px-3 py-1.5 text-left hover:bg-muted"
          onClick={() => { setStartNode(menu.nodeId); onClose(); }}
        >
          ⭐ Marcar como START
        </button>
      )}
      <button
        className="w-full px-3 py-1.5 text-left text-red-600 hover:bg-muted"
        onClick={() => { deleteNode(menu.nodeId); onClose(); }}
      >
        🗑 Eliminar nodo
      </button>
    </div>
  );
}
