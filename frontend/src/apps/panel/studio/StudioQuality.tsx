import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, FlaskConical, GitCompare, History, Loader2, Play, Radar, Trash2, XCircle } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Textarea } from '@/shared/ui/textarea';
import { Alert, AlertDescription } from '@/shared/ui/alert';
import { ApiError } from '@/shared/api/client';
import {
  createTest,
  deleteTest,
  exploreFlow,
  getDiff,
  listTests,
  runTests,
  type ExplorationReport,
  type TestInput,
  type TestRunReport,
} from '@/shared/api/studio';
import { useRollback, useVersions } from '../hooks/use-flows';
import { Section } from './fields';
import { buildExpectation, describeExpectation, pathLabel, publishFailure } from './testing-model';

/**
 * Paso 8 del Studio, parte de calidad (Fase 4): pruebas guardadas, explorador
 * de ramas, qué cambió contra lo publicado y el historial con rollback.
 * Todo corre el motor real en el backend; nada se manda a WhatsApp.
 *
 * `beforeRun` guarda los cambios pendientes antes de correr algo, para probar
 * lo último editado (mismo patrón que el simulador).
 */

type BeforeRun = (() => Promise<void>) | undefined;

const errorText = (e: unknown, fallback: string) => (e instanceof ApiError || e instanceof Error ? e.message : fallback);

// ---------------------------------------------------------------------------
// Pruebas guardadas
// ---------------------------------------------------------------------------

