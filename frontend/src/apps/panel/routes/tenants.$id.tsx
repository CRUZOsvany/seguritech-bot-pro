import { createLazyRoute } from '@tanstack/react-router';
import { AlertCircle, Loader2 } from 'lucide-react';
import { useTenant } from '../hooks/use-tenant';
import { useTenantServices } from '../hooks/use-tenant-services';
import { ServiceCards } from '../components/service-cards';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/ui/card';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/shared/ui/tabs';
import { Badge } from '@/shared/ui/badge';
import { Alert, AlertDescription } from '@/shared/ui/alert';

const GIRO_LABELS: Record<string, string> = {
  ferreteria: 'Ferretería',
  papeleria: 'Papelería',
  cerrajeria: 'Cerrajería',
  pizzeria: 'Pizzería',
  salon: 'Salón de belleza',
  medico: 'Consultorio médico',
  refaccionaria: 'Refaccionaria',
  farmacia: 'Farmacia',
  otro: 'Otro',
};

function TenantDetailPage() {
  const { id } = Route.useParams();
  const tenantQuery = useTenant(id);
  const servicesQuery = useTenantServices(id);

  if (tenantQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Cargando cliente…
      </div>
    );
  }

  if (tenantQuery.error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          {tenantQuery.error.message ?? 'Error cargando cliente'}
        </AlertDescription>
      </Alert>
    );
  }

  const tenant = tenantQuery.data;
  if (!tenant) return null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-medium">{tenant.nombre_negocio}</h1>
          <Badge variant={`fsm-${tenant.status}` as const}>
            {tenant.status}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          {GIRO_LABELS[tenant.giro] ?? tenant.giro} ·{' '}
          <code className="text-[10px]">{tenant.id.slice(0, 8)}…</code>
        </p>
      </div>

      <Tabs defaultValue="services" className="w-full">
        <TabsList>
          <TabsTrigger value="services">Servicios</TabsTrigger>
          <TabsTrigger value="business">Datos del negocio</TabsTrigger>
        </TabsList>

        <TabsContent value="services" className="mt-6">
          {servicesQuery.isLoading ? (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Cargando servicios…
            </div>
          ) : servicesQuery.error ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {servicesQuery.error.message ?? 'Error cargando servicios'}
              </AlertDescription>
            </Alert>
          ) : (
            <ServiceCards
              tenantId={tenant.id}
              services={servicesQuery.data ?? []}
            />
          )}
        </TabsContent>

        <TabsContent value="business" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Datos del negocio</CardTitle>
              <CardDescription>
                Información general del cliente. La edición se habilita en un
                próximo prompt.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">
                    Nombre del negocio
                  </dt>
                  <dd>{tenant.nombre_negocio}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">
                    Giro
                  </dt>
                  <dd>{GIRO_LABELS[tenant.giro] ?? tenant.giro}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-xs font-medium text-muted-foreground">
                    Dirección
                  </dt>
                  <dd>
                    {tenant.direccion ?? (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">
                    Horario semana
                  </dt>
                  <dd>
                    {tenant.horario_semana ?? (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">
                    Horario sábado
                  </dt>
                  <dd>
                    {tenant.horario_sabado ?? (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">
                    Abre domingos
                  </dt>
                  <dd>{tenant.abre_domingo ? 'Sí' : 'No'}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export const Route = createLazyRoute('/_authed/tenants/$id')({
  component: TenantDetailPage,
});
