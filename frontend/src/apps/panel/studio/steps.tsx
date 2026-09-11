import type { ReactNode } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Label } from '@/shared/ui/label';
import { Input } from '@/shared/ui/input';
import type {
  CaptureCheck,
  CaptureRule,
  ValidationIssue,
  ValidationReport,
  WhatsAppLimits,
  WizardCaptureOption,
  WizardEscape,
  WizardOption,
  WizardSpec,
} from '@/shared/api/studio';
import { EngineNote, KeywordsField, Section, TextField, VariableChips } from './fields';
import {
  CAPTURE_TYPES,
  STEPS,
  availableVariables,
  checkForType,
  optionalNumber,
  type CaptureTypeChoice,
  isValidHours,
  newOption,
  presentation,
  removeOption,
  stepForIssue,
  type BusinessForm,
  type StepKey,
} from './wizard-model';

export type { BusinessForm } from './wizard-model';

export interface StepProps {
  spec: WizardSpec;
  setSpec: (update: (s: WizardSpec) => WizardSpec) => void;
  business: BusinessForm;
  setBusiness: (patch: Partial<BusinessForm>) => void;
  limits: WhatsAppLimits['limits'];
  /** Cambiar la estructura del bot es de super_admin. */
  canEditStructure: boolean;
  report: ValidationReport | null;
  goTo: (step: StepKey) => void;
  /** Palabras de escape que propone el backend a un bot que no las tiene (C-08). */
  escapeDefaults: WizardEscape;
}

const MAX_OPTIONS = 10;

function updateOption(spec: WizardSpec, id: string, patch: (o: WizardOption) => WizardOption): WizardSpec {
  return { ...spec, options: spec.options.map((o) => (o.id === id ? patch(o) : o)) };
}

function StepIssues({ report, spec, step }: { report: ValidationReport | null; spec: WizardSpec; step: StepKey }) {
  const issues = (report?.issues ?? []).filter((i) => stepForIssue(i, spec) === step);
  if (issues.length === 0) return null;
  return <IssueList issues={issues} />;
}

