import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createLazyRoute, Link } from '@tanstack/react-router';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  useReactFlow,
  type NodeMouseHandler,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { ArrowLeft, Loader2, Save, Send, Workflow, FileQuestion, ShieldCheck, ShieldAlert } from 'lucide-react';
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
import {
  EMPTY_FLOW, isBotFlowish,
  type FlowNode, type FlowNodeType,
  type ListSection, type ListItem, type MediaCarouselCard,
} from '../designer/flow-types';
import type { DesignerRFNode, DesignerNodeData } from '../designer/mapping/rf-types';
import { NodePalette } from '../designer/NodePalette';
import { TransitionsEditor } from '../designer/TransitionsEditor';
import { NodeContextMenu, type ContextMenuState } from '../designer/NodeContextMenu';
import { validateGraph } from '../designer/validation/graphValidator';
import { ValidationPanel } from '../designer/validation/ValidationPanel';

/**
 * Color del MiniMap por tipo de nodo. Fuente única: los tokens --color-node-*
 * de globals.css (DEC-P4) — se leen con getComputedStyle y se cachean, en vez
 * de duplicar los oklch aquí.
 */
const NODE_TOKEN_VAR: Record<FlowNodeType, string> = {
  send_text: '--color-node-text',
  send_buttons: '--color-node-buttons',
  send_list: '--color-node-list',
  send_media: '--color-node-media',
  wait_input: '--color-node-wait',
  escape_to_human: '--color-node-escape',
  end: '--color-node-end',
  send_cta_url: '--color-node-cta',
  send_location_request: '--color-node-location',
  send_media_carousel: '--color-node-carousel',
  send_reaction: '--color-node-reaction',
  request_call_permission: '--color-node-call',
  send_whatsapp_flow: '--color-node-flow',
};
const tokenCache: Record<string, string> = {};
function nodeTokenColor(type: FlowNodeType): string {
  const varName = NODE_TOKEN_VAR[type];
  if (!tokenCache[varName]) {
    tokenCache[varName] =
      getComputedStyle(document.documentElement).getPropertyValue(varName).trim() ||
      '#94a3b8';
  }
  return tokenCache[varName];
}

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
        <ReactFlowProvider>
          <DesignerCanvas tenantId={id} flowId={flow.id} flowName={flow.nombre} />
        </ReactFlowProvider>
      )}
    </div>
  );
}

