import { useEffect, useMemo } from 'react';
import { createLazyRoute, Link } from '@tanstack/react-router';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type NodeMouseHandler,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { ArrowLeft, Loader2, Save, Send } from 'lucide-react';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { Badge } from '@/shared/ui/badge';
import { Alert, AlertDescription } from '@/shared/ui/alert';
import { Textarea } from '@/shared/ui/textarea';
import { Label } from '@/shared/ui/label';
import { ApiError } from '@/shared/api/client';
import type { PublishErrorBody } from '@/shared/api/flows';
import { useFlows, useDraft, useSaveDraft, usePublish } from '../hooks/use-flows';
import { useDesignerStore } from '../designer/store/designer-store';
import { nodeTypes } from '../designer/nodes';
import { NODE_META } from '../designer/nodes/node-meta';
import { EMPTY_FLOW, isBotFlowish, type FlowNode } from '../designer/flow-types';
import type { DesignerRFNode } from '../designer/mapping/rf-types';

function DesignerPage() {
  const { id } = Route.useParams();

  const flowsQ = useFlows(id);
  // DEC-1: el designer mira UN flow del tenant (preferimos el de WhatsApp).
  const flow = useMemo(() => {
    const flows = flowsQ.data;
    if (!flows || flows.length === 0) return undefined;
    return flows.find((f) => f.channel === 'whatsapp') ?? flows[0];
  }, [flowsQ.data]);
  const flowId = flow?.id ?? null;

  const draftQ = useDraft(id, flowId);

  const loadFromBotFlow = useDesignerStore((s) => s.loadFromBotFlow);
  const reset = useDesignerStore((s) => s.reset);

  // Cargar el draft al canvas cuando llega (o flow vacío si no hay draft).
  useEffect(() => {
    if (!flowId || !draftQ.isSuccess) return;
    const raw = draftQ.data;
    loadFromBotFlow(isBotFlowish(raw) ? raw : EMPTY_FLOW, flowId);
  }, [flowId, draftQ.isSuccess, draftQ.data, loadFromBotFlow]);

  // Limpiar el store al desmontar para no arrastrar estado entre tenants.
  useEffect(() => () => reset(), [reset]);

  if (flowsQ.isLoading) {
    return <div className="p-4 text-sm text-muted-foreground">Cargando flows…</div>;
  }
  if (flowsQ.error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>No se pudieron cargar los flows del cliente.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Button asChild variant="ghost" size="sm" className="self-start">
        <Link to="/tenants/$id/whatsapp" params={{ id }}>
          <ArrowLeft className="mr-1 h-3 w-3" /> Volver a WhatsApp
        </Link>
      </Button>

      {!flow ? (
        <EmptyState id={id} />
      ) : (
        <DesignerCanvas tenantId={id} flowId={flow.id} flowName={flow.nombre} />
      )}
    </div>
  );
}

