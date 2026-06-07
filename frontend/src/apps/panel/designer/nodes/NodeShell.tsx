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
  const Icon = meta.icon;

  return (
    <div
      className={cn(
        'w-60 overflow-hidden rounded-lg border border-border/70 bg-card text-xs shadow-node transition-shadow',
        isStart && 'ring-2 ring-primary/70 ring-offset-2 ring-offset-background',
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        id={TARGET_HANDLE_ID}
        className="!h-2.5 !w-2.5 !border-2 !border-white !bg-slate-400 transition-colors hover:!bg-slate-600"
      />

      <div
        className={cn(
          'flex items-center gap-1.5 px-2.5 py-1.5 font-medium text-white',
          meta.header,
        )}
      >
        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="truncate">{meta.label}</span>
        {isStart && (
          <span className="ml-auto rounded bg-white/25 px-1 text-[10px] font-semibold tracking-wide">
            START
          </span>
        )}
      </div>

      <div className="px-2.5 py-2">
        <p className="mb-1.5 truncate font-mono text-[10px] text-muted-foreground">
          {node.id}
        </p>
        <div className="leading-snug text-foreground">{children}</div>
      </div>

      {handles.length > 0 && (
        <div className="flex flex-col gap-0.5 border-t border-border/70 bg-muted/30 px-2.5 py-1.5">
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
          className="!h-2.5 !w-2.5 !border-2 !border-white !bg-slate-500 transition-colors hover:!bg-slate-700"
        />
      ))}
    </div>
  );
}
