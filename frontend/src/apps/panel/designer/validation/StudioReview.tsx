import { useMemo } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Combine, Loader2 } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { mergeNext, validateFlowJson } from '@/shared/api/studio';
import { busyTurns } from '../../studio/testing-model';
import type { BotFlow } from '../flow-types';
import { graphToBotFlow } from '../mapping/to-bot-flow';
import { useDesignerStore } from '../store/designer-store';

/**
 * "Revisión del Studio" en el Designer (Fase 5): las mismas reglas que
 * bloquean la publicación, sobre lo que hay en el lienzo (sin guardar), más
 * los mensajes por turno. Donde el Studio sabe arreglarlo solo (fusionar un
 * texto con el mensaje que le sigue), ofrece el botón: el resultado se carga
 * al lienzo como cambio sin guardar.
 */
export function StudioReview({ tenantId, flowId }: { tenantId: string; flowId: string }) {
  const nodes = useDesignerStore((s) => s.nodes);
  const edges = useDesignerStore((s) => s.edges);
  const startNodeId = useDesignerStore((s) => s.startNodeId);
  const escape = useDesignerStore((s) => s.escape);
  const loadFromBotFlow = useDesignerStore((s) => s.loadFromBotFlow);
  // Lo mismo que toBotFlow(), pero con dependencias que React puede ver.
  const flowJson = useMemo(() => JSON.stringify(graphToBotFlow(nodes, edges, startNodeId, escape)), [nodes, edges, startNodeId, escape]);

  const reviewQ = useQuery({
    queryKey: ['studio-review', tenantId, flowJson],
    queryFn: () => validateFlowJson(tenantId, JSON.parse(flowJson)),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
  const merge = useMutation({
    mutationFn: (nodeId: string) => mergeNext(tenantId, JSON.parse(flowJson), nodeId),
    onSuccess: (res) => loadFromBotFlow(res.flow as BotFlow, flowId, true),
  });

  const report = reviewQ.data?.report;
  const issues = report?.issues ?? [];
  const busy = busyTurns(report?.turns);

  return (
    <div className="flex flex-col gap-1.5 border-t pt-2">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold">
        Revisión del Studio
        {reviewQ.isFetching && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" aria-hidden />}
      </p>
      <p className="text-[10px] text-muted-foreground">Las mismas reglas que se aplican al publicar: cumplimiento de WhatsApp, límites y costo.</p>
      {reviewQ.error && <p className="text-[11px] text-red-700">No se pudo revisar: {(reviewQ.error as Error).message}</p>}
      {report && issues.length === 0 && <p className="text-[11px] text-emerald-700">Sin hallazgos.</p>}
      {issues.length > 0 && (
        <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto">
          {issues.map((i, n) => (
            <li key={n} className="rounded-md border border-border/50 p-1.5 text-[11px] leading-snug">
              <span className={`font-semibold ${i.level === 'error' ? 'text-red-700' : 'text-amber-700'}`}>{i.code}</span> {i.message}
              {i.fix && (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-1 h-6 px-2 text-[11px]"
                  disabled={merge.isPending}
                  onClick={() => i.fix && merge.mutate(i.fix.nodeId)}
                >
                  <Combine className="mr-1 h-3 w-3" aria-hidden /> Fusionar
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {merge.error && <p className="text-[11px] text-red-700">{merge.error.message}</p>}
      {merge.isSuccess && <p className="text-[11px] text-emerald-700">Fusionado en el lienzo. Guarda para conservarlo.</p>}
      {busy.length > 0 && (
        <div className="text-[11px]">
          <p className="font-semibold">Mensajes por turno</p>
          <ul className="list-disc pl-4 text-muted-foreground">
            {busy.map((t) => (
              <li key={t.entry}>
                Desde «{t.entry}»: {t.messages} mensajes ({t.path.join(' → ')})
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
