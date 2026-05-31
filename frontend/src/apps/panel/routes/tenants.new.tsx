import { useForm, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createLazyRoute, useNavigate } from '@tanstack/react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Loader2 } from 'lucide-react';
import {
  CreateTenantSchema,
  type CreateTenantInput,
  createTenant,
  GIRO_VALUES,
} from '@/shared/api/tenants';
import { ApiError } from '@/shared/api/client';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/ui/card';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Button } from '@/shared/ui/button';
import { Checkbox } from '@/shared/ui/checkbox';
import { Alert, AlertDescription } from '@/shared/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select';

const GIRO_LABELS: Record<(typeof GIRO_VALUES)[number], string> = {
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

function NewTenantPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const form = useForm<CreateTenantInput>({
    resolver: zodResolver(CreateTenantSchema),
    defaultValues: {
      nombre_negocio: '',
      giro: 'papeleria',
      direccion: '',
      horario_semana: '',
      horario_sabado: '',
      abre_domingo: false,
    },
  });

  const mutation = useMutation({
    mutationFn: createTenant,
    onSuccess: ({ id }) => {
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
      navigate({ to: '/tenants/$id', params: { id } });
    },
  });

  const onSubmit: SubmitHandler<CreateTenantInput> = (data) => {
    mutation.mutate(data);
  };

  const serverError =
    mutation.error instanceof ApiError
      ? mutation.error.message
      : mutation.error instanceof Error
        ? mutation.error.message
        : null;

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Nuevo cliente</CardTitle>
          <CardDescription>
            Datos del negocio. Los servicios (WhatsApp Bot, POS, Messenger) los
            habilitas y configuras en el detalle del cliente después de crearlo.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="nombre_negocio">
              Nombre del negocio <span className="text-destructive">*</span>
            </Label>
            <Input
              id="nombre_negocio"
              placeholder="Papelería La Esquina"
              autoFocus
              disabled={mutation.isPending}
              {...form.register('nombre_negocio')}
            />
            {form.formState.errors.nombre_negocio && (
              <p className="text-xs text-destructive">
                {form.formState.errors.nombre_negocio.message}
              </p>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="giro">
              Giro <span className="text-destructive">*</span>
            </Label>
            <Select
              value={form.watch('giro')}
              onValueChange={(v) =>
                form.setValue('giro', v as (typeof GIRO_VALUES)[number])
              }
              disabled={mutation.isPending}
            >
              <SelectTrigger id="giro">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GIRO_VALUES.map((g) => (
                  <SelectItem key={g} value={g}>
                    {GIRO_LABELS[g]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="direccion">Dirección (opcional)</Label>
            <Input
              id="direccion"
              placeholder="Av. Insurgentes 123, Col. Centro"
              disabled={mutation.isPending}
              {...form.register('direccion')}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="horario_semana">Horario semana</Label>
              <Input
                id="horario_semana"
                placeholder="9:00 - 19:00"
                disabled={mutation.isPending}
                {...form.register('horario_semana')}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="horario_sabado">Horario sábado</Label>
              <Input
                id="horario_sabado"
                placeholder="9:00 - 14:00"
                disabled={mutation.isPending}
                {...form.register('horario_sabado')}
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="abre_domingo"
              checked={form.watch('abre_domingo') ?? false}
              onCheckedChange={(c) => form.setValue('abre_domingo', c === true)}
              disabled={mutation.isPending}
            />
            <Label htmlFor="abre_domingo" className="cursor-pointer font-normal">
              Abre domingos
            </Label>
          </div>
        </CardContent>
      </Card>

      {serverError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      )}

      <div className="flex justify-end gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={() => navigate({ to: '/dashboard' })}
          disabled={mutation.isPending}
        >
          Cancelar
        </Button>
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending && (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
          )}
          {mutation.isPending ? 'Creando…' : 'Crear cliente'}
        </Button>
      </div>
    </form>
  );
}

export const Route = createLazyRoute('/tenants/new')({
  component: NewTenantPage,
});
