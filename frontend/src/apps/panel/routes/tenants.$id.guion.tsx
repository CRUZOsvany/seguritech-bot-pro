import { useMemo, useState } from 'react';
import { createLazyRoute, Link } from '@tanstack/react-router';
import {
  ArrowLeft, Loader2, Save, Search, Lock, AlertTriangle, FileQuestion, ScrollText,
} from 'lucide-react';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { Alert, AlertDescription } from '@/shared/ui/alert';
import { Textarea } from '@/shared/ui/textarea';
import { Input } from '@/shared/ui/input';
import { useFlows } from '../hooks/use-flows';
import { useGuion } from '../hooks/use-guion';
import { configBoundLabel, type GuionRow } from '../guion/extract-text-fields';
import { WhatsAppSimulator } from '@/shared/simulator/WhatsAppSimulator';

/**
 * El Guion (P7): editar TODO lo que dice el bot desde una tabla plana, en
 * vez de abrir el canvas nodo por nodo. Reglas duras (D6):
 *   - Escribe SOLO sobre el draft. Nunca llama a publish — eso sigue siendo
 *     un acto explícito y exclusivo de super_admin desde el Designer (D5).
 *   - Concurrencia optimista contra draft_updated_at: si el flow cambió
 *     desde que se cargó (otra pestaña, o el Designer), guardar falla con
 *     un error de conflicto en vez de pisar silenciosamente.
 *   - Los textos con config_bound se muestran candados (P3) — se editan
 *     desde Mensajes, no desde aquí.
 */
function GuionPage() {
  const { id } = Route.useParams();
  const flowsQ = useFlows(id);
  const flow = useMemo(() => {
    const flows = flowsQ.data;
    if (!flows || flows.length === 0) return undefined;
    return flows.find((f) => f.channel === 'whatsapp') ?? flows[0];
  }, [flowsQ.data]);
  const flowId = flow?.id ?? null;

  const guion = useGuion(id, flowId);
  const [search, setSearch] = useState('');

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return guion.rows;
    return guion.rows.filter(
      (r) =>
        r.text.toLowerCase().includes(q) ||
        r.label.toLowerCase().includes(q) ||
        r.nodeId.toLowerCase().includes(q),
    );
  }, [guion.rows, search]);

  return (
    <div className="flex flex-col gap-4">
      <Button asChild variant="ghost" size="sm" className="self-start">
        <Link to="/tenants/$id" params={{ id }}>
          <ArrowLeft className="mr-1 h-3 w-3" /> Volver al cliente
        </Link>
      </Button>

      {flowsQ.isLoading && (
        <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Cargando…
        </div>
      )}

      {!flowsQ.isLoading && !flow && (
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileQuestion className="h-4 w-4 text-muted-foreground" aria-hidden />
              Guion
            </CardTitle>
            <CardDescription>Este cliente todavía no tiene un flujo.</CardDescription>
          </CardHeader>
          <CardContent>
            <Alert>
              <AlertDescription>
                Asigna un molde primero desde la pantalla de WhatsApp.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      )}

      {flow && (
        <Card className="shadow-card">
          <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
            <div>
              <CardTitle className="text-base">Guion · {flow.nombre}</CardTitle>
              <CardDescription>
                Todos los textos del flujo, en una tabla. Los candados 🔒 se editan desde Mensajes.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {guion.dirty && !guion.conflict && (
                <span className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                  <AlertTriangle className="h-3 w-3" />
                  Cambios sin guardar
                </span>
              )}
              <Button
                size="sm"
                disabled={!guion.dirty || guion.saving}
                onClick={guion.save}
              >
                {guion.saving ? (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                ) : (
                  <Save className="mr-1 h-3 w-3" />
                )}
                Guardar draft
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {guion.conflict && (
              <Alert variant="destructive">
                <AlertDescription className="flex items-center justify-between gap-3">
                  <span>Este flujo cambió desde que lo cargaste. Recarga antes de guardar.</span>
                  <Button size="sm" variant="outline" onClick={guion.reload}>
                    Recargar
                  </Button>
                </AlertDescription>
              </Alert>
            )}
            {guion.saveError && (
              <Alert variant="destructive">
                <AlertDescription>Error al guardar: {guion.saveError}</AlertDescription>
              </Alert>
            )}
            {guion.error && (
              <Alert variant="destructive">
                <AlertDescription>
                  {guion.error instanceof Error ? guion.error.message : 'Error cargando el draft'}
                </AlertDescription>
              </Alert>
            )}

            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar en todos los textos…"
                className="h-8 pl-8 text-sm"
              />
            </div>

            {guion.isLoading && (
              <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Cargando draft…
              </div>
            )}

            {!guion.isLoading && filteredRows.length === 0 && guion.rows.length > 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Ningún texto coincide con "{search}".
              </p>
            )}

            {!guion.isLoading && guion.rows.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
                <ScrollText className="h-7 w-7 text-muted-foreground/50" aria-hidden />
                <p className="text-sm text-muted-foreground">
                  Este flujo todavía no tiene textos editables en su draft.
                </p>
              </div>
            )}

            {!guion.isLoading && filteredRows.length > 0 && (
              <div className="flex flex-col gap-2">
                {filteredRows.map((row) => (
                  <GuionRowEditor
                    key={row.key}
                    row={row}
                    tenantId={id}
                    onChange={(text) => guion.editRow(row, text)}
                  />
                ))}
              </div>
            )}

            {flowId && (
              <div className="mt-2 border-t pt-3">
                <p className="mb-2 text-xs font-medium text-muted-foreground">
                  Simulador — probando el BORRADOR (guarda antes de cada turno si hay cambios)
                </p>
                <WhatsAppSimulator
                  tenantId={id}
                  compact
                  source="draft"
                  flowId={flowId}
                  onBeforeSend={guion.dirty ? guion.save : undefined}
                />
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function GuionRowEditor({
  row, tenantId, onChange,
}: { row: GuionRow; tenantId: string; onChange: (text: string) => void }) {
  const locked = !!row.configBound && row.configBound.length > 0;

  return (
    <div className="flex flex-col gap-1 rounded-md border border-border/60 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {row.label}
        </span>
        <code className="text-[10px] text-muted-foreground">
          {row.nodeId} · {row.nodeType}
        </code>
      </div>
      {locked ? (
        <div className="flex flex-col gap-1">
          <div className="whitespace-pre-wrap rounded-md border border-dashed border-amber-300 bg-amber-50/60 px-2 py-1.5 text-sm text-muted-foreground">
            {row.text}
          </div>
          <p className="flex flex-wrap items-center gap-1 text-[10px] text-amber-700">
            <Lock className="h-3 w-3 shrink-0" aria-hidden />
            Gobernado por config ({configBoundLabel(row.configBound!)}).
            <Link to="/tenants/$id/whatsapp" params={{ id: tenantId }} className="underline hover:text-amber-900">
              Editar en Mensajes
            </Link>
          </p>
        </div>
      ) : (
        <Textarea
          value={row.text}
          onChange={(e) => onChange(e.target.value)}
          rows={2}
          className="text-sm"
        />
      )}
    </div>
  );
}

export const Route = createLazyRoute('/_authed/tenants/$id/guion')({
  component: GuionPage,
});
