import { useCallback, useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Loader2, Save, Send, Wand2 } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Badge } from '@/shared/ui/badge';
import { Alert, AlertDescription } from '@/shared/ui/alert';
import { ApiError } from '@/shared/api/client';
import {
  previewWizard,
  saveWizard,
  type StudioMold,
  type TestInput,
  type ValidationReport,
  type WhatsAppLimits,
  type WizardSpec,
  type WizardState,
} from '@/shared/api/studio';
import { updateTenant, type TenantDetail } from '@/shared/api/tenants';
import { WhatsAppSimulator } from '@/shared/simulator/WhatsAppSimulator';
import { usePublish } from '../hooks/use-flows';
import { useTemplates } from '../hooks/use-templates';
import { useAssignMolde } from '../hooks/use-molde';
import {
  STEPS,
  businessFromTenant,
  businessPatch,
  stepForIssue,
  withSuggestedTexts,
  type BusinessForm,
  type StepKey,
} from './wizard-model';
import {
  StepDespedida,
  StepHumano,
  StepNegocio,
  StepNoEntiende,
  StepOpciones,
  StepPrimerMensaje,
  StepPublicar,
  StepReconocimiento,
  type StepProps,
} from './steps';
import { DiffPanel, ExplorerPanel, PublishErrorAlert, TestsPanel, VersionsPanel } from './StudioQuality';
import { testFromConversation } from './testing-model';

/**
 * Pantallas del Studio: el editor del asistente y sus puntos de partida
 * (sin bot, bot que no salió del asistente). La página vive en
 * routes/tenants.$id.studio.tsx.
 */

export function Loading() {
  return (
    <p className="flex items-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" /> Cargando el Studio…
    </p>
  );
}

