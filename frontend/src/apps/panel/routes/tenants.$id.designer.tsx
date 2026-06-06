import { useEffect, useMemo, type ReactNode } from 'react';
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
import { Input } from '@/shared/ui/input';
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
 * Inspector (Fase 5 / Prompt 5): al seleccionar un nodo, edita sus campos
 * específicos por tipo vía updateNodeContent. Sin agregar/borrar nodos (A2.2).
 */
function Inspector() {
  const selectedId = useDesignerStore((s) => s.selectedId);
  const nodes = useDesignerStore((s) => s.nodes);
  const updateNodeContent = useDesignerStore((s) => s.updateNodeContent);

  const selected = nodes.find((n) => n.id === selectedId);

  if (!selected) {
    return (
      <div className="rounded-md border p-3 text-xs text-muted-foreground">
        Selecciona un nodo para editar su contenido.
      </div>
    );
  }

  const node = selected.data.node;

  return (
    <div className="flex flex-col gap-2 rounded-md border p-3">
      <div className="flex items-center justify-between">
        <Badge className={`${NODE_META[node.type].header} text-white`}>
          {NODE_META[node.type].label}
        </Badge>
        <code className="text-[10px] text-muted-foreground">{node.id}</code>
      </div>
      <NodeInspectorForm node={node} onUpdate={(patch) => updateNodeContent(node.id, patch)} />
    </div>
  );
}

