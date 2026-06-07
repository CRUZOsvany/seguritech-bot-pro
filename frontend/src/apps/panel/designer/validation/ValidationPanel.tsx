import { AlertCircle, AlertTriangle, CheckCircle2, X } from 'lucide-react';
import type { ValidationResult, ValidationIssue } from './graphValidator';
import { Button } from '@/shared/ui/button';

/**
 * Panel de resultados de validación de grafo. Se muestra cuando el operador
 * intenta publicar con errores, o cuando pide ver el estado de validación.
 *
 * - Errores (rojo): bloquean la publicación.
 * - Advertencias (ámbar): no bloquean, pero conviene revisarlas.
 *
 * Si hay solo advertencias, el panel ofrece un botón "Publicar de todas formas".
 */
export function ValidationPanel({
  result,
  onClose,
  onPublishAnyway,
  publishing,
}: {
  result: ValidationResult;
  onClose: () => void;
  onPublishAnyway?: () => void;
  publishing?: boolean;
}) {
  const { issues, errorCount, warningCount } = result;
  const onlyWarnings = errorCount === 0 && warningCount > 0;
  const clean = issues.length === 0;

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border/70 bg-card p-3 shadow-card">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-xs font-semibold">
          {clean ? (
            <>
              <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden />
              Validación del flujo
            </>
          ) : (
            <>
              {errorCount > 0 ? (
                <AlertCircle className="h-4 w-4 text-red-600" aria-hidden />
              ) : (
                <AlertTriangle className="h-4 w-4 text-amber-500" aria-hidden />
              )}
              Validación del flujo
            </>
          )}
        </p>
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground"
          onClick={onClose}
          aria-label="Cerrar"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Resumen */}
      <div className="flex items-center gap-3 text-[11px]">
        <span className={errorCount > 0 ? 'text-red-600 font-medium' : 'text-muted-foreground'}>
          {errorCount} error{errorCount === 1 ? '' : 'es'}
        </span>
        <span className={warningCount > 0 ? 'text-amber-600 font-medium' : 'text-muted-foreground'}>
          {warningCount} advertencia{warningCount === 1 ? '' : 's'}
        </span>
      </div>

      {clean && (
        <p className="text-[11px] text-emerald-700">
          El flujo no tiene problemas estructurales. Listo para publicar.
        </p>
      )}

      {/* Lista de issues */}
      {!clean && (
        <ul className="flex flex-col gap-1 max-h-64 overflow-y-auto">
          {issues.map((issue, i) => (
            <IssueRow key={i} issue={issue} />
          ))}
        </ul>
      )}

      {/* Acción para warnings */}
      {onlyWarnings && onPublishAnyway && (
        <div className="mt-1 flex items-center justify-end gap-2 border-t pt-2">
          <Button size="sm" variant="ghost" onClick={onClose} disabled={publishing}>
            Revisar
          </Button>
          <Button size="sm" variant="outline" onClick={onPublishAnyway} disabled={publishing}>
            Publicar de todas formas
          </Button>
        </div>
      )}

      {errorCount > 0 && (
        <p className="mt-1 border-t pt-2 text-[10px] text-muted-foreground">
          Corrige los errores antes de publicar. Las advertencias no bloquean.
        </p>
      )}
    </div>
  );
}

function IssueRow({ issue }: { issue: ValidationIssue }) {
  const isError = issue.severity === 'error';
  return (
    <li className="flex items-start gap-1.5 rounded-md border border-border/50 p-1.5">
      {isError ? (
        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-600" aria-hidden />
      ) : (
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden />
      )}
      <span className="text-[11px] leading-snug text-foreground">{issue.message}</span>
    </li>
  );
}
