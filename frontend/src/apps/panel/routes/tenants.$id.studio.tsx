import { useMemo } from 'react';
import { createLazyRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { Alert, AlertDescription } from '@/shared/ui/alert';
import { getLimits, getMolds, getWizard } from '@/shared/api/studio';
import { useSession } from '@/shared/auth/useSession';
import { useFlows } from '../hooks/use-flows';
import { useTenant } from '../hooks/use-tenant';
import { Loading, NoFlow, StudioEditor } from '../studio/StudioEditor';

/**
 * Studio (Fase 3): el asistente de 8 pasos para armar el bot de un negocio
 * sin tocar JSON. Escribir → simular → publicar.
 *
 * - La estructura (opciones, capturas, escalera de "no entendí") se guarda
 *   como especificación del asistente; el backend la compila al flow que
 *   ejecuta el motor, en el mismo borrador que usa el Designer.
 * - Los textos del negocio (saludo, menú, horario, dueño) se guardan en el
 *   tenant, como siempre.
 * - Validación en vivo con el validador del backend; el simulador de la
 *   derecha corre el motor real con lo último guardado.
 */
function StudioPage() {
  const { id } = Route.useParams();
  const tenantQ = useTenant(id);
  const flowsQ = useFlows(id);
  const sessionQ = useSession();
  const isSuperAdmin = sessionQ.data?.role === 'super_admin';

  const flow = useMemo(() => {
    const flows = flowsQ.data ?? [];
    return flows.find((f) => f.channel === 'whatsapp' && f.isActive) ?? flows.find((f) => f.channel === 'whatsapp') ?? flows[0];
  }, [flowsQ.data]);
  const flowId = flow?.id ?? null;

  const moldsQ = useQuery({ queryKey: ['studio-molds'], queryFn: getMolds, staleTime: Infinity });
  const limitsQ = useQuery({ queryKey: ['studio-limits'], queryFn: getLimits, staleTime: Infinity });
  const wizardQ = useQuery({
    queryKey: ['studio-wizard', id, flowId],
    queryFn: () => getWizard(id, flowId as string),
    enabled: Boolean(flowId),
    refetchOnWindowFocus: false,
  });

  const loadError = [tenantQ, flowsQ, moldsQ, limitsQ, wizardQ].find((q) => q.error)?.error;
  if (loadError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>No se pudo cargar el Studio: {loadError instanceof Error ? loadError.message : 'error'}</AlertDescription>
      </Alert>
    );
  }
  if (!tenantQ.data || !flowsQ.data || !moldsQ.data || !limitsQ.data || sessionQ.isLoading) return <Loading />;
  if (!flowId) return <NoFlow tenant={tenantQ.data} />;
  if (!wizardQ.data) return <Loading />;

  return (
    <StudioEditor
      key={flowId}
      tenantId={id}
      flowId={flowId}
      tenant={tenantQ.data}
      wizard={wizardQ.data}
      molds={moldsQ.data.molds}
      escapeDefaults={moldsQ.data.escapeDefaults}
      limits={limitsQ.data.limits}
      isSuperAdmin={isSuperAdmin}
    />
  );
}

export const Route = createLazyRoute('/_authed/tenants/$id/studio')({
  component: StudioPage,
});
