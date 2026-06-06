import type { NodeProps, NodeTypes } from '@xyflow/react';
import { NodeShell } from './NodeShell';
import type { DesignerRFNode } from '../mapping/rf-types';

/**
 * Los 7 nodos custom del designer. Cada uno renderiza el `NodeShell` común con
 * un preview corto y type-safe de su `content`. La derivación de handles vive
 * en el mapping; aquí solo se pinta.
 */

function Empty({ children }: { children?: React.ReactNode }) {
  return children ? <>{children}</> : <em className="text-muted-foreground">(vacío)</em>;
}

export function SendTextNode({ data }: NodeProps<DesignerRFNode>) {
  const { node } = data;
  const text = node.type === 'send_text' ? node.content.text : '';
  return (
    <NodeShell data={data}>
      <p className="line-clamp-3">{<Empty>{text}</Empty>}</p>
    </NodeShell>
  );
}

export function SendButtonsNode({ data }: NodeProps<DesignerRFNode>) {
  const { node } = data;
  if (node.type !== 'send_buttons') return <NodeShell data={data} />;
  return (
    <NodeShell data={data}>
      <p className="line-clamp-2">{<Empty>{node.content.text}</Empty>}</p>
      <p className="mt-1 text-[10px] text-muted-foreground">
        {node.content.buttons.length} botón(es)
      </p>
    </NodeShell>
  );
}

export function SendListNode({ data }: NodeProps<DesignerRFNode>) {
  const { node } = data;
  if (node.type !== 'send_list') return <NodeShell data={data} />;
  return (
    <NodeShell data={data}>
      <p className="line-clamp-2">{<Empty>{node.content.text}</Empty>}</p>
      <p className="mt-1 text-[10px] text-muted-foreground">
        botón: {node.content.button_label} · {node.content.sections.length} sección(es)
      </p>
    </NodeShell>
  );
}

export function SendMediaNode({ data }: NodeProps<DesignerRFNode>) {
  const { node } = data;
  if (node.type !== 'send_media') return <NodeShell data={data} />;
  const c = node.content;
  const detail =
    c.media_type === 'location'
      ? `${c.name ?? `${c.latitude}, ${c.longitude}`}`
      : c.media_type === 'document'
        ? c.filename
        : c.url;
  return (
    <NodeShell data={data}>
      <p className="text-[11px] font-medium">{c.media_type}</p>
      <p className="line-clamp-2 break-all text-[10px] text-muted-foreground">{detail}</p>
    </NodeShell>
  );
}

export function WaitInputNode({ data }: NodeProps<DesignerRFNode>) {
  const { node } = data;
  if (node.type !== 'wait_input') return <NodeShell data={data} />;
  return (
    <NodeShell data={data}>
      <p className="line-clamp-2">{<Empty>{node.content.prompt}</Empty>}</p>
      {node.content.save_to_context && (
        <p className="mt-1 text-[10px] text-muted-foreground">
          → {node.content.save_to_context}
        </p>
      )}
    </NodeShell>
  );
}

export function EscapeToHumanNode({ data }: NodeProps<DesignerRFNode>) {
  const { node } = data;
  if (node.type !== 'escape_to_human') return <NodeShell data={data} />;
  return (
    <NodeShell data={data}>
      <p className="line-clamp-2">{<Empty>{node.content.user_response}</Empty>}</p>
      <p className="mt-1 text-[10px] text-muted-foreground">🔔 alerta al dueño</p>
    </NodeShell>
  );
}

export function EndNode({ data }: NodeProps<DesignerRFNode>) {
  return (
    <NodeShell data={data}>
      <p className="text-muted-foreground">Fin de la conversación</p>
    </NodeShell>
  );
}

export function SendCtaUrlNode({ data }: NodeProps<DesignerRFNode>) {
  const { node } = data;
  if (node.type !== 'send_cta_url') return <NodeShell data={data} />;
  return (
    <NodeShell data={data}>
      <p className="line-clamp-2">{node.content.body || <Empty />}</p>
      <p className="mt-1 text-[10px] text-muted-foreground truncate">
        🔗 {node.content.button.display_text} → {node.content.button.url}
      </p>
    </NodeShell>
  );
}

export function SendLocationRequestNode({ data }: NodeProps<DesignerRFNode>) {
  const { node } = data;
  if (node.type !== 'send_location_request') return <NodeShell data={data} />;
  return (
    <NodeShell data={data}>
      <p className="line-clamp-3">{node.content.body || <Empty />}</p>
    </NodeShell>
  );
}

export function SendMediaCarouselNode({ data }: NodeProps<DesignerRFNode>) {
  const { node } = data;
  if (node.type !== 'send_media_carousel') return <NodeShell data={data} />;
  return (
    <NodeShell data={data}>
      <p className="line-clamp-2">{node.content.body || <Empty />}</p>
      <p className="mt-1 text-[10px] text-muted-foreground">
        {node.content.cards.length} card(s)
      </p>
    </NodeShell>
  );
}

export function SendReactionNode({ data }: NodeProps<DesignerRFNode>) {
  const { node } = data;
  if (node.type !== 'send_reaction') return <NodeShell data={data} />;
  return (
    <NodeShell data={data}>
      <p className="text-2xl">{node.content.emoji || <Empty />}</p>
      <p className="text-[10px] text-muted-foreground">→ último mensaje</p>
    </NodeShell>
  );
}

export function RequestCallPermissionNode({ data }: NodeProps<DesignerRFNode>) {
  const { node } = data;
  if (node.type !== 'request_call_permission') return <NodeShell data={data} />;
  return (
    <NodeShell data={data}>
      <p className="line-clamp-2">{node.content.body || <Empty />}</p>
      {node.content.footer && (
        <p className="mt-1 text-[10px] text-muted-foreground truncate">
          {node.content.footer}
        </p>
      )}
    </NodeShell>
  );
}

export function SendWhatsappFlowNode({ data }: NodeProps<DesignerRFNode>) {
  const { node } = data;
  if (node.type !== 'send_whatsapp_flow') return <NodeShell data={data} />;
  return (
    <NodeShell data={data}>
      <p className="line-clamp-2">{node.content.body || <Empty />}</p>
      <p className="mt-1 text-[10px] text-muted-foreground">
        CTA: {node.content.flow_cta} · {node.content.mode}
      </p>
    </NodeShell>
  );
}

/** Registro consumido por <ReactFlow nodeTypes={...} />. */
export const nodeTypes = {
  send_text:                SendTextNode,
  send_buttons:             SendButtonsNode,
  send_list:                SendListNode,
  send_media:               SendMediaNode,
  wait_input:               WaitInputNode,
  escape_to_human:          EscapeToHumanNode,
  end:                      EndNode,
  send_cta_url:             SendCtaUrlNode,
  send_location_request:    SendLocationRequestNode,
  send_media_carousel:      SendMediaCarouselNode,
  send_reaction:            SendReactionNode,
  request_call_permission:  RequestCallPermissionNode,
  send_whatsapp_flow:       SendWhatsappFlowNode,
} satisfies NodeTypes;