export function TestsPanel({
  tenantId,
  flowId,
  pending,
  onPendingDone,
  beforeRun,
}: {
  tenantId: string;
  flowId: string;
  /** Conversación del simulador por guardar como prueba. */
  pending: { seq: number; draft: TestInput } | null;
  onPendingDone: () => void;
  beforeRun: BeforeRun;
}) {
  const qc = useQueryClient();
  const key = ['studio-tests', tenantId, flowId];
  const testsQ = useQuery({ queryKey: key, queryFn: () => listTests(tenantId, flowId), refetchOnWindowFocus: false });
  const [report, setReport] = useState<TestRunReport | null>(null);

  const run = useMutation({
    mutationFn: async () => {
      if (beforeRun) await beforeRun();
      return runTests(tenantId, flowId, 'draft');
    },
    onSuccess: setReport,
  });
  const remove = useMutation({
    mutationFn: (testId: string) => deleteTest(tenantId, flowId, testId),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  const tests = testsQ.data ?? [];
  const resultOf = (id: string) => report?.results.find((r) => r.id === id);

  return (
    <Section
      title="Pruebas guardadas"
      aside={
        <Button size="sm" variant="outline" disabled={tests.length === 0 || run.isPending} onClick={() => run.mutate()}>
          {run.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-1 h-3.5 w-3.5" />}
          Correr todas
        </Button>
      }
    >
      <p className="text-xs text-muted-foreground">
        Conversaciones que tienen que seguir funcionando. Se corren solas antes de publicar: si una falla, no se publica. Para crear una, platica en
        el simulador y toca <span className="font-medium">Guardar como prueba</span>.
      </p>

      {pending && <NewTestForm key={pending.seq} tenantId={tenantId} flowId={flowId} draft={pending.draft} onDone={onPendingDone} />}

      {testsQ.isLoading && <p className="text-xs text-muted-foreground">Cargando…</p>}
      {testsQ.error && <p className="text-xs text-red-700">{errorText(testsQ.error, 'No se pudieron leer las pruebas')}</p>}
      {!testsQ.isLoading && tests.length === 0 && !pending && <p className="text-xs text-muted-foreground">Todavía no hay pruebas.</p>}

      {report && (
        <p className={`text-xs font-medium ${report.failed ? 'text-red-700' : 'text-emerald-700'}`}>
          {report.failed ? `❌ Fallan ${report.failed} de ${report.total}.` : `✅ Pasan las ${report.total}.`}
        </p>
      )}
      {run.error && <p className="text-xs text-red-700">{errorText(run.error, 'No se pudieron correr')}</p>}

      <ul className="flex flex-col gap-1.5">
        {tests.map((t) => {
          const r = resultOf(t.id);
          return (
            <li key={t.id} className="flex items-start gap-2 rounded-md border px-3 py-2 text-xs">
              {r ? (
                r.passed ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" /> : <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-600" />
              ) : (
                <FlaskConical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              )}
              <div className="min-w-0 flex-1">
                <p className="font-medium">{t.name}</p>
                <p className="text-muted-foreground">
                  {t.events.length} evento(s) · {describeExpectation(t.expect).join(' · ')}
                </p>
                {r && !r.passed && (
                  <ul className="mt-1 list-disc pl-4 text-red-800">
                    {r.failures.map((f, i) => (
                      <li key={i}>{f}</li>
                    ))}
                  </ul>
                )}
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 w-6 shrink-0 p-0"
                title="Borrar la prueba"
                disabled={remove.isPending}
                onClick={() => window.confirm(`¿Borrar la prueba «${t.name}»?`) && remove.mutate(t.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </li>
          );
        })}
      </ul>
      {remove.error && <p className="text-xs text-red-700">{errorText(remove.error, 'No se pudo borrar')}</p>}
    </Section>
  );
}

function NewTestForm({ tenantId, flowId, draft, onDone }: { tenantId: string; flowId: string; draft: TestInput; onDone: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(draft.name);
  const [node, setNode] = useState(draft.expect.node ?? '');
  const [contains, setContains] = useState('');
  const [notContains, setNotContains] = useState('');

  const expect = buildExpectation({ node, contains, notContains }) ?? (draft.expect.maxMessages !== undefined ? draft.expect : null);
  const save = useMutation({
    mutationFn: () => createTest(tenantId, flowId, { ...draft, name: name.trim(), expect: expect! }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['studio-tests', tenantId, flowId] });
      onDone();
    },
  });

  return (
    <div className="flex flex-col gap-2 rounded-md border border-sky-300 bg-sky-50/50 p-3">
      <p className="text-xs font-semibold">Nueva prueba · {draft.events.length} evento(s) del simulador</p>
      <div className="flex flex-col gap-1">
        <Label className="text-xs">Nombre</Label>
        <Input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} className="h-8 text-sm" />
      </div>
      <div className="flex flex-col gap-1">
        <Label className="text-xs">Tiene que terminar en el paso</Label>
        <Input value={node} onChange={(e) => setNode(e.target.value)} placeholder="(sin revisar el paso)" className="h-8 font-mono text-xs" />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label className="text-xs">El bot tiene que decir (uno por línea)</Label>
          <Textarea rows={2} value={contains} onChange={(e) => setContains(e.target.value)} className="text-xs" />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">El bot no debe decir (uno por línea)</Label>
          <Textarea rows={2} value={notContains} onChange={(e) => setNotContains(e.target.value)} className="text-xs" />
        </div>
      </div>
      {!expect && <p className="text-xs text-amber-800">Pon al menos una cosa que revisar.</p>}
      {expect?.maxMessages !== undefined && !expect.node && (
        <p className="text-xs text-muted-foreground">La conversación no quedó en un paso: se revisa que no mande más de {expect.maxMessages} mensaje(s).</p>
      )}
      {save.error && <p className="text-xs text-red-700">{errorText(save.error, 'No se pudo guardar la prueba')}</p>}
      <div className="flex gap-2">
        <Button size="sm" disabled={!expect || !name.trim() || save.isPending} onClick={() => save.mutate()}>
          {save.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />} Guardar prueba
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Explorador de ramas
// ---------------------------------------------------------------------------

export function ExplorerPanel({ tenantId, flowId, beforeRun }: { tenantId: string; flowId: string; beforeRun: BeforeRun }) {
  const [depth, setDepth] = useState(5);
  const explore = useMutation({
    mutationFn: async () => {
      if (beforeRun) await beforeRun();
      return exploreFlow(tenantId, flowId, { source: 'draft', depth });
    },
  });

  return (
    <Section
      title="Explorador de ramas"
      aside={
        <div className="flex items-center gap-1.5">
          <select
            aria-label="Profundidad"
            value={depth}
            onChange={(e) => setDepth(Number(e.target.value))}
            className="h-8 rounded border border-input bg-background px-1 text-xs"
            title="Cuántos pasos seguidos toca el explorador"
          >
            {[3, 4, 5, 6, 7, 8].map((d) => (
              <option key={d} value={d}>{d} pasos</option>
            ))}
          </select>
          <Button size="sm" variant="outline" disabled={explore.isPending} onClick={() => explore.mutate()}>
            {explore.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Radar className="mr-1 h-3.5 w-3.5" />}
            Explorar
          </Button>
        </div>
      }
    >
      <p className="text-xs text-muted-foreground">
        Recorre el bot solo: toca cada botón y fila, escribe las palabras clave y un texto que nadie espera. Muestra a qué pasos no se llega y dónde se
        corta la conversación.
      </p>
      {explore.error && <p className="text-xs text-red-700">{errorText(explore.error, 'No se pudo explorar')}</p>}
      {explore.data && <ExplorationView report={explore.data} />}
    </Section>
  );
}

function ExplorationView({ report }: { report: ExplorationReport }) {
  const { coverage } = report;
  return (
    <div className="flex flex-col gap-2 text-xs">
      <div>
        <div className="flex justify-between">
          <span className="font-medium">
            Llega a {coverage.reached.length} de {coverage.total} pasos
          </span>
          <span className="tabular-nums">{coverage.percent}%</span>
        </div>
        <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
          <div className={`h-full ${coverage.percent === 100 ? 'bg-emerald-500' : 'bg-amber-400'}`} style={{ width: `${coverage.percent}%` }} />
        </div>
        <p className="mt-1 text-muted-foreground">
          {report.runs} conversaciones · a {report.depth} pasos{report.truncated ? ' · se llegó al tope: quedaron caminos sin probar' : ''}
        </p>
      </div>
      {coverage.unreached.length > 0 && (
        <p>
          <span className="font-semibold">Sin alcanzar:</span> {coverage.unreached.map((n) => `«${n}»`).join(', ')}
          <span className="block text-muted-foreground">
            Puede ser normal si se llega escribiendo un dato que el explorador no adivina (un producto del catálogo, por ejemplo).
          </span>
        </p>
      )}
      {report.errors.length > 0 && (
        <div>
          <p className="font-semibold text-red-700">Errores del motor</p>
          <ul className="list-disc pl-4">
            {report.errors.map((e, i) => (
              <li key={i}>
                «{e.nodeId}»: {e.reason} <span className="text-muted-foreground">— {pathLabel(e.path)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {report.deadEnds.length > 0 && (
        <div>
          <p className="font-semibold text-amber-800">Donde se corta la conversación</p>
          <ul className="list-disc pl-4">
            {report.deadEnds.map((d) => (
              <li key={d.nodeId}>
                «{d.nodeId}» <span className="text-muted-foreground">— {pathLabel(d.path)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {report.errors.length === 0 && report.deadEnds.length === 0 && <p className="text-emerald-700">✅ Ningún camino se corta ni truena.</p>}
      <p className="text-muted-foreground">
        Máximo de mensajes en un turno: {report.maxMessagesPerTurn.count} ({pathLabel(report.maxMessagesPerTurn.path)})
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cambios contra lo publicado
// ---------------------------------------------------------------------------

export function DiffPanel({ tenantId, flowId, refreshKey }: { tenantId: string; flowId: string; refreshKey: string }) {
  const diffQ = useQuery({
    queryKey: ['studio-diff', tenantId, flowId, refreshKey],
    queryFn: () => getDiff(tenantId, flowId),
    refetchOnWindowFocus: false,
  });
  const d = diffQ.data;

  return (
    <Section title="Qué cambia al publicar">
      {diffQ.isLoading && <p className="text-xs text-muted-foreground">Comparando…</p>}
      {diffQ.error && <p className="text-xs text-red-700">{errorText(diffQ.error, 'No se pudo comparar')}</p>}
      {d && d.against === null && <p className="text-xs text-muted-foreground">Nunca se ha publicado: todo es nuevo.</p>}
      {d && d.against !== null && d.diff.same && (
        <p className="text-xs text-muted-foreground">
          <GitCompare className="mr-1 inline h-3.5 w-3.5" />
          Lo guardado es igual a la versión {d.against}.
        </p>
      )}
      {d && d.against !== null && !d.diff.same && (
        <div className="flex flex-col gap-1.5 text-xs">
          <p className="text-muted-foreground">Contra la versión {d.against} (la que contesta hoy):</p>
          {d.diff.startChanged && (
            <p>
              El bot ahora empieza en «{d.diff.startChanged.to}» (antes «{d.diff.startChanged.from}»).
            </p>
          )}
          {d.diff.added.length > 0 && <p className="text-emerald-800">+ Pasos nuevos: {d.diff.added.map((n) => `«${n}»`).join(', ')}</p>}
          {d.diff.removed.length > 0 && <p className="text-red-800">− Pasos quitados: {d.diff.removed.map((n) => `«${n}»`).join(', ')}</p>}
          {d.diff.changed.map((c) => (
            <div key={c.nodeId} className="rounded-md border px-2 py-1">
              <p className="font-medium">«{c.nodeId}»</p>
              <ul className="list-disc pl-4">
                {c.changes.map((ch, i) => (
                  <li key={i}>{ch}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Historial y rollback
// ---------------------------------------------------------------------------

export function VersionsPanel({ tenantId, flowId, isSuperAdmin }: { tenantId: string; flowId: string; isSuperAdmin: boolean }) {
  const qc = useQueryClient();
  const versionsQ = useVersions(tenantId, flowId);
  const rollback = useRollback(tenantId);
  const versions = versionsQ.data ?? [];

  const onRollback = (versionNumber: number) => {
    if (!window.confirm(`¿Volver a la versión ${versionNumber}? El bot empieza a contestar con ella en este momento. Tu borrador no se toca.`)) return;
    rollback.mutate(
      { flowId, versionNumber },
      { onSuccess: () => qc.invalidateQueries({ queryKey: ['studio-diff', tenantId, flowId] }) },
    );
  };

  return (
    <Section title="Versiones publicadas">
      {versionsQ.isLoading && <p className="text-xs text-muted-foreground">Cargando…</p>}
      {!versionsQ.isLoading && versions.length === 0 && <p className="text-xs text-muted-foreground">Todavía no hay versiones.</p>}
      <ul className="flex flex-col gap-1">
        {versions.map((v, i) => (
          <li key={v.id} className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs">
            <History className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="font-medium">v{v.versionNumber}</span>
            {i === 0 && <span className="rounded-full bg-emerald-100 px-1.5 text-[10px] font-semibold text-emerald-800">contesta hoy</span>}
            <span className="text-muted-foreground">{new Date(v.createdAt).toLocaleString('es-MX')}</span>
            {v.note && <span className="truncate text-muted-foreground">· {v.note}</span>}
            {isSuperAdmin && i > 0 && (
              <Button size="sm" variant="ghost" className="ml-auto h-6 px-2 text-[11px]" disabled={rollback.isPending} onClick={() => onRollback(v.versionNumber)}>
                Volver a esta
              </Button>
            )}
          </li>
        ))}
      </ul>
      {rollback.error && <PublishErrorAlert error={rollback.error} prefix="No se pudo volver a esa versión" />}
      {rollback.isSuccess && <p className="text-xs text-emerald-700">✅ Publicada como versión {rollback.data.versionNumber}.</p>}
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Rechazo de publicar
// ---------------------------------------------------------------------------

export function PublishErrorAlert({ error, prefix = 'No se pudo publicar' }: { error: unknown; prefix?: string }) {
  const f = publishFailure(error);
  return (
    <Alert variant="destructive">
      <AlertDescription>
        <p className="font-medium">
          {prefix}: {f.message}
        </p>
        {f.tests.length > 0 && (
          <ul className="mt-1 list-disc pl-4 text-xs">
            {f.tests.map((t) => (
              <li key={t.name}>
                <span className="font-medium">{t.name}:</span> {t.failures.join(' ')}
              </li>
            ))}
          </ul>
        )}
        {f.issues.length > 0 && (
          <ul className="mt-1 list-disc pl-4 text-xs">
            {f.issues.map((i, n) => (
              <li key={n}>
                {i.path && <span className="font-mono">{i.path}: </span>}
                {i.message}
              </li>
            ))}
          </ul>
        )}
      </AlertDescription>
    </Alert>
  );
}
