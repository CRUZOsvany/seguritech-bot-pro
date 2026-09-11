import { useState, type ReactNode } from 'react';
import { Input } from '@/shared/ui/input';
import { Textarea } from '@/shared/ui/textarea';
import { Label } from '@/shared/ui/label';
import { charCount, keywordsToText, parseKeywords } from './wizard-model';

/**
 * Campo de texto del asistente. `max` viene de los límites de WhatsApp que
 * sirve el backend (GET /api/admin/studio/limits): el contador se pone rojo
 * al pasarse, pero no corta lo escrito — el validador lo marca como error y
 * el operador decide cómo acortarlo.
 */
export function TextField({
  label,
  value,
  onChange,
  max,
  multiline = false,
  rows = 3,
  hint,
  placeholder,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  max?: number;
  multiline?: boolean;
  rows?: number;
  hint?: ReactNode;
  placeholder?: string;
  disabled?: boolean;
}) {
  const count = charCount(value);
  const over = max !== undefined && count > max;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <Label className="text-xs">{label}</Label>
        {max !== undefined && (
          <span className={`text-[10px] tabular-nums ${over ? 'font-semibold text-red-600' : 'text-muted-foreground'}`}>
            {count}/{max}
          </span>
        )}
      </div>
      {multiline ? (
        <Textarea
          value={value}
          rows={rows}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className={`text-sm ${over ? 'border-red-400' : ''}`}
        />
      ) : (
        <Input
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className={`h-8 text-sm ${over ? 'border-red-400' : ''}`}
        />
      )}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

/**
 * Palabras clave separadas por comas. Se edita como texto libre y se
 * convierte a lista al salir del campo, para no pelear con el cursor.
 */
export function KeywordsField({
  label,
  value,
  onChange,
  hint,
  disabled,
}: {
  label: string;
  value: string[];
  onChange: (value: string[]) => void;
  hint?: ReactNode;
  disabled?: boolean;
}) {
  // Borrador local solo mientras se escribe; fuera de edición manda `value`.
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-xs">{label}</Label>
      <Textarea
        value={draft ?? keywordsToText(value)}
        rows={2}
        disabled={disabled}
        placeholder="palabra, otra palabra, una frase corta"
        onFocus={() => setDraft(keywordsToText(value))}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== null) onChange(parseKeywords(draft));
          setDraft(null);
        }}
        className="text-sm"
      />
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Bloque con título dentro de un paso. */
export function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** Nota informativa: lo que el motor hace solo y el asistente no configura. */
export function EngineNote({ children }: { children: ReactNode }) {
  return <p className="rounded-md bg-muted/60 px-3 py-2 text-[11px] text-muted-foreground">ℹ️ {children}</p>;
}

/** Chips con las {{variables}} que se pueden usar en un texto. */
export function VariableChips({ vars }: { vars: string[] }) {
  return (
    <p className="flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
      Variables:
      {vars.map((v) => (
        <code key={v} className="rounded bg-muted px-1 py-0.5 text-[10px]">{`{{${v}}}`}</code>
      ))}
    </p>
  );
}
