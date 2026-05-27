import { Loader2 } from 'lucide-react';

/**
 * Loading UI que se muestra mientras TanStack Router descarga un route chunk.
 * Mantener minimalista — < 100ms en conexiones normales, no debe llamar la
 * atención. Solo aparece en conexiones lentas o en el primer tap a un chunk.
 */
export function RoutePending() {
  return (
    <div className="flex items-center justify-center py-16">
      <Loader2
        className="h-5 w-5 animate-spin text-muted-foreground"
        aria-hidden="true"
      />
      <span className="sr-only">Cargando…</span>
    </div>
  );
}