export function IssueList({ issues, onGo, spec }: { issues: ValidationIssue[]; onGo?: (step: StepKey) => void; spec?: WizardSpec }) {
  return (
    <ul className="flex flex-col gap-1">
      {issues.map((i, n) => (
        <li
          key={n}
          className={`rounded-md border px-3 py-1.5 text-xs ${
            i.level === 'error' ? 'border-red-300 bg-red-50 text-red-900' : 'border-amber-300 bg-amber-50 text-amber-900'
          }`}
        >
          <span className="font-semibold">{i.level === 'error' ? 'Error' : 'Aviso'} {i.code}:</span> {i.message}
          {onGo && spec && (
            <button type="button" className="ml-2 underline" onClick={() => onGo(stepForIssue(i, spec))}>
              Ir a «{STEPS.find((s) => s.key === stepForIssue(i, spec))?.title}»
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// 1. Negocio
// ---------------------------------------------------------------------------

export function StepNegocio({ business, setBusiness, limits }: StepProps) {
  const hoursHint = (v: string) =>
    isValidHours(v) ? 'Formato HH:MM-HH:MM, por ejemplo 09:00-19:00. Vacío = sin horario (el bot atiende siempre).' : (
      <span className="text-red-600">Usa el formato HH:MM-HH:MM, por ejemplo 09:00-19:00.</span>
    );
  return (
    <>
      <Section title="El negocio">
        <TextField label="Nombre del negocio ({{nombre_negocio}})" value={business.nombre_negocio} onChange={(v) => setBusiness({ nombre_negocio: v })} />
      </Section>
      <Section title="Horario de atención">
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label="Lunes a viernes" value={business.horario_semana} onChange={(v) => setBusiness({ horario_semana: v })} hint={hoursHint(business.horario_semana)} />
          <TextField label="Sábado" value={business.horario_sabado} onChange={(v) => setBusiness({ horario_sabado: v })} hint={hoursHint(business.horario_sabado)} />
        </div>
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={business.abre_domingo} onChange={(e) => setBusiness({ abre_domingo: e.target.checked })} />
          Abre el domingo (con el horario del sábado)
        </label>
        <TextField
          label="Mensaje fuera de horario"
          value={business.mensaje_fuera_horario}
          onChange={(v) => setBusiness({ mensaje_fuera_horario: v })}
          max={limits.text.bodyMax}
          multiline
          rows={2}
        />
        <EngineNote>Fuera de horario el bot solo manda este mensaje y deja la conversación donde iba; al abrir, sigue desde ahí. El dueño puede probar su bot a cualquier hora.</EngineNote>
      </Section>
      <Section title="Quién atiende cuando el bot pasa a una persona">
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label="Nombre del dueño" value={business.owner_nombre} onChange={(v) => setBusiness({ owner_nombre: v })} />
          <TextField
            label="WhatsApp del dueño"
            value={business.owner_whatsapp}
            onChange={(v) => setBusiness({ owner_whatsapp: v })}
            placeholder="7471234567"
            hint="Aquí llegan las alertas. Desde este número el dueño manda #listo para devolverle la conversación al bot."
          />
        </div>
      </Section>
    </>
  );
}

// ---------------------------------------------------------------------------
// 2. Primer mensaje
// ---------------------------------------------------------------------------

export function StepPrimerMensaje({ spec, setSpec, business, setBusiness, limits, canEditStructure, report, goTo }: StepProps) {
  const mode = presentation(spec);
  const bodyMax = mode === 'botones' ? limits.replyButtons.bodyMax : limits.list.bodyMax;
  const combined = `${business.mensaje_bienvenida}\n\n${business.mensaje_menu_principal}`;
  return (
    <>
      <StepIssues report={report} spec={spec} step="primer-mensaje" />
      <Section title="Saludo y menú, en un solo mensaje">
        <TextField label="Saludo" value={business.mensaje_bienvenida} onChange={(v) => setBusiness({ mensaje_bienvenida: v })} multiline rows={2} />
        <TextField
          label="Texto del menú"
          value={business.mensaje_menu_principal}
          onChange={(v) => setBusiness({ mensaje_menu_principal: v })}
          multiline
          rows={2}
          hint={`Saludo y menú van juntos en el mismo mensaje: ${[...combined].length}/${bodyMax} caracteres.`}
        />
        <EngineNote>Estos textos son del negocio, no del flujo: cambiarlos no obliga a publicar una versión nueva. No admiten {'{{variables}}'}.</EngineNote>
      </Section>
      <Section title={`Se envía como ${mode === 'botones' ? 'botones' : 'lista'} (${spec.options.length} opciones)`}>
        <p className="text-xs text-muted-foreground">
          Con hasta {limits.replyButtons.buttonsMax} opciones el menú va en botones; con más, en una lista de hasta {limits.list.rowsTotalMax}.
        </p>
        <ul className="flex flex-wrap gap-1">
          {spec.options.map((o) => (
            <li key={o.id} className="rounded-full border border-emerald-400 px-2 py-0.5 text-xs text-emerald-700">{o.title}</li>
          ))}
        </ul>
        {mode === 'lista' && (
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField
              label="Botón que abre la lista"
              value={spec.menu.listButtonLabel}
              max={limits.list.buttonLabelMax}
              disabled={!canEditStructure}
              onChange={(v) => setSpec((s) => ({ ...s, menu: { ...s.menu, listButtonLabel: v } }))}
            />
            <TextField
              label="Título de la sección"
              value={spec.menu.listSectionTitle}
              max={limits.list.sectionTitleMax}
              disabled={!canEditStructure}
              onChange={(v) => setSpec((s) => ({ ...s, menu: { ...s.menu, listSectionTitle: v } }))}
            />
          </div>
        )}
        <Button size="sm" variant="outline" onClick={() => goTo('opciones')}>Editar las opciones</Button>
      </Section>
    </>
  );
}

// ---------------------------------------------------------------------------
// 3. Opciones
// ---------------------------------------------------------------------------

const KIND_LABEL: Record<WizardOption['kind'], string> = {
  capture: 'Pide datos y pasa a una persona',
  info: 'Da información',
  human: 'Pasa directo a una persona',
};

export function StepOpciones(props: StepProps) {
  const { spec, setSpec, canEditStructure, report } = props;
  const move = (index: number, delta: number) =>
    setSpec((s) => {
      const options = [...s.options];
      const [item] = options.splice(index, 1);
      options.splice(index + delta, 0, item);
      return { ...s, options };
    });
  return (
    <>
      <StepIssues report={report} spec={spec} step="opciones" />
      {spec.options.map((o, index) => (
        <Section
          key={o.id}
          title={`${index + 1}. ${o.title || '(sin título)'}`}
          aside={
            canEditStructure && (
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" disabled={index === 0} onClick={() => move(index, -1)} title="Subir"><ArrowUp className="h-3.5 w-3.5" /></Button>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" disabled={index === spec.options.length - 1} onClick={() => move(index, 1)} title="Bajar"><ArrowDown className="h-3.5 w-3.5" /></Button>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" disabled={spec.options.length === 1} onClick={() => setSpec((s) => removeOption(s, o.id))} title="Quitar"><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            )
          }
        >
          <OptionEditor option={o} {...props} />
        </Section>
      ))}
      {canEditStructure && spec.options.length < MAX_OPTIONS && (
        <div className="flex flex-wrap gap-2">
          {(['capture', 'info', 'human'] as const).map((kind) => (
            <Button key={kind} size="sm" variant="outline" onClick={() => setSpec((s) => ({ ...s, options: [...s.options, newOption(kind, s)] }))}>
              <Plus className="mr-1 h-3.5 w-3.5" /> {KIND_LABEL[kind]}
            </Button>
          ))}
        </div>
      )}
    </>
  );
}

function OptionEditor({ option, spec, setSpec, limits, canEditStructure }: StepProps & { option: WizardOption }) {
  const mode = presentation(spec);
  const titleMax = mode === 'botones' ? limits.replyButtons.buttonTitleMax : limits.list.rowTitleMax;
  const set = (patch: (o: WizardOption) => WizardOption) => setSpec((s) => updateOption(s, option.id, patch));
  const disabled = !canEditStructure;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[11px] text-muted-foreground">
        {KIND_LABEL[option.kind]} · id <code>{option.id}</code>
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label="Texto del botón" value={option.title} max={titleMax} disabled={disabled} onChange={(v) => set((o) => ({ ...o, title: v }))} />
        {mode === 'lista' && (
          <TextField
            label="Descripción (se ve en la lista)"
            value={option.description ?? ''}
            max={limits.list.rowDescriptionMax}
            disabled={disabled}
            onChange={(v) => set((o) => ({ ...o, description: v || undefined }))}
          />
        )}
      </div>

      {option.kind === 'capture' && <CaptureEditor option={option} set={set} limits={limits} disabled={disabled} spec={spec} />}

      {option.kind === 'info' && (
        <>
          <TextField
            label="Información"
            value={option.text}
            max={limits.replyButtons.bodyMax}
            multiline
            rows={5}
            disabled={disabled}
            onChange={(v) => set((o) => ({ ...o, text: v }))}
          />
          <VariableChips vars={['nombre_negocio']} />
          <Label className="text-xs">Botones debajo de la información (1 a 3)</Label>
          {option.actions.map((a, i) => (
            <div key={i} className="flex items-end gap-2">
              <div className="flex-1">
                <TextField
                  label={`Botón ${i + 1}`}
                  value={a.title}
                  max={limits.replyButtons.buttonTitleMax}
                  disabled={disabled}
                  onChange={(v) => set((o) => (o.kind === 'info' ? { ...o, actions: o.actions.map((x, j) => (j === i ? { ...x, title: v } : x)) } : o))}
                />
              </div>
              <select
                value={a.goto}
                disabled={disabled}
                onChange={(e) => set((o) => (o.kind === 'info' ? { ...o, actions: o.actions.map((x, j) => (j === i ? { ...x, goto: e.target.value } : x)) } : o))}
                className="h-8 rounded border border-input bg-background px-2 text-xs"
              >
                {spec.options.filter((x) => x.id !== option.id).map((x) => (
                  <option key={x.id} value={x.id}>Lleva a: {x.title}</option>
                ))}
                <option value="farewell">Lleva a: la despedida</option>
              </select>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0"
                disabled={disabled || option.actions.length === 1}
                onClick={() => set((o) => (o.kind === 'info' ? { ...o, actions: o.actions.filter((_, j) => j !== i) } : o))}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
          {option.actions.length < 3 && !disabled && (
            <Button size="sm" variant="outline" className="self-start" onClick={() => set((o) => (o.kind === 'info' ? { ...o, actions: [...o.actions, { title: 'Salir', goto: 'farewell' }] } : o))}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Botón
            </Button>
          )}
        </>
      )}

      {option.kind === 'human' && <EngineNote>Al elegirla, el bot pasa la conversación a una persona. Los textos se editan en «Paso a humano».</EngineNote>}
    </div>
  );
}

function CaptureEditor({
  option,
  set,
  limits,
  disabled,
  spec,
}: {
  option: WizardCaptureOption;
  set: (patch: (o: WizardOption) => WizardOption) => void;
  limits: WhatsAppLimits['limits'];
  disabled: boolean;
  spec: WizardSpec;
}) {
  const setCapture = (patch: (o: WizardCaptureOption) => WizardCaptureOption) =>
    set((o) => (o.kind === 'capture' ? patch(o) : o));
  const choices = option.choices;
  return (
    <>
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={!!choices}
          disabled={disabled}
          onChange={(e) =>
            setCapture((o) => ({
              ...o,
              choices: e.target.checked
                ? { text: '¿Qué necesitas?', buttonLabel: 'Ver opciones', sectionTitle: 'Opciones', items: [{ title: 'Opción 1' }], saveAs: `tipo_${o.id}`.slice(0, 40) }
                : null,
            }))
          }
        />
        Antes de pedir los datos, que el cliente elija el tipo de caso de una lista
      </label>
      {choices && (
        <div className="flex flex-col gap-2 rounded-md border border-dashed p-3">
          <TextField label="Texto de la lista" value={choices.text} max={limits.list.bodyMax} multiline rows={2} disabled={disabled} onChange={(v) => setCapture((o) => ({ ...o, choices: o.choices && { ...o.choices, text: v } }))} />
          <div className="grid gap-2 sm:grid-cols-3">
            <TextField label="Botón que abre la lista" value={choices.buttonLabel} max={limits.list.buttonLabelMax} disabled={disabled} onChange={(v) => setCapture((o) => ({ ...o, choices: o.choices && { ...o.choices, buttonLabel: v } }))} />
            <TextField label="Título de la sección" value={choices.sectionTitle} max={limits.list.sectionTitleMax} disabled={disabled} onChange={(v) => setCapture((o) => ({ ...o, choices: o.choices && { ...o.choices, sectionTitle: v } }))} />
            <TextField label="Se guarda en" value={choices.saveAs} disabled={disabled} onChange={(v) => setCapture((o) => ({ ...o, choices: o.choices && { ...o.choices, saveAs: v } }))} hint={`Úsala como {{${choices.saveAs}}}`} />
          </div>
          {choices.items.map((it, i) => (
            <div key={i} className="flex items-end gap-2">
              <div className="grid flex-1 gap-2 sm:grid-cols-2">
                <TextField label={`Caso ${i + 1}`} value={it.title} max={limits.list.rowTitleMax} disabled={disabled} onChange={(v) => setCapture((o) => ({ ...o, choices: o.choices && { ...o.choices, items: o.choices.items.map((x, j) => (j === i ? { ...x, title: v } : x)) } }))} />
                <TextField label="Descripción" value={it.description ?? ''} max={limits.list.rowDescriptionMax} disabled={disabled} onChange={(v) => setCapture((o) => ({ ...o, choices: o.choices && { ...o.choices, items: o.choices.items.map((x, j) => (j === i ? { ...x, description: v || undefined } : x)) } }))} />
              </div>
              <Button size="sm" variant="ghost" className="h-8 w-8 p-0" disabled={disabled || choices.items.length === 1} onClick={() => setCapture((o) => ({ ...o, choices: o.choices && { ...o.choices, items: o.choices.items.filter((_, j) => j !== i) } }))}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
          {choices.items.length < limits.list.rowsTotalMax && !disabled && (
            <Button size="sm" variant="outline" className="self-start" onClick={() => setCapture((o) => ({ ...o, choices: o.choices && { ...o.choices, items: [...o.choices.items, { title: `Opción ${o.choices.items.length + 1}` }] } }))}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Caso
            </Button>
          )}
        </div>
      )}

      <TextField label="Pregunta para pedir los datos" value={option.question} max={limits.text.bodyMax} multiline rows={4} disabled={disabled} onChange={(v) => setCapture((o) => ({ ...o, question: v }))} />
      <TextField label="La respuesta se guarda en" value={option.saveAs} disabled={disabled} onChange={(v) => setCapture((o) => ({ ...o, saveAs: v }))} hint={`Úsala como {{${option.saveAs}}} en la confirmación y en la alerta.`} />
      <CaptureCheckEditor check={option.check} disabled={disabled} limits={limits} onChange={(check) => setCapture((o) => ({ ...o, check }))} />

      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={!!option.confirm}
          disabled={disabled}
          onChange={(e) =>
            setCapture((o) => ({
              ...o,
              confirm: e.target.checked
                ? { text: `Esto fue lo que recibí:\n\n_{{${o.saveAs}}}_\n\n¿Es correcto?`, yesTitle: '✅ Sí, correcto', noTitle: '✏️ Corregir', yesKeywords: ['si', 'sí', 'correcto', 'ok'], noKeywords: ['no', 'corregir'] }
                : null,
            }))
          }
        />
        Mostrar lo recibido y preguntar si es correcto antes de pasar a una persona
      </label>
      {option.confirm && (
        <div className="flex flex-col gap-2 rounded-md border border-dashed p-3">
          <TextField label="Confirmación" value={option.confirm.text} max={limits.replyButtons.bodyMax} multiline rows={3} disabled={disabled} onChange={(v) => setCapture((o) => ({ ...o, confirm: o.confirm && { ...o.confirm, text: v } }))} />
          <VariableChips vars={availableVariables(spec)} />
          <div className="grid gap-2 sm:grid-cols-2">
            <TextField label="Botón «sí»" value={option.confirm.yesTitle} max={limits.replyButtons.buttonTitleMax} disabled={disabled} onChange={(v) => setCapture((o) => ({ ...o, confirm: o.confirm && { ...o.confirm, yesTitle: v } }))} />
            <TextField label="Botón «corregir»" value={option.confirm.noTitle} max={limits.replyButtons.buttonTitleMax} disabled={disabled} onChange={(v) => setCapture((o) => ({ ...o, confirm: o.confirm && { ...o.confirm, noTitle: v } }))} />
          </div>
        </div>
      )}
      <EngineNote>Al final pasa a una persona. Los textos de ese momento se editan en «Paso a humano».</EngineNote>
    </>
  );
}

/**
 * Qué acepta la pregunta como respuesta (C-04). Lo revisa el motor; aquí solo
 * se elige. Sin revisión, acepta cualquier texto, como siempre.
 */
function CaptureCheckEditor({
  check,
  onChange,
  disabled,
  limits,
}: {
  check: CaptureCheck | undefined;
  onChange: (check: CaptureCheck | undefined) => void;
  disabled: boolean;
  limits: WhatsAppLimits['limits'];
}) {
  const rule = check?.rule;
  const setRule = (patch: Record<string, unknown>) => check && onChange({ ...check, rule: { ...check.rule, ...patch } as CaptureRule });
  return (
    <div className="flex flex-col gap-2 rounded-md border border-dashed p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Label className="text-xs">Qué respuesta acepta</Label>
        <select
          value={rule?.type ?? 'free'}
          disabled={disabled}
          onChange={(e) => onChange(checkForType(check, e.target.value as CaptureTypeChoice))}
          className="h-8 rounded border border-input bg-background px-1 text-xs"
        >
          {CAPTURE_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>
      {rule?.type === 'number' && (
        <div className="grid items-end gap-2 sm:grid-cols-3">
          <NumberField label="Mínimo" value={rule.min} disabled={disabled} onChange={(v) => setRule({ min: v })} />
          <NumberField label="Máximo" value={rule.max} disabled={disabled} onChange={(v) => setRule({ max: v })} />
          <label className="flex items-center gap-2 pb-2 text-xs">
            <input type="checkbox" checked={!!rule.integer} disabled={disabled} onChange={(e) => setRule({ integer: e.target.checked || undefined })} />
            Solo enteros
          </label>
        </div>
      )}
      {rule?.type === 'text' && (
        <div className="grid gap-2 sm:grid-cols-2">
          <NumberField label="Mínimo de caracteres" value={rule.min_length} disabled={disabled} onChange={(v) => setRule({ min_length: v })} />
          <NumberField label="Máximo de caracteres" value={rule.max_length} disabled={disabled} onChange={(v) => setRule({ max_length: v })} />
        </div>
      )}
      {rule?.type === 'phone_mx' && (
        <p className="text-[11px] text-muted-foreground">Acepta +52, espacios y guiones; se guarda con los 10 dígitos.</p>
      )}
      {check ? (
        <>
          <TextField
            label="Si la respuesta no sirve, el bot dice"
            value={check.errorText ?? ''}
            max={limits.text.bodyMax}
            multiline
            rows={2}
            disabled={disabled}
            onChange={(v) => onChange({ ...check, errorText: v || undefined })}
            hint="Vacío: un mensaje según el tipo, con un ejemplo."
          />
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Label className="text-xs">Intentos antes de rendirse:</Label>
            <select
              value={check.maxAttempts}
              disabled={disabled}
              onChange={(e) => onChange({ ...check, maxAttempts: Number(e.target.value) })}
              className="h-8 rounded border border-input bg-background px-1 text-xs"
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            <Label className="text-xs">y luego:</Label>
            <select
              value={check.onExhausted}
              disabled={disabled}
              onChange={(e) => onChange({ ...check, onExhausted: e.target.value as CaptureCheck['onExhausted'] })}
              className="h-8 rounded border border-input bg-background px-1 text-xs"
            >
              <option value="human">pasar a una persona (aviso de «Cuando no entiende»)</option>
              <option value="menu">volver al menú</option>
            </select>
          </div>
        </>
      ) : (
        <p className="text-[11px] text-muted-foreground">Acepta cualquier texto y sigue.</p>
      )}
    </div>
  );
}

function NumberField({ label, value, onChange, disabled }: { label: string; value: number | undefined; onChange: (v: number | undefined) => void; disabled: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-xs">{label}</Label>
      <Input type="number" value={value ?? ''} disabled={disabled} onChange={(e) => onChange(optionalNumber(e.target.value))} className="h-8 text-sm" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 4. Cómo reconoce
// ---------------------------------------------------------------------------

export function StepReconocimiento({ spec, setSpec, canEditStructure, report, escapeDefaults }: StepProps) {
  const disabled = !canEditStructure;
  const escape = spec.escape;
  const setEscape = (patch: Partial<WizardEscape>) => setSpec((s) => (s.escape ? { ...s, escape: { ...s.escape, ...patch } } : s));
  return (
    <>
      <StepIssues report={report} spec={spec} step="reconocimiento" />
      <EngineNote>
        El bot reconoce cada opción por su botón y por su texto exacto. Además, por estas palabras dentro de lo que escribe el cliente.
        Si dos opciones comparten una palabra, gana la primera y aquí aparece un aviso.
      </EngineNote>
      <Section title="Palabras que funcionan en cualquier paso">
        {escape ? (
          <>
            <p className="text-xs text-muted-foreground">
              Se comparan con el mensaje completo, sin acentos ni signos: «¡Asesor!» cuenta, «quiero un asesor» no (eso lo resuelve cada paso).
              Si un paso tiene su propia salida para una de estas palabras, gana el paso; la baja no cede nunca.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <KeywordsField label="Hablar con una persona" value={escape.humanWords} disabled={disabled} onChange={(v) => setEscape({ humanWords: v })} hint="Obligatoria: WhatsApp exige una vía directa a una persona. El texto está en «Paso a humano»." />
              <KeywordsField label="Darse de baja" value={escape.optOutWords} disabled={disabled} onChange={(v) => setEscape({ optOutWords: v })} hint="Obligatoria. El bot confirma una vez y deja de escribirle." />
              <KeywordsField label="Volver al menú" value={escape.menuWords} disabled={disabled} onChange={(v) => setEscape({ menuWords: v })} hint="Muestra el menú y conserva lo que el cliente ya dijo." />
              <KeywordsField label="Empezar de nuevo" value={escape.restartWords} disabled={disabled} onChange={(v) => setEscape({ restartWords: v })} hint="Borra lo capturado y vuelve al saludo." />
            </div>
          </>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              Este bot usa las palabras de siempre: «menu», «salir», «cancelar» e «inicio» empiezan de nuevo; «baja» y «stop» dan de baja. No tiene
              una palabra para pedir una persona desde cualquier paso.
            </p>
            {canEditStructure && (
              <Button size="sm" variant="outline" className="self-start" onClick={() => setSpec((s) => ({ ...s, escape: structuredClone(escapeDefaults) }))}>
                <Plus className="mr-1 h-3.5 w-3.5" /> Usar las palabras recomendadas
              </Button>
            )}
          </>
        )}
      </Section>
      {spec.options.map((o) => (
        <Section key={o.id} title={o.title}>
          <KeywordsField label="Palabras clave" value={o.keywords} disabled={disabled} onChange={(v) => setSpec((s) => updateOption(s, o.id, (x) => ({ ...x, keywords: v })))} />
          {o.kind === 'capture' && o.confirm && (
            <div className="grid gap-2 sm:grid-cols-2">
              <KeywordsField
                label="En la confirmación, palabras para «sí»"
                value={o.confirm.yesKeywords}
                disabled={disabled}
                onChange={(v) => setSpec((s) => updateOption(s, o.id, (x) => (x.kind === 'capture' && x.confirm ? { ...x, confirm: { ...x.confirm, yesKeywords: v } } : x)))}
              />
              <KeywordsField
                label="Palabras para «corregir»"
                value={o.confirm.noKeywords}
                disabled={disabled}
                onChange={(v) => setSpec((s) => updateOption(s, o.id, (x) => (x.kind === 'capture' && x.confirm ? { ...x, confirm: { ...x.confirm, noKeywords: v } } : x)))}
              />
            </div>
          )}
        </Section>
      ))}
      <Section title="Despedida">
        <KeywordsField
          label="Palabras para despedirse (en los botones de información que llevan a la despedida)"
          value={spec.farewell.keywords}
          disabled={disabled}
          onChange={(v) => setSpec((s) => ({ ...s, farewell: { ...s.farewell, keywords: v } }))}
        />
      </Section>
    </>
  );
}

// ---------------------------------------------------------------------------
// 5. Cuando no entiende
// ---------------------------------------------------------------------------

export function StepNoEntiende({ spec, setSpec, business, setBusiness, limits, canEditStructure, report }: StepProps) {
  const disabled = !canEditStructure;
  const bodyMax = presentation(spec) === 'botones' ? limits.replyButtons.bodyMax : limits.list.bodyMax;
  return (
    <>
      <StepIssues report={report} spec={spec} step="no-entiende" />
      <Section title="Primer «no te entendí»">
        <TextField label="Mensaje" value={business.mensaje_no_entendio} max={bodyMax} multiline rows={2} onChange={(v) => setBusiness({ mensaje_no_entendio: v })} hint="Es un texto del negocio: va con el menú de opciones debajo." />
      </Section>
      <Section title="Si sigue sin entender">
        <div className="flex items-center gap-2 text-xs">
          <Label className="text-xs">Veces que se vuelve a mostrar el menú antes de pasar a una persona:</Label>
          <select
            value={spec.notUnderstood.attempts}
            disabled={disabled}
            onChange={(e) => setSpec((s) => ({ ...s, notUnderstood: { ...s.notUnderstood, attempts: Number(e.target.value) } }))}
            className="h-8 rounded border border-input bg-background px-2 text-xs"
          >
            {[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        {spec.notUnderstood.attempts > 1 && (
          <TextField label="Mensaje del segundo intento en adelante" value={spec.notUnderstood.retryText} max={bodyMax} multiline rows={2} disabled={disabled} onChange={(v) => setSpec((s) => ({ ...s, notUnderstood: { ...s.notUnderstood, retryText: v } }))} />
        )}
        <EngineNote>Al agotar los intentos, pasa a una persona con los textos de «Paso a humano». Los audios, fotos y stickers hoy no reciben respuesta: el motor todavía no los procesa.</EngineNote>
      </Section>
    </>
  );
}

// ---------------------------------------------------------------------------
// 6. Paso a humano
// ---------------------------------------------------------------------------

export function StepHumano({ spec, setSpec, business, limits, canEditStructure, report, goTo }: StepProps) {
  const disabled = !canEditStructure;
  const vars = availableVariables(spec);
  const handoffFields = (
    title: string,
    value: { userResponse: string; ownerAlert: string },
    onChange: (v: { userResponse: string; ownerAlert: string }) => void,
    extraVars: string[] = [],
  ) => (
    <Section key={title} title={title}>
      <TextField label="Lo que ve el cliente" value={value.userResponse} max={limits.text.bodyMax} multiline rows={2} disabled={disabled} onChange={(v) => onChange({ ...value, userResponse: v })} />
      <TextField label="La alerta que recibe el dueño" value={value.ownerAlert} max={limits.text.bodyMax} multiline rows={3} disabled={disabled} onChange={(v) => onChange({ ...value, ownerAlert: v })} />
      <VariableChips vars={[...vars, ...extraVars]} />
    </Section>
  );
  return (
    <>
      <StepIssues report={report} spec={spec} step="humano" />
      {!business.owner_whatsapp && (
        <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-900">
          Falta el WhatsApp del dueño: sin él las alertas no llegan a nadie.{' '}
          <button type="button" className="underline" onClick={() => goTo('negocio')}>Agregarlo</button>
        </p>
      )}
      <EngineNote>
        Al pasar a una persona el bot se calla 48 h con ese cliente. El dueño recibe la alerta con un enlace al chat y la devuelve al bot mandando #listo desde su WhatsApp.
        La alerta solo llega si el dueño le escribió al número del bot en las últimas 24 h (regla de WhatsApp).
      </EngineNote>
      {spec.options.map((o) =>
        o.kind === 'info'
          ? null
          : handoffFields(`«${o.title}»`, o.handoff, (h) => setSpec((s) => updateOption(s, o.id, (x) => (x.kind === 'info' ? x : { ...x, handoff: h })))),
      )}
      {handoffFields(
        'Cuando no entiende',
        spec.notUnderstood.handoff,
        (h) => setSpec((s) => ({ ...s, notUnderstood: { ...s.notUnderstood, handoff: h } })),
        ['last_message'],
      )}
      {spec.escape &&
        handoffFields(
          `Cuando pide una persona en cualquier paso («${spec.escape.humanWords[0] ?? '…'}»)`,
          spec.escape.handoff,
          (h) => setSpec((s) => (s.escape ? { ...s, escape: { ...s.escape, handoff: h } } : s)),
          ['last_message'],
        )}
      {!spec.escape && (
        <p className="text-xs text-muted-foreground">
          Para que el cliente pueda pedir una persona desde cualquier paso, activa las palabras recomendadas en{' '}
          <button type="button" className="underline" onClick={() => goTo('reconocimiento')}>Reconocimiento</button>.
        </p>
      )}
      {!spec.options.some((o) => o.kind === 'human') && canEditStructure && (
        <Button size="sm" variant="outline" className="self-start" onClick={() => setSpec((s) => ({ ...s, options: [...s.options, newOption('human', s)] }))}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Agregar la opción «Hablar con alguien» al menú
        </Button>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// 7. Despedida
// ---------------------------------------------------------------------------

export function StepDespedida({ spec, setSpec, limits, canEditStructure, report }: StepProps) {
  const used = spec.options.some((o) => o.kind === 'info' && o.actions.some((a) => a.goto === 'farewell'));
  return (
    <>
      <StepIssues report={report} spec={spec} step="despedida" />
      <Section title="Despedida">
        <TextField label="Mensaje" value={spec.farewell.text} max={limits.text.bodyMax} multiline rows={2} disabled={!canEditStructure} onChange={(v) => setSpec((s) => ({ ...s, farewell: { ...s.farewell, text: v } }))} />
        <VariableChips vars={['nombre_negocio']} />
        {!used && <p className="text-xs text-amber-700">Ningún botón lleva a la despedida todavía: agrega uno en una opción de información.</p>}
      </Section>
      <EngineNote>
        Lo que el motor hace solo, sin configurar: si el cliente escribe «baja» o «stop», deja de recibir mensajes y se le confirma una vez; si vuelve a escribir, se reactiva.
        Si pasa mucho tiempo a media conversación (o el negocio cierra en medio), el bot avisa y empieza de nuevo.
      </EngineNote>
    </>
  );
}

// ---------------------------------------------------------------------------
// 8. Probar y publicar
// ---------------------------------------------------------------------------

export function StepPublicar({ spec, report, goTo, actions }: StepProps & { actions: ReactNode }) {
  return (
    <>
      <Section title="Revisión">
        {!report && <p className="text-xs text-muted-foreground">Revisando…</p>}
        {report && report.issues.length === 0 && <p className="text-sm text-emerald-700">✅ Sin errores ni avisos.</p>}
        {report && report.issues.length > 0 && <IssueList issues={report.issues} onGo={goTo} spec={spec} />}
        {report && !report.schema.ok && (
          <p className="text-xs text-red-700">El flujo todavía no se puede publicar: {report.schema.issues[0]?.message}</p>
        )}
      </Section>
      <Section title="Probar">
        <p className="text-xs text-muted-foreground">
          Usa el simulador de la derecha: corre el motor real con lo último guardado, sin mandar nada a WhatsApp. Debajo de cada respuesta está el porqué.
          Las conversaciones que guardes como prueba se corren solas antes de publicar.
        </p>
      </Section>
      <Section title="Publicar">
        <p className="text-xs text-muted-foreground">Guardar deja el borrador; el bot sigue contestando con lo publicado hasta que publiques.</p>
        {actions}
      </Section>
    </>
  );
}