/** Formulario de edición específico por tipo de nodo. */
function NodeInspectorForm({
  node,
  onUpdate,
}: {
  node: FlowNode;
  onUpdate: (patch: Record<string, unknown>) => void;
}) {
  switch (node.type) {
    case 'send_text':
      return (
        <InspField label="Texto">
          <Textarea rows={4} value={node.content.text}
            onChange={(e) => onUpdate({ text: e.target.value })} />
        </InspField>
      );

    case 'send_buttons':
      return (
        <>
          <InspField label="Texto">
            <Textarea rows={3} value={node.content.text}
              onChange={(e) => onUpdate({ text: e.target.value })} />
          </InspField>
          <p className="text-[10px] text-muted-foreground">
            {node.content.buttons.length} botón(es) — editar wireframe en A2.2
          </p>
        </>
      );

    case 'send_list':
      return (
        <>
          <InspField label="Texto">
            <Textarea rows={3} value={node.content.text}
              onChange={(e) => onUpdate({ text: e.target.value })} />
          </InspField>
          <InspField label="Etiqueta del botón">
            <Input value={node.content.button_label}
              onChange={(e) => onUpdate({ button_label: e.target.value })} />
          </InspField>
          <p className="text-[10px] text-muted-foreground">
            {node.content.sections.length} sección(es) — editar en A2.2
          </p>
        </>
      );

    case 'send_media': {
      const c = node.content;
      if (c.media_type === 'image' || c.media_type === 'document') {
        return (
          <>
            <InspField label="URL">
              <Input value={c.url} onChange={(e) => onUpdate({ url: e.target.value })} />
            </InspField>
            <InspField label="Caption">
              <Input value={c.caption ?? ''}
                onChange={(e) => onUpdate({ caption: e.target.value })} />
            </InspField>
          </>
        );
      }
      if (c.media_type === 'location') {
        return (
          <>
            <InspField label="Nombre">
              <Input value={c.name ?? ''}
                onChange={(e) => onUpdate({ name: e.target.value })} />
            </InspField>
            <InspField label="Latitud / Longitud">
              <div className="flex gap-1">
                <Input type="number" value={c.latitude}
                  onChange={(e) => onUpdate({ latitude: parseFloat(e.target.value) || 0 })} />
                <Input type="number" value={c.longitude}
                  onChange={(e) => onUpdate({ longitude: parseFloat(e.target.value) || 0 })} />
              </div>
            </InspField>
          </>
        );
      }
      return <NotEditable />;
    }

    case 'wait_input':
      return (
        <>
          <InspField label="Prompt (opcional)">
            <Textarea rows={3} value={node.content.prompt ?? ''}
              onChange={(e) => onUpdate({ prompt: e.target.value })} />
          </InspField>
          <InspField label="Guardar en contexto">
            <Input value={node.content.save_to_context ?? ''}
              onChange={(e) => onUpdate({ save_to_context: e.target.value })} />
          </InspField>
        </>
      );

    case 'escape_to_human':
      return (
        <>
          <InspField label="Respuesta al usuario">
            <Textarea rows={3} value={node.content.user_response}
              onChange={(e) => onUpdate({ user_response: e.target.value })} />
          </InspField>
          <InspField label="Alerta al dueño">
            <Textarea rows={3} value={node.content.owner_alert_template}
              onChange={(e) => onUpdate({ owner_alert_template: e.target.value })} />
          </InspField>
        </>
      );

    case 'end':
      return <p className="text-[10px] text-muted-foreground">Fin del flujo. Sin campos.</p>;

    // ── WhatsApp v23.0 ──────────────────────────────────────────────────────

    case 'send_cta_url':
      return (
        <>
          <InspField label="Cuerpo">
            <Textarea rows={3} value={node.content.body}
              onChange={(e) => onUpdate({ body: e.target.value })} />
          </InspField>
          <InspField label="Texto del botón">
            <Input value={node.content.button.display_text}
              onChange={(e) =>
                onUpdate({ button: { ...node.content.button, display_text: e.target.value } })
              } />
          </InspField>
          <InspField label="URL del botón">
            <Input value={node.content.button.url}
              onChange={(e) =>
                onUpdate({ button: { ...node.content.button, url: e.target.value } })
              } />
          </InspField>
          {node.content.footer !== undefined && (
            <InspField label="Footer">
              <Input value={node.content.footer}
                onChange={(e) => onUpdate({ footer: e.target.value })} />
            </InspField>
          )}
        </>
      );

    case 'send_location_request':
      return (
        <InspField label="Cuerpo">
          <Textarea rows={4} value={node.content.body}
            onChange={(e) => onUpdate({ body: e.target.value })} />
        </InspField>
      );

    case 'send_media_carousel':
      return (
        <>
          <InspField label="Cuerpo">
            <Textarea rows={2} value={node.content.body}
              onChange={(e) => onUpdate({ body: e.target.value })} />
          </InspField>
          <p className="text-[10px] text-muted-foreground">
            {node.content.cards.length} card(s) — editar cards en A2.2
          </p>
        </>
      );

    case 'send_reaction':
      return (
        <InspField label="Emoji">
          <Input value={node.content.emoji}
            onChange={(e) => onUpdate({ emoji: e.target.value })} />
        </InspField>
      );

    case 'request_call_permission':
      return (
        <>
          <InspField label="Cuerpo">
            <Textarea rows={3} value={node.content.body}
              onChange={(e) => onUpdate({ body: e.target.value })} />
          </InspField>
          <InspField label="Footer (opcional)">
            <Input value={node.content.footer ?? ''}
              onChange={(e) => onUpdate({ footer: e.target.value || undefined })} />
          </InspField>
        </>
      );

    case 'send_whatsapp_flow':
      return (
        <>
          <InspField label="Cuerpo">
            <Textarea rows={3} value={node.content.body}
              onChange={(e) => onUpdate({ body: e.target.value })} />
          </InspField>
          <InspField label="Texto del botón CTA">
            <Input value={node.content.flow_cta}
              onChange={(e) => onUpdate({ flow_cta: e.target.value })} />
          </InspField>
          <InspField label="ID del WA Flow">
            <Input value={node.content.whatsapp_flow_id}
              onChange={(e) => onUpdate({ whatsapp_flow_id: e.target.value })} />
          </InspField>
          <InspField label="Modo">
            <select
              className="w-full rounded-md border bg-background px-2 py-1 text-xs"
              value={node.content.mode}
              onChange={(e) => onUpdate({ mode: e.target.value as 'draft' | 'published' })}
            >
              <option value="draft">draft (pruebas)</option>
              <option value="published">published (producción)</option>
            </select>
          </InspField>
        </>
      );
  }
}

/** Wrapper de campo de inspector: label encima, control abajo. */
function InspField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
        {label}
      </Label>
      {children}
    </div>
  );
}

/** Mensaje para tipos sin campos editables en esta versión. */
function NotEditable() {
  return (
    <p className="text-[10px] text-muted-foreground">
      Este tipo no tiene campos editables aquí (se completa en A2.2).
    </p>
  );
}

export const Route = createLazyRoute('/_authed/tenants/$id/designer')({
  component: DesignerPage,
});
