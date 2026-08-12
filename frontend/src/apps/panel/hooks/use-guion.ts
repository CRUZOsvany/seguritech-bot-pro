import { useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getDraftWithMeta, saveDraftChecked } from '@/shared/api/flows';
import { extractGuionRows, setAtPath, type GuionRow } from '../guion/extract-text-fields';

interface LoadedDraft {
  /** Referencia de `draftQ.data` con la que se sincronizó — detecta cambios. */
  key: unknown;
  flow: unknown;
  /** Baseline para la concurrencia optimista de save(). */
  draftUpdatedAt: string | null;
}

/**
 * Estado + acciones del Guion (P7): carga el draft, lo aplana a filas
 * editables, junta ediciones locales sin tocar el backend hasta "Guardar",
 * y hace concurrencia optimista contra `draft_updated_at` — si alguien más
 * guardó primero, `save()` devuelve conflict en vez de pisar (D6: el Guion
 * SOLO escribe draft, nunca publica).
 */
export function useGuion(tenantId: string, flowId: string | null) {
  const qc = useQueryClient();
  const draftQ = useQuery({
    queryKey: ['guion-draft', tenantId, flowId],
    queryFn: () => getDraftWithMeta(tenantId, flowId as string),
    staleTime: 0, // siempre fresco al entrar — es la base de la concurrencia optimista
    refetchOnWindowFocus: false,
    enabled: Boolean(tenantId && flowId),
  });

  // Copia local mutable del flow. Las ediciones viven acá; nada se manda al
  // backend hasta save(). Se re-sincroniza con el draft del servidor cuando
  // `draftQ.data` cambia de referencia (primer load, o un reload() explícito
  // que descarta ediciones) — "ajustar estado durante el render" en vez de
  // useEffect (setState síncrono en un efecto dispara un render en cascada
  // innecesario; un ref tampoco vale, no se puede mutar durante el render).
  const [loaded, setLoaded] = useState<LoadedDraft | null>(null);
  const [dirty, setDirty] = useState(false);

  if (draftQ.isSuccess && loaded?.key !== draftQ.data) {
    setLoaded({ key: draftQ.data, flow: draftQ.data.draft, draftUpdatedAt: draftQ.data.draftUpdatedAt });
    if (dirty) setDirty(false);
  }
  const localFlow = loaded?.flow ?? null;

  const rows: GuionRow[] = localFlow ? extractGuionRows(localFlow) : [];

  const editRow = useCallback((row: GuionRow, newText: string) => {
    setLoaded((prev) =>
      prev ? { ...prev, flow: setAtPath(prev.flow, row.nodeId, row.path, newText) } : prev,
    );
    setDirty(true);
  }, []);

  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const save = useCallback(async () => {
    if (!flowId || !loaded) return;
    setSaving(true);
    setSaveError(null);
    try {
      const result = await saveDraftChecked(
        tenantId,
        flowId,
        loaded.flow,
        loaded.draftUpdatedAt,
      );
      if (result.conflict) {
        setConflict(true);
        return;
      }
      setLoaded((prev) => (prev ? { ...prev, draftUpdatedAt: result.draftUpdatedAt } : prev));
      setDirty(false);
      qc.invalidateQueries({ queryKey: ['flows', tenantId] });
      qc.invalidateQueries({ queryKey: ['flow-draft', tenantId, flowId] });
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }, [tenantId, flowId, loaded, qc]);

  /** Recarga desde el backend, descartando ediciones locales y el conflicto. */
  const reload = useCallback(() => {
    setConflict(false);
    draftQ.refetch();
  }, [draftQ]);

  return {
    isLoading: draftQ.isLoading,
    error: draftQ.error,
    rows,
    editRow,
    dirty,
    saving,
    conflict,
    saveError,
    save,
    reload,
  };
}