function EmptyState({ id }: { id: string }) {
  return (
    <Card className="shadow-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileQuestion className="h-4 w-4 text-muted-foreground" aria-hidden />
          Bot Designer
        </CardTitle>
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
  const addNode = useDesignerStore((s) => s.addNode);
  const deleteNode = useDesignerStore((s) => s.deleteNode);
  const selectedId = useDesignerStore((s) => s.selectedId);

  const save = useSaveDraft(tenantId);
  const publish = usePublish(tenantId);

  const onNodeClick: NodeMouseHandler<DesignerRFNode> = (_e, node) => setSelected(node.id);

  const publishIssues =
    publish.error instanceof ApiError
      ? ((publish.error.body as PublishErrorBody | undefined)?.issues ?? null)
      : null;

  const { screenToFlowPosition } = useReactFlow();
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const raw = e.dataTransfer.getData('application/seguritech-node');
      if (!raw) return;
      try {
        const { type } = JSON.parse(raw) as { type: FlowNodeType };
        const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
        addNode(type, position);
      } catch {
        // payload malformado — ignorar
      }
    },
    [addNode, screenToFlowPosition],
  );

  const onNodeContextMenu = useCallback(
    (e: React.MouseEvent, node: DesignerRFNode) => {
      e.preventDefault();
      // Posición relativa al contenedor del canvas (el div con position relative)
      const bounds = (e.currentTarget as HTMLElement).closest('.rf-wrapper')?.getBoundingClientRect();
      setContextMenu({
        x: e.clientX - (bounds?.left ?? 0),
        y: e.clientY - (bounds?.top ?? 0),
        nodeId: node.id,
      });
    },
    [],
  );

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (
        (e.key === 'Delete' || e.key === 'Backspace') &&
        selectedId &&
        // Evitar borrar si el foco está en un input/textarea
        !['INPUT', 'TEXTAREA', 'SELECT'].includes(
          (document.activeElement?.tagName ?? ''),
        )
      ) {
        deleteNode(selectedId);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [selectedId, deleteNode]);

  const [showValidation, setShowValidation] = useState(false);

  // Validación de grafo en vivo. Se recalcula cuando cambian los nodos/edges
  // del store; `toBotFlow` es referencia estable del store.
  const validation = useMemo(() => validateGraph(toBotFlow()), [nodes, edges, toBotFlow]);

  const handlePublishClick = useCallback(() => {
    if (!validation.canPublish) {
      // Hay errores → mostrar panel, NO publicar.
      setShowValidation(true);
      return;
    }
    if (validation.warningCount > 0) {
      // Solo warnings → mostrar panel para confirmar.
      setShowValidation(true);
      return;
    }
    // Limpio → publicar directo.
    publish.mutate({ flowId });
  }, [validation, publish, flowId]);

  const handlePublishAnyway = useCallback(() => {
    setShowValidation(false);
    publish.mutate({ flowId });
  }, [publish, flowId]);

  return (
    <Card className="shadow-card">
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <div>
          <CardTitle className="text-base">Bot Designer · {flowName}</CardTitle>
          <CardDescription>
            Visualiza y edita el flujo. dagre posiciona los nodos; los arrastres
            no se guardan (V1).
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          {validation.errorCount > 0 ? (
            <button
              type="button"
              onClick={() => setShowValidation((v) => !v)}
              className="inline-flex items-center gap-1 rounded-md border border-red-300 bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700 hover:bg-red-100"
            >
              <ShieldAlert className="h-3 w-3" />
              {validation.errorCount} error{validation.errorCount === 1 ? '' : 'es'}
            </button>
          ) : validation.warningCount > 0 ? (
            <button
              type="button"
              onClick={() => setShowValidation((v) => !v)}
              className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 hover:bg-amber-100"
            >
              <ShieldAlert className="h-3 w-3" />
              {validation.warningCount} aviso{validation.warningCount === 1 ? '' : 's'}
            </button>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
              <ShieldCheck className="h-3 w-3" />
              Válido
            </span>
          )}
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
            onClick={handlePublishClick}
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
          <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border/70 bg-muted/20 px-6 py-12 text-center">
            <Workflow className="h-7 w-7 text-muted-foreground/60" aria-hidden />
            <p className="text-sm font-medium text-foreground">El flujo no tiene nodos en el draft</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              Publica desde un molde asignado o edita el draft en una versión
              futura del designer.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-[180px_1fr_280px]">
            {/* Paleta izquierda */}
            <NodePalette />

            {/* Canvas */}
            <div
              className="rf-wrapper relative h-[70vh] overflow-hidden rounded-lg border border-border/70 bg-muted/20 shadow-card"
              onClick={() => setContextMenu(null)}
            >
              <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onNodeClick={onNodeClick}
                onPaneClick={() => { setSelected(null); setContextMenu(null); }}
                onDrop={onDrop}
                onDragOver={onDragOver}
                onNodeContextMenu={onNodeContextMenu}
                fitView
                proOptions={{ hideAttribution: true }}
              >
                <Background
                  variant={BackgroundVariant.Dots}
                  gap={20}
                  size={1.5}
                  color="oklch(0.86 0.02 255)"
                />
                <Controls className="!rounded-md !border !border-border/70 !bg-card !shadow-card [&_button]:!border-border/60" />
                <MiniMap
                  pannable
                  zoomable
                  className="!rounded-md !border !border-border/70 !bg-card !shadow-card"
                  nodeColor={(n) => nodeTokenColor((n.data as DesignerNodeData).node.type)}
                  nodeStrokeWidth={2}
                />
              </ReactFlow>
              {contextMenu && (
                <NodeContextMenu menu={contextMenu} onClose={() => setContextMenu(null)} />
              )}
            </div>

            {/* Inspector o panel de validación */}
            {showValidation ? (
              <ValidationPanel
                result={validation}
                onClose={() => setShowValidation(false)}
                onPublishAnyway={
                  validation.canPublish && validation.warningCount > 0
                    ? handlePublishAnyway
                    : undefined
                }
                publishing={publish.isPending}
              />
            ) : (
              <Inspector />
            )}
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
      <div className="flex h-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border/70 bg-muted/20 p-6 text-center">
        <Workflow className="h-6 w-6 text-muted-foreground/60" aria-hidden />
        <p className="text-xs text-muted-foreground">
          Selecciona un nodo del lienzo para editar su contenido.
        </p>
      </div>
    );
  }

  const node = selected.data.node;
  const meta = NODE_META[node.type];
  const Icon = meta.icon;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border/70 bg-card p-3 shadow-card overflow-y-auto max-h-[70vh]">
      <div className="flex items-center justify-between gap-2">
        <span
          className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-white ${meta.header}`}
        >
          <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {meta.label}
        </span>
        <code className="truncate text-[10px] text-muted-foreground">{node.id}</code>
      </div>
      <NodeInspectorForm node={node} onUpdate={(patch) => updateNodeContent(node.id, patch)} />
      <div className="mt-1 border-t pt-2">
        <TransitionsEditor node={node} />
      </div>
    </div>
  );
}

// ─── Helpers de edición de sub-ítems (funciones puras, no tocan el store) ───

/** ID corto único para botones/ítems nuevos. Sin uuid. */
function newItemId(): string {
  return `i_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`;
}

// send_buttons helpers
function addButton(
  buttons: Array<{ id: string; title: string }>,
): Array<{ id: string; title: string }> {
  if (buttons.length >= 3) return buttons;
  return [...buttons, { id: newItemId(), title: '' }];
}

function removeButton(
  buttons: Array<{ id: string; title: string }>,
  idx: number,
): Array<{ id: string; title: string }> {
  if (buttons.length <= 1) return buttons; // mínimo 1
  return buttons.filter((_, i) => i !== idx);
}

function updateButton(
  buttons: Array<{ id: string; title: string }>,
  idx: number,
  field: 'id' | 'title',
  value: string,
): Array<{ id: string; title: string }> {
  return buttons.map((b, i) => (i === idx ? { ...b, [field]: value } : b));
}

// send_list helpers
function addStaticItem(sections: ListSection[], sectionIdx: number): ListSection[] {
  return sections.map((sec, si) => {
    if (si !== sectionIdx || sec.type !== 'static') return sec;
    const totalItems = sections.reduce(
      (acc, s) => acc + (s.type === 'static' ? s.items.length : 0),
      0,
    );
    if (totalItems >= 10) return sec; // límite total Meta
    return { ...sec, items: [...sec.items, { id: newItemId(), title: '' }] };
  });
}

function removeStaticItem(
  sections: ListSection[],
  sectionIdx: number,
  itemIdx: number,
): ListSection[] {
  return sections.map((sec, si) => {
    if (si !== sectionIdx || sec.type !== 'static') return sec;
    if (sec.items.length <= 1) return sec; // mínimo 1 ítem
    return { ...sec, items: sec.items.filter((_, ii) => ii !== itemIdx) };
  });
}

function updateStaticItem(
  sections: ListSection[],
  sectionIdx: number,
  itemIdx: number,
  field: keyof ListItem,
  value: string,
): ListSection[] {
  return sections.map((sec, si) => {
    if (si !== sectionIdx || sec.type !== 'static') return sec;
    return {
      ...sec,
      items: sec.items.map((item, ii) =>
        ii === itemIdx ? { ...item, [field]: value } : item,
      ),
    };
  });
}

function updateSectionTitle(sections: ListSection[], idx: number, title: string): ListSection[] {
  return sections.map((sec, i) => (i === idx ? { ...sec, title } : sec));
}

function addSection(sections: ListSection[]): ListSection[] {
  return [
    ...sections,
    { type: 'static', title: 'Nueva sección', items: [{ id: newItemId(), title: '' }] },
  ];
}

function removeSection(sections: ListSection[], idx: number): ListSection[] {
  if (sections.length <= 1) return sections; // mínimo 1 sección
  return sections.filter((_, i) => i !== idx);
}

// send_media_carousel helpers
function addCard(cards: MediaCarouselCard[]): MediaCarouselCard[] {
  if (cards.length >= 10) return cards;
  // Inferir tipo de botón del resto de cards para mantener consistencia
  const existingBtnType =
    cards[0]?.buttons[0]?.type === 'cta_url' ? 'cta_url' : 'quick_reply';
  const defaultButton =
    existingBtnType === 'cta_url'
      ? { type: 'cta_url' as const, display_text: 'Ver', url: 'https://' }
      : { type: 'quick_reply' as const, id: newItemId(), title: 'Opción' };
  return [
    ...cards,
    { header: { type: 'image' as const, link: '' }, body: '', buttons: [defaultButton] },
  ];
}

function removeCard(cards: MediaCarouselCard[], idx: number): MediaCarouselCard[] {
  if (cards.length <= 1) return cards;
  return cards.filter((_, i) => i !== idx);
}

function updateCardField(
  cards: MediaCarouselCard[],
  cardIdx: number,
  field: 'body',
  value: string,
): MediaCarouselCard[] {
  return cards.map((c, i) => (i === cardIdx ? { ...c, [field]: value } : c));
}

function updateCardHeader(
  cards: MediaCarouselCard[],
  cardIdx: number,
  headerType: 'image' | 'video',
  link: string,
): MediaCarouselCard[] {
  return cards.map((c, i) =>
    i === cardIdx ? { ...c, header: { type: headerType, link } } : c,
  );
}

function updateCardButton(
  cards: MediaCarouselCard[],
  cardIdx: number,
  btnIdx: number,
  patch: Partial<MediaCarouselCard['buttons'][0]>,
): MediaCarouselCard[] {
  return cards.map((c, ci) => {
    if (ci !== cardIdx) return c;
    const nextButtons = c.buttons.map((b, bi) => {
      if (bi !== btnIdx) return b;
      return { ...b, ...patch } as MediaCarouselCard['buttons'][0];
    });
    return { ...c, buttons: nextButtons };
  });
}

function addCardButton(cards: MediaCarouselCard[], cardIdx: number): MediaCarouselCard[] {
  return cards.map((c, ci) => {
    if (ci !== cardIdx || c.buttons.length >= 2) return c;
    const existingType = c.buttons[0]?.type === 'cta_url' ? 'cta_url' : 'quick_reply';
    const newBtn =
      existingType === 'cta_url'
        ? { type: 'cta_url' as const, display_text: 'Ver', url: 'https://' }
        : { type: 'quick_reply' as const, id: newItemId(), title: 'Opción' };
    return { ...c, buttons: [...c.buttons, newBtn] };
  });
}

function removeCardButton(cards: MediaCarouselCard[], cardIdx: number, btnIdx: number): MediaCarouselCard[] {
  return cards.map((c, ci) => {
    if (ci !== cardIdx || c.buttons.length <= 1) return c;
    return { ...c, buttons: c.buttons.filter((_, bi) => bi !== btnIdx) };
  });
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

    case 'send_buttons': {
      const { text, buttons } = node.content;
      return (
        <>
          <InspField label="Texto del mensaje">
            <Textarea
              rows={3}
              value={text}
              onChange={(e) => onUpdate({ text: e.target.value })}
            />
          </InspField>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                Botones ({buttons.length}/3)
              </Label>
              {buttons.length < 3 && (
                <button
                  type="button"
                  className="text-[10px] text-primary hover:underline"
                  onClick={() => onUpdate({ buttons: addButton(buttons) })}
                >
                  + Agregar
                </button>
              )}
            </div>

            {buttons.map((btn, idx) => (
              <div key={btn.id} className="flex flex-col gap-1 rounded-md border p-1.5">
                <div className="flex items-center gap-1">
                  <span className="w-4 shrink-0 text-[10px] text-muted-foreground">{idx + 1}.</span>
                  <InspField label="Etiqueta">
                    <Input
                      value={btn.title}
                      maxLength={20}
                      placeholder="Texto del botón (máx. 20)"
                      onChange={(e) =>
                        onUpdate({ buttons: updateButton(buttons, idx, 'title', e.target.value) })
                      }
                    />
                  </InspField>
                  {buttons.length > 1 && (
                    <button
                      type="button"
                      className="ml-1 shrink-0 text-[11px] text-red-500 hover:text-red-700"
                      title="Eliminar botón"
                      onClick={() => onUpdate({ buttons: removeButton(buttons, idx) })}
                    >
                      ✕
                    </button>
                  )}
                </div>
                <div className="pl-5">
                  <InspField label="ID (payload de condición)">
                    <Input
                      value={btn.id}
                      placeholder="id único del botón"
                      className="font-mono text-[10px]"
                      onChange={(e) =>
                        onUpdate({ buttons: updateButton(buttons, idx, 'id', e.target.value) })
                      }
                    />
                  </InspField>
                </div>
              </div>
            ))}

            <p className="text-[10px] text-muted-foreground">
              El ID del botón debe coincidir con la condición{' '}
              <code className="font-mono">button: value</code> en las transiciones.
            </p>
          </div>
        </>
      );
    }

    case 'send_list': {
      const { text, button_label, sections } = node.content;
      const totalItems = sections.reduce(
        (acc, s) => acc + (s.type === 'static' ? s.items.length : 0),
        0,
      );
      return (
        <>
          <InspField label="Texto del mensaje">
            <Textarea
              rows={3}
              value={text}
              onChange={(e) => onUpdate({ text: e.target.value })}
            />
          </InspField>

          <InspField label="Etiqueta del botón de lista">
            <Input
              value={button_label}
              placeholder="Ej: Ver opciones"
              onChange={(e) => onUpdate({ button_label: e.target.value })}
            />
          </InspField>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                Secciones ({sections.length}) · {totalItems}/10 ítems
              </Label>
              <button
                type="button"
                className="text-[10px] text-primary hover:underline"
                onClick={() => onUpdate({ sections: addSection(sections) })}
              >
                + Sección
              </button>
            </div>

            {sections.map((sec, si) => (
              <div key={si} className="flex flex-col gap-1 rounded-md border p-2">
                {/* Cabecera de sección */}
                <div className="flex items-center gap-1">
                  <Input
                    value={sec.title}
                    maxLength={24}
                    placeholder="Título sección (máx. 24)"
                    className="flex-1 text-xs"
                    onChange={(e) =>
                      onUpdate({ sections: updateSectionTitle(sections, si, e.target.value) })
                    }
                  />
                  {sections.length > 1 && (
                    <button
                      type="button"
                      className="shrink-0 text-[11px] text-red-500 hover:text-red-700"
                      title="Eliminar sección"
                      onClick={() => onUpdate({ sections: removeSection(sections, si) })}
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Tipo de sección */}
                {sec.type === 'dynamic' ? (
                  <p className="pl-1 text-[10px] text-muted-foreground italic">
                    Sección dinámica — ítems desde catálogo ({sec.items_source}).
                    No editable aquí.
                  </p>
                ) : (
                  <>
                    {/* Ítems estáticos */}
                    {sec.items.map((item, ii) => (
                      <div key={item.id} className="ml-2 flex flex-col gap-0.5 border-l pl-2">
                        <div className="flex items-center gap-1">
                          <Input
                            value={item.title}
                            maxLength={24}
                            placeholder="Título ítem (máx. 24)"
                            className="flex-1 text-[11px]"
                            onChange={(e) =>
                              onUpdate({
                                sections: updateStaticItem(sections, si, ii, 'title', e.target.value),
                              })
                            }
                          />
                          {sec.items.length > 1 && (
                            <button
                              type="button"
                              className="shrink-0 text-[11px] text-red-500 hover:text-red-700"
                              title="Eliminar ítem"
                              onClick={() =>
                                onUpdate({ sections: removeStaticItem(sections, si, ii) })
                              }
                            >
                              ✕
                            </button>
                          )}
                        </div>
                        <Input
                          value={item.description ?? ''}
                          placeholder="Descripción (opcional)"
                          className="text-[10px] text-muted-foreground"
                          onChange={(e) =>
                            onUpdate({
                              sections: updateStaticItem(
                                sections, si, ii, 'description', e.target.value,
                              ),
                            })
                          }
                        />
                        <p className="text-[9px] text-muted-foreground/60 font-mono">
                          id: {item.id}
                        </p>
                      </div>
                    ))}

                    {/* Agregar ítem */}
                    {totalItems < 10 && (
                      <button
                        type="button"
                        className="ml-2 text-left text-[10px] text-primary hover:underline"
                        onClick={() => onUpdate({ sections: addStaticItem(sections, si) })}
                      >
                        + Ítem
                      </button>
                    )}
                  </>
                )}
              </div>
            ))}

            <p className="text-[10px] text-muted-foreground">
              El ID de ítem debe coincidir con la condición{' '}
              <code className="font-mono">list_item: value</code>.
            </p>
          </div>
        </>
      );
    }

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

    case 'send_media_carousel': {
      const { body, cards } = node.content;
      // Detectar tipo de botón predominante para mostrar en UI
      const activeBtnType =
        cards[0]?.buttons[0]?.type === 'cta_url' ? 'cta_url' : 'quick_reply';

      return (
        <>
          <InspField label="Texto introductorio">
            <Textarea
              rows={2}
              value={body}
              onChange={(e) => onUpdate({ body: e.target.value })}
            />
          </InspField>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                Cards ({cards.length}/10) · tipo: {activeBtnType}
              </Label>
              {cards.length < 10 && (
                <button
                  type="button"
                  className="text-[10px] text-primary hover:underline"
                  onClick={() => onUpdate({ cards: addCard(cards) })}
                >
                  + Card
                </button>
              )}
            </div>

            {cards.map((card, ci) => (
              <div key={ci} className="flex flex-col gap-1.5 rounded-md border p-2">
                {/* Header de card */}
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-medium">Card {ci + 1}</span>
                  {cards.length > 1 && (
                    <button
                      type="button"
                      className="text-[11px] text-red-500 hover:text-red-700"
                      onClick={() => onUpdate({ cards: removeCard(cards, ci) })}
                    >
                      ✕ Eliminar
                    </button>
                  )}
                </div>

                {/* Tipo de media */}
                <div className="flex items-center gap-2">
                  <Label className="text-[10px] text-muted-foreground shrink-0">Media:</Label>
                  <select
                    className="rounded border bg-background px-1 py-0.5 text-[10px]"
                    value={card.header.type}
                    onChange={(e) =>
                      onUpdate({
                        cards: updateCardHeader(
                          cards, ci,
                          e.target.value as 'image' | 'video',
                          card.header.link,
                        ),
                      })
                    }
                  >
                    <option value="image">Imagen</option>
                    <option value="video">Video</option>
                  </select>
                </div>

                <InspField label="URL de media">
                  <Input
                    value={card.header.link}
                    placeholder="https://..."
                    onChange={(e) =>
                      onUpdate({
                        cards: updateCardHeader(cards, ci, card.header.type, e.target.value),
                      })
                    }
                  />
                </InspField>

                <InspField label="Texto de la card">
                  <Textarea
                    rows={2}
                    value={card.body}
                    onChange={(e) =>
                      onUpdate({ cards: updateCardField(cards, ci, 'body', e.target.value) })
                    }
                  />
                </InspField>

                {/* Botones de la card */}
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">
                      Botones ({card.buttons.length}/2)
                    </Label>
                    {card.buttons.length < 2 && (
                      <button
                        type="button"
                        className="text-[10px] text-primary hover:underline"
                        onClick={() => onUpdate({ cards: addCardButton(cards, ci) })}
                      >
                        + Botón
                      </button>
                    )}
                  </div>

                  {card.buttons.map((btn, bi) => (
                    <div key={bi} className="flex flex-col gap-0.5 rounded border p-1">
                      <div className="flex items-center gap-1">
                        <span className="text-[9px] text-muted-foreground">{bi + 1}.</span>
                        {btn.type === 'quick_reply' ? (
                          <>
                            <Input
                              value={btn.title}
                              maxLength={20}
                              placeholder="Título (máx. 20)"
                              className="flex-1 text-[10px]"
                              onChange={(e) =>
                                onUpdate({
                                  cards: updateCardButton(cards, ci, bi, { title: e.target.value }),
                                })
                              }
                            />
                            <Input
                              value={btn.id}
                              placeholder="id"
                              className="w-20 font-mono text-[10px]"
                              onChange={(e) =>
                                onUpdate({
                                  cards: updateCardButton(cards, ci, bi, { id: e.target.value }),
                                })
                              }
                            />
                          </>
                        ) : (
                          <>
                            <Input
                              value={btn.display_text}
                              maxLength={20}
                              placeholder="Texto botón (máx. 20)"
                              className="flex-1 text-[10px]"
                              onChange={(e) =>
                                onUpdate({
                                  cards: updateCardButton(cards, ci, bi, {
                                    display_text: e.target.value,
                                  }),
                                })
                              }
                            />
                            <Input
                              value={btn.url}
                              placeholder="https://"
                              className="flex-1 text-[10px]"
                              onChange={(e) =>
                                onUpdate({
                                  cards: updateCardButton(cards, ci, bi, { url: e.target.value }),
                                })
                              }
                            />
                          </>
                        )}
                        {card.buttons.length > 1 && (
                          <button
                            type="button"
                            className="shrink-0 text-[11px] text-red-500"
                            onClick={() =>
                              onUpdate({ cards: removeCardButton(cards, ci, bi) })
                            }
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            <p className="text-[10px] text-muted-foreground">
              Todas las cards deben usar el mismo tipo de botón (quick_reply o
              cta_url). El backend lo valida al publicar.
            </p>
          </div>
        </>
      );
    }

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
