import { Handle, Position } from '@xyflow/react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { NODE_META } from './node-meta';
import { TARGET_HANDLE_ID, type DesignerNodeData } from '../mapping/rf-types';

/**
 * Caparazón visual compartido por los 7 nodos custom. Renderiza:
 *  - un target handle (entrada, arriba),
 *  - header con color por tipo + badge START si es el start_node,
 *  - el preview del content (children, lo aporta cada nodo),
 *  - la lista de salidas (labels de los handles) y un source handle por cada
 *    transición, repartidos en el borde inferior.
 */
export function NodeShell({
  data,
  children,
}: {
  data: DesignerNodeData;
  children?: ReactNode;
}) {
  const { node, isStart, handles } = data;
  const meta = NODE_META[node.type];

  return (
    <div
      className={cn(
        'w-60 rounded-md border bg-card text-xs shadow-sm',
        isStart && 'ring-2 ring-primary ring-offset-1',
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        id={TARGET_HANDLE_ID}
        className="!h-2 !w-2 !bg-slate-400"
      />

      <div
        className={cn(
          'flex items-center justify-between rounded-t-md px-2 py-1 font-medium text-white',
          meta.header,
        )}
      >
        <span>{meta.label}</span>
        {isStart && (
          <span className="rounded bg-white/25 px-1 text-[10px] font-semibold tracking-wide">
            START
          </span>
        )}
      </div>

      <div className="px-2 py-1.5">
        <p className="mb-1 truncate font-mono text-[10px] text-muted-foreground">
          {node.id}
        </p>
        <div className="text-foreground">{children}</div>
      </div>

      {handles.length > 0 && (
        <div className="flex flex-col gap-0.5 border-t px-2 py-1">
          {handles.map((h) => (
            <div key={h.id} className="truncate text-[10px] text-muted-foreground">
              ↳ {h.label}
            </div>
          ))}
        </div>
      )}

      {handles.map((h, i) => (
        <Handle
          key={h.id}
          type="source"
          position={Position.Bottom}
          id={h.id}
          style={{ left: `${((i + 1) / (handles.length + 1)) * 100}%` }}
          className="!h-2 !w-2 !bg-slate-500"
        />
      ))}
    </div>
  );
}