export function StudioEditor({
  tenantId,
  flowId,
  tenant,
  wizard,
  molds,
  limits,
  isSuperAdmin,
}: {
  tenantId: string;
  flowId: string;
  tenant: TenantDetail;
  wizard: WizardState;
  molds: StudioMold[];
  limits: WhatsAppLimits['limits'];
  isSuperAdmin: boolean;
}) {
  const qc = useQueryClient();
  const publish = usePublish(tenantId);

  const [spec, setSpecState] = useState<WizardSpec | null>(wizard.spec);
  const [savedSpec, setSavedSpec] = useState<string | null>(wizard.spec ? JSON.stringify(wizard.spec) : null);
  const [draftUpdatedAt, setDraftUpdatedAt] = useState(wizard.draftUpdatedAt);
  const [source, setSource] = useState(wizard.source);
  const [businessBase, setBusinessBase] = useState<BusinessForm>(() => businessFromTenant(tenant));
  const [business, setBusinessState] = useState<BusinessForm>(businessBase);
  const [step, setStep] = useState<StepKey>('negocio');
  const [report, setReport] = useState<ValidationReport | null>(null);
  const [specError, setSpecError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pendingTest, setPendingTest] = useState<{ seq: number; draft: TestInput } | null>(null);

  const specDirty = spec !== null && JSON.stringify(spec) !== savedSpec;
  const patch = businessPatch(businessBase, business);
  const dirty = specDirty || patch !== null;

  const setSpec = useCallback((update: (s: WizardSpec) => WizardSpec) => setSpecState((s) => (s ? update(s) : s)), []);
  const setBusiness = useCallback((p: Partial<BusinessForm>) => setBusinessState((b) => ({ ...b, ...p })), []);

  // Validación en vivo: compila y valida en el backend sin guardar.
  useEffect(() => {
    if (!spec) return;
    const timer = setTimeout(() => {
      previewWizard(tenantId, spec)
        .then((r) => {
          setReport(r.report);
          setSpecError(null);
        })
        .catch((e: unknown) => {
          setReport(null);
          const issues = e instanceof ApiError ? (e.body as { issues?: Array<{ path: string; message: string }> } | undefined)?.issues : undefined;
          setSpecError(issues?.length ? `${issues[0].path}: ${issues[0].message}` : 'La especificación no es válida');
        });
    }, 400);
    return () => clearTimeout(timer);
  }, [spec, tenantId]);

  const save = useCallback(async () => {
    setSaving(true);
    setSaveError(null);
    try {
      if (patch) {
        await updateTenant(tenantId, patch);
        setBusinessBase(business);
        qc.invalidateQueries({ queryKey: ['tenant', tenantId] });
      }
      if (spec && specDirty && isSuperAdmin) {
        const res = await saveWizard(tenantId, flowId, spec, draftUpdatedAt);
        setSavedSpec(JSON.stringify(spec));
        setDraftUpdatedAt(res.draftUpdatedAt);
        setReport(res.report);
        setSource('draft');
        qc.invalidateQueries({ queryKey: ['flows', tenantId] });
        qc.invalidateQueries({ queryKey: ['flow-draft', tenantId, flowId] });
      }
    } catch (e) {
      setSaveError(e instanceof ApiError ? e.message : 'No se pudo guardar');
      throw e;
    } finally {
      setSaving(false);
    }
  }, [patch, spec, specDirty, isSuperAdmin, tenantId, flowId, draftUpdatedAt, business, qc]);

  const startFromMold = (mold: StudioMold) => {
    setSpecState(structuredClone(mold.spec));
    setSavedSpec(null);
    setBusinessState((b) => withSuggestedTexts(b, mold.textosSugeridos));
    setStep('negocio');
  };

  const onPublish = () =>
    publish.mutate(
      { flowId },
      {
        onSuccess: () => {
          setSource('published');
          setDraftUpdatedAt(null);
        },
      },
    );

  if (!spec) {
    return <StartScreen tenant={tenant} reason={wizard.reason} molds={molds} canStart={isSuperAdmin} onStart={startFromMold} />;
  }

  const errors = report?.summary.errors ?? 0;
  const warnings = report?.summary.warnings ?? 0;
  const canPublish = isSuperAdmin && !dirty && source === 'draft' && !!report?.ok && !!report?.schema.ok;
  const stepIndex = STEPS.findIndex((s) => s.key === step);
  const issuesPerStep = (key: StepKey) => (report?.issues ?? []).filter((i) => stepForIssue(i, spec) === key);

  const actions = (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant="outline" disabled={!dirty || saving} onClick={() => void save().catch(() => undefined)}>
        {saving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1 h-3.5 w-3.5" />}
        Guardar
      </Button>
      {isSuperAdmin && (
        <Button size="sm" disabled={!canPublish || publish.isPending} onClick={onPublish} title={publishHint(dirty, source, report)}>
          {publish.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1 h-3.5 w-3.5" />}
          Publicar
        </Button>
      )}
    </div>
  );

  /** Antes de simular o correr pruebas se guarda lo pendiente: se prueba lo último editado. */
  const beforeRun = dirty ? () => save() : undefined;

  const stepProps: StepProps = { spec, setSpec, business, setBusiness, limits, canEditStructure: isSuperAdmin, report, goTo: setStep };

  return (
    <div className="flex flex-col gap-3">
      <header className="flex flex-wrap items-center gap-3">
        <Link to="/tenants/$id" params={{ id: tenantId }} className="text-xs text-muted-foreground hover:underline">
          ← {tenant.nombre_negocio}
        </Link>
        <h1 className="text-lg font-semibold">Studio</h1>
        <Badge variant={source === 'draft' ? 'secondary' : 'outline'}>
          {dirty ? 'Cambios sin guardar' : source === 'draft' ? 'Borrador sin publicar' : 'Igual a lo publicado'}
        </Badge>
        <span className={`text-xs ${errors ? 'text-red-700' : 'text-muted-foreground'}`}>
          {report ? `${errors} error(es) · ${warnings} aviso(s)` : specError ? '' : 'Revisando…'}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {isSuperAdmin && (
            <Link to="/tenants/$id/designer" params={{ id: tenantId }} className="text-xs text-muted-foreground hover:underline">
              Modo avanzado (Designer)
            </Link>
          )}
          {actions}
        </div>
      </header>

      {!isSuperAdmin && (
        <Alert>
          <AlertDescription>Puedes editar los datos y textos del negocio. Cambiar la estructura del bot y publicar es de super_admin.</AlertDescription>
        </Alert>
      )}
      {specError && (
        <Alert variant="destructive">
          <AlertDescription>Hay algo que el asistente no puede compilar: {specError}</AlertDescription>
        </Alert>
      )}
      {saveError && (
        <Alert variant="destructive">
          <AlertDescription>{saveError}</AlertDescription>
        </Alert>
      )}
      {publish.error && <PublishErrorAlert error={publish.error} />}
      {publish.isSuccess && !dirty && source === 'published' && (
        <Alert>
          <AlertDescription>✅ Publicado como versión {publish.data.versionNumber}. El bot ya contesta con esto.</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-[11rem_minmax(0,1fr)_23rem]">
        <nav className="flex flex-row flex-wrap gap-1 lg:flex-col">
          {STEPS.map((s, i) => {
            const stepIssues = issuesPerStep(s.key);
            const hasError = stepIssues.some((x) => x.level === 'error');
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => setStep(s.key)}
                className={`flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs ${
                  step === s.key ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
                }`}
              >
                <span>{i + 1}. {s.title}</span>
                {stepIssues.length > 0 && (
                  <span className={`rounded-full px-1.5 text-[10px] font-semibold ${hasError ? 'bg-red-600 text-white' : 'bg-amber-400 text-amber-950'}`}>
                    {stepIssues.length}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <main className="flex min-w-0 flex-col gap-3">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Wand2 className="h-4 w-4" /> {stepIndex + 1}. {STEPS[stepIndex].title}
          </h2>
          {step === 'negocio' && <StepNegocio {...stepProps} />}
          {step === 'primer-mensaje' && <StepPrimerMensaje {...stepProps} />}
          {step === 'opciones' && <StepOpciones {...stepProps} />}
          {step === 'reconocimiento' && <StepReconocimiento {...stepProps} />}
          {step === 'no-entiende' && <StepNoEntiende {...stepProps} />}
          {step === 'humano' && <StepHumano {...stepProps} />}
          {step === 'despedida' && <StepDespedida {...stepProps} />}
          {step === 'publicar' && (
            <>
              <StepPublicar {...stepProps} actions={actions} />
              <TestsPanel
                tenantId={tenantId}
                flowId={flowId}
                pending={pendingTest}
                onPendingDone={() => setPendingTest(null)}
                beforeRun={beforeRun}
              />
              <ExplorerPanel tenantId={tenantId} flowId={flowId} beforeRun={beforeRun} />
              <DiffPanel tenantId={tenantId} flowId={flowId} refreshKey={`${draftUpdatedAt ?? ''}|${source}|${publish.data?.versionNumber ?? ''}`} />
              <VersionsPanel tenantId={tenantId} flowId={flowId} isSuperAdmin={isSuperAdmin} />
            </>
          )}
          <div className="flex justify-between">
            <Button size="sm" variant="ghost" disabled={stepIndex === 0} onClick={() => setStep(STEPS[stepIndex - 1].key)}>
              <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Anterior
            </Button>
            {stepIndex < STEPS.length - 1 && (
              <Button size="sm" variant="ghost" onClick={() => setStep(STEPS[stepIndex + 1].key)}>
                Siguiente <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </main>

        <aside className="flex flex-col gap-2 self-start lg:sticky lg:top-4">
          <p className="text-[11px] text-muted-foreground">
            {dirty
              ? isSuperAdmin
                ? 'Al mandar un mensaje se guardan primero tus cambios.'
                : 'El simulador prueba lo último guardado.'
              : 'El simulador prueba el borrador guardado.'}
          </p>
          <WhatsAppSimulator
            tenantId={tenantId}
            flowId={flowId}
            source="draft"
            compact
            onBeforeSend={beforeRun}
            onSaveAsTest={(conversation) => {
              setPendingTest({ seq: Date.now(), draft: testFromConversation(conversation) });
              setStep('publicar');
            }}
          />
        </aside>
      </div>
    </div>
  );
}

function publishHint(dirty: boolean, source: WizardState['source'], report: ValidationReport | null): string {
  if (dirty) return 'Guarda antes de publicar';
  if (source !== 'draft') return 'No hay cambios sin publicar';
  if (!report) return 'Revisando…';
  if (!report.ok) return 'Corrige los errores antes de publicar';
  if (!report.schema.ok) return 'El flujo todavía no se puede publicar';
  return 'Publicar: el bot empieza a contestar con esto';
}

function StartScreen({
  tenant,
  reason,
  molds,
  canStart,
  onStart,
}: {
  tenant: TenantDetail;
  reason: WizardState['reason'];
  molds: StudioMold[];
  canStart: boolean;
  onStart: (mold: StudioMold) => void;
}) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <Link to="/tenants/$id" params={{ id: tenant.id }} className="text-xs text-muted-foreground hover:underline">
        ← {tenant.nombre_negocio}
      </Link>
      <h1 className="text-lg font-semibold">Studio · {tenant.nombre_negocio}</h1>
      {reason === 'edited_elsewhere' ? (
        <Alert variant="destructive">
          <AlertDescription>
            Este bot se creó con el asistente pero después se editó en el Designer. Abrirlo aquí perdería esos cambios: sigue en el
            {' '}<Link to="/tenants/$id/designer" params={{ id: tenant.id }} className="underline">Designer</Link>, o empieza de nuevo desde un molde
            (reemplaza el borrador; lo publicado sigue igual hasta que publiques).
          </AlertDescription>
        </Alert>
      ) : (
        <p className="text-sm text-muted-foreground">
          El bot actual no se armó con el asistente. Empieza desde un molde: se crea un borrador y el bot sigue contestando con lo publicado hasta que publiques.
        </p>
      )}
      {molds.map((m) => (
        <div key={m.id} className="flex items-center justify-between gap-3 rounded-lg border bg-card p-4">
          <div>
            <p className="text-sm font-semibold">{m.nombre}</p>
            <p className="text-xs text-muted-foreground">{m.descripcion}</p>
          </div>
          <Button size="sm" disabled={!canStart} onClick={() => onStart(m)}>
            <Wand2 className="mr-1 h-3.5 w-3.5" /> Empezar con este molde
          </Button>
        </div>
      ))}
      {!canStart && <p className="text-xs text-muted-foreground">Crear el bot desde un molde es de super_admin.</p>}
    </div>
  );
}

export function NoFlow({ tenant }: { tenant: TenantDetail }) {
  const templatesQ = useTemplates();
  const assign = useAssignMolde(tenant.id);
  const qc = useQueryClient();
  const template = templatesQ.data?.find((t) => t.giro === tenant.giro) ?? templatesQ.data?.find((t) => t.giro === 'cerrajeria');
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-3">
      <h1 className="text-lg font-semibold">Studio · {tenant.nombre_negocio}</h1>
      <p className="text-sm text-muted-foreground">Este negocio todavía no tiene bot. Primero se le asigna un molde; después se ajusta aquí.</p>
      {template ? (
        <Button
          className="self-start"
          disabled={assign.isPending}
          onClick={() => assign.mutate(template.slug, { onSuccess: () => qc.invalidateQueries({ queryKey: ['flows', tenant.id] }) })}
        >
          {assign.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Crear el bot con el molde «{template.nombre}»
        </Button>
      ) : (
        <Link to="/tenants/$id/whatsapp" params={{ id: tenant.id }} className="text-sm underline">Asignar un molde desde WhatsApp</Link>
      )}
      {assign.error && (
        <Alert variant="destructive">
          <AlertDescription>{assign.error.message}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}