function EmptyState({ id }: { id: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Bot Designer</CardTitle>
        <CardDescription>Este cliente todavía no tiene un flujo.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-start gap-3">
        <Alert>
          <AlertDescription>
            Asigna un molde primero desde la pantalla de WhatsApp. El designer
            edita el flujo existente; en esta versión no se crea uno desde cero.
          </AlertDescription>
        </Alert>
        <Button asChild size="sm" variant="outline">
          <Link to="/tenants/$id/whatsapp" params={{ id }}>Ir a asignar molde</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function DesignerCanvas({
  tenantId, flowId, flowName,
}: { tenantId: string; flowId: string; flowName: string }) {
  const nodes = useDesignerStore((s) => s.nodes);
  const edges = useDesignerStore((s) => s.edges);
  const onNodesChange = useDesignerStore((s) => s.onNodesChange);
  const onEdgesChange = useDesignerStore((s) => s.onEdgesChange);
  const setSelected = useDesignerStore((s) => s.setSelected);
  const dirty = useDesignerStore((s) => s.dirty);
  const toBotFlow = useDesignerStore((s) => s.toBotFlow);

  const save = useSaveDraft(tenantId);
  const publish = usePublish(tenantId);

  const onNodeClick: NodeMouseHandler<DesignerRFNode> = (_e, node) => setSelected(node.id);

  const publishIssues =
    publish.error instanceof ApiError
      ? ((publish.error.body as PublishErrorBody | undefined)?.issues ?? null)
      : null;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <div>
          <CardTitle className="text-base">Bot Designer · {flowName}</CardTitle>
          <CardDescription>
            Visualiza y edita el flujo. dagre posiciona los nodos; los arrastres
            no se guardan (V1).
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          {dirty && <Badge variant="outline">cambios sin guardar</Badge>}
          {save.isSuccess && !dirty && (
            <span className="text-xs text-emerald-600">Guardado ✓</span>
          )}
          <Button
            size="sm"
            variant="outline"
            disabled={save.isPending}
            onClick={() => save.mutate({ flowId, flow: toBotFlow() })}
          >
            {save.isPending ? (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            ) : (
              <Save className="mr-1 h-3 w-3" />
            )}
            Guardar draft
          </Button>
          <Button
            size="sm"
            disabled={publish.isPending}
            onClick={() => publish.mutate({ flowId })}
          >
            {publish.isPending ? (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            ) : (
              <Send className="mr-1 h-3 w-3" />
            )}
            Publicar
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {save.error instanceof ApiError && (
          <Alert variant="destructive">
            <AlertDescription>Error al guardar: {save.error.message}</AlertDescription>
          </Alert>
        )}
        {publish.isSuccess && (
          <Alert>
            <AlertDescription>
              Publicado como versión {publish.data.versionNumber}.
            </AlertDescription>
          </Alert>
        )}
        {publish.error instanceof ApiError && (
          <Alert variant="destructive">
            <AlertDescription>
              <p className="font-medium">No se pudo publicar: {publish.error.message}</p>
              {publishIssues && publishIssues.length > 0 && (
                <ul className="mt-1 list-disc pl-5 text-xs">
                  {publishIssues.map((issue, i) => (
                    <li key={i}>
                      {typeof issue === 'string'
                        ? issue
                        : `${issue.path ? `${issue.path}: ` : ''}${issue.message}`}
                    </li>
                  ))}
                </ul>
              )}
            </AlertDescription>
          </Alert>
        )}

        {nodes.length === 0 ? (
          <Alert>
            <AlertDescription>
              El flujo no tiene nodos en el draft. Publica desde un molde asignado
              o edita el draft en una versión futura del designer.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="grid gap-3 lg:grid-cols-[1fr_280px]">
            <div className="h-[70vh] overflow-hidden rounded-md border">
              <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onNodeClick={onNodeClick}
                onPaneClick={() => setSelected(null)}
                fitView
                proOptions={{ hideAttribution: true }}
              >
                <Background />
                <Controls />
                <MiniMap pannable zoomable />
              </ReactFlow>
            </div>
            <Inspector />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Inspector mínimo (Fase 5): al seleccionar un nodo, edita su campo de texto
 * principal vía updateNodeContent. Sin agregar/borrar nodos (eso es A2.2).
 */
function Inspector() {
  const selectedId = useDesignerStore((s) => s.selectedId);
  const nodes = useDesignerStore((s) => s.nodes);
  const updateNodeContent = useDesignerStore((s) => s.updateNodeContent);

  const selected = nodes.find((n) => n.id === selectedId);

  if (!selected) {
    return (
      <div className="rounded-md border p-3 text-xs text-muted-foreground">
        Selecciona un nodo para editar su texto.
      </div>
    );
  }

  const node = selected.data.node;
  const field = mainTextField(node);

  return (
    <div className="flex flex-col gap-2 rounded-md border p-3">
      <div className="flex items-center justify-between">
        <Badge className={`${NODE_META[node.type].header} text-white`}>
          {NODE_META[node.type].label}
        </Badge>
        <code className="text-[10px] text-muted-foreground">{node.id}</code>
      </div>
      {field ? (
        <div className="flex flex-col gap-1">
          <Label htmlFor="node-text" className="text-xs">{field.label}</Label>
          <Textarea
            id="node-text"
            rows={5}
            value={field.value}
            onChange={(e) =>
              updateNodeContent(node.id, { [field.key]: e.target.value })
            }
          />
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Este tipo de nodo no tiene texto editable aquí (se completa en A2.2).
        </p>
      )}
    </div>
  );
}

/** Devuelve el campo de texto principal editable de un nodo, o null. */
function mainTextField(
  node: FlowNode,
): { key: string; label: string; value: string } | null {
  switch (node.type) {
    case 'send_text':
      return { key: 'text', label: 'Texto', value: node.content.text };
    case 'send_buttons':
      return { key: 'text', label: 'Texto', value: node.content.text };
    case 'send_list':
      return { key: 'text', label: 'Texto', value: node.content.text };
    case 'wait_input':
      return { key: 'prompt', label: 'Prompt', value: node.content.prompt ?? '' };
    case 'escape_to_human':
      return { key: 'user_response', label: 'Respuesta al usuario', value: node.content.user_response };
    default:
      return null;
  }
}

export const Route = createLazyRoute('/_authed/tenants/$id/designer')({
  component: DesignerPage,
});
