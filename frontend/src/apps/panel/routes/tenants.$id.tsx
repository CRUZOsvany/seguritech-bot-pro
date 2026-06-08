import { createLazyRoute } from '@tanstack/react-router';
import { AlertCircle, Loader2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTenant } from '../hooks/use-tenant';
import { useTenantServices } from '../hooks/use-tenant-services';
import { useUpdateTenant } from '../hooks/use-update-tenant';
import { ServiceCards } from '../components/service-cards';
import {
  CreateTenantSchema,
  type CreateTenantInput,
  GIRO_VALUES,
} from '@/shared/api/tenants';
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
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Button } from '@/shared/ui/button';
import { Checkbox } from '@/shared/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select';

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
          <BusinessDataCard tenant={tenant} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function BusinessDataCard({
  tenant,
}: { tenant: import('@/shared/api/tenants').TenantDetail }) {
  const update = useUpdateTenant(tenant.id);
  const { register, handleSubmit, watch, setValue, formState } =
    useForm<CreateTenantInput>({
      resolver: zodResolver(CreateTenantSchema),
      defaultValues: {
        nombre_negocio: tenant.nombre_negocio ?? '',
        giro: tenant.giro as (typeof GIRO_VALUES)[number],
        direccion: tenant.direccion ?? '',
        horario_semana: tenant.horario_semana ?? '',
        horario_sabado: tenant.horario_sabado ?? '',
        abre_domingo: tenant.abre_domingo ?? false,
      },
    });

  const onSubmit = handleSubmit((data) => update.mutate(data));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Datos del negocio</CardTitle>
        <CardDescription>
          Nombre, giro y horarios del cliente. Se aplican al instante.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="nombre_negocio">
              Nombre del negocio <span className="text-destructive">*</span>
            </Label>
            <Input id="nombre_negocio" {...register('nombre_negocio')} />
            {formState.errors.nombre_negocio && (
              <p className="text-xs text-destructive">
                {formState.errors.nombre_negocio.message}
              </p>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="giro">Giro</Label>
            <Select
              value={watch('giro')}
              onValueChange={(v) =>
                setValue('giro', v as (typeof GIRO_VALUES)[number])
              }
            >
              <SelectTrigger id="giro"><SelectValue /></SelectTrigger>
              <SelectContent>
                {GIRO_VALUES.map((g) => (
                  <SelectItem key={g} value={g}>{GIRO_LABELS[g] ?? g}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="direccion">Dirección</Label>
            <Input id="direccion" {...register('direccion')} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="horario_semana">Horario semana</Label>
              <Input id="horario_semana" {...register('horario_semana')} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="horario_sabado">Horario sábado</Label>
              <Input id="horario_sabado" {...register('horario_sabado')} />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="abre_domingo"
              checked={watch('abre_domingo') ?? false}
              onCheckedChange={(c) => setValue('abre_domingo', c === true)}
            />
            <Label htmlFor="abre_domingo" className="cursor-pointer font-normal">
              Abre domingos
            </Label>
          </div>

          <div className="flex items-center gap-2">
            <Button type="submit" size="sm" disabled={update.isPending}>
              {update.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
              Guardar datos
            </Button>
            {update.isSuccess && <span className="text-xs text-emerald-600">Guardado ✓</span>}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export const Route = createLazyRoute('/_authed/tenants/$id')({
  component: TenantDetailPage,
});
