import { History, Loader2, RotateCcw, ShieldAlert, X } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import type { FlowVersion } from '@/shared/api/flows';
import { formatRelativeTime, formatAbsoluteTime } from '@/shared/lib/format-date';

/**
 * Panel de historial de versiones publicadas (P6). Dos acciones por fila:
 *
 * - "Restaurar como draft": trae el flow_json de esa versión y lo carga al
 *   canvas SIN publicar (queda como draft sucio, el operador decide qué
 *   hacer). Disponible para cualquiera con acceso al Designer.
 * - "Rollback": publica esa versión de inmediato como la nueva activa.
 *   Solo super_admin (D5) — el backend lo exige con 403; este panel no
 *   ofrece el botón a nadie más, para no prometer algo que va a fallar.
 */
export function VersionsPanel({
  versions,
  isLoading,
  isSuperAdmin,
  onClose,
  onRestore,
  restoringId,
  onRollback,
  rollingBackNumber,
}: {
  versions: FlowVersion[];
  isLoading: boolean;
  isSuperAdmin: boolean;
  onClose: () => void;
  onRestore: (versionId: string) => void;
  restoringId: string | null;
  onRollback: (versionNumber: number) => void;
  rollingBackNumber: number | null;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border/70 bg-card p-3 shadow-card animate-in fade-in slide-in-from-right-2 duration-200">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-xs font-semibold">
          <History className="h-4 w-4 text-muted-foreground" aria-hidden />
          Versiones publicadas
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

      {isLoading && (
        <div className="flex items-center justify-center py-6 text-xs text-muted-foreground">
          <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> Cargando…
        </div>
      )}

      {!isLoading && versions.length === 0 && (
        <p className="py-4 text-center text-[11px] text-muted-foreground">
          Este flow todavía no tiene versiones publicadas.
        </p>
      )}

      {!isLoading && versions.length > 0 && (
        <ul className="flex max-h-64 flex-col gap-1.5 overflow-y-auto">
          {versions.map((v) => (
            <li
              key={v.id}
              className="flex flex-col gap-1 rounded-md border border-border/50 p-2"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium">v{v.versionNumber}</span>
                <span
                  className="text-[10px] text-muted-foreground"
                  title={formatAbsoluteTime(v.createdAt)}
                >
                  {formatRelativeTime(v.createdAt)}
                </span>
              </div>
              {v.createdBy && (
                <p className="truncate text-[10px] text-muted-foreground">
                  autor: <code className="font-mono">{v.createdBy.slice(0, 8)}…</code>
                </p>
              )}
              {v.note && <p className="text-[11px] text-foreground">{v.note}</p>}
              <div className="mt-0.5 flex flex-wrap gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 px-2 text-[11px]"
                  disabled={restoringId === v.id}
                  onClick={() => onRestore(v.id)}
                >
                  {restoringId === v.id ? (
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  ) : (
                    <RotateCcw className="mr-1 h-3 w-3" />
                  )}
                  Restaurar como draft
                </Button>
                {isSuperAdmin && (
                  <Button
                    size="sm"
                    variant="destructive"
                    className="h-6 px-2 text-[11px]"
                    disabled={rollingBackNumber === v.versionNumber}
                    onClick={() => onRollback(v.versionNumber)}
                  >
                    {rollingBackNumber === v.versionNumber ? (
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    ) : (
                      <ShieldAlert className="mr-1 h-3 w-3" />
                    )}
                    Rollback ahora
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-1 border-t pt-2 text-[10px] text-muted-foreground">
        Restaurar carga el contenido al canvas para revisar y editar — no publica nada.
        Rollback publica esa versión de inmediato.
      </p>
    </div>
  );
}
