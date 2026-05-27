import { useForm, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createRoute, useNavigate } from '@tanstack/react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Loader2 } from 'lucide-react';
import { authedLayoutRoute } from './_authed';
import {
  CreateTenantSchema,
  type CreateTenantInput,
  createTenant,
  GIRO_VALUES,
  TONO_VALUES,
} from '@/shared/api/tenants';
import { ApiError } from '@/shared/api/client';
import { useTemplates } from '../hooks/use-templates';
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
import { Textarea } from '@/shared/ui/textarea';
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

const TONO_LABELS: Record<(typeof TONO_VALUES)[number], string> = {
  formal: 'Formal',
  amigable: 'Amigable',
  directo: 'Directo',
};

const SENTINEL_NO_TEMPLATE = '__none__';

function NewTenantPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: templates, isLoading: templatesLoading, error: templatesError } =
    useTemplates();

  const form = useForm<CreateTenantInput>({
    resolver: zodResolver(CreateTenantSchema),
    defaultValues: {
      nombre_negocio: '',
      giro: 'papeleria',
      direccion: '',
      horario_semana: '',
      horario_sabado: '',
      abre_domingo: false,
      bot_configuration: {
        numero_whatsapp_asignado: '',
        nombre_bot: 'Asistente',
        tono_bot: 'amigable',
        mensaje_bienvenida: '',
      },
      template_slug: undefined,
    },
  });

  const mutation = useMutation({
    mutationFn: createTenant,
    onSuccess: ({ id }) => {
      // Invalida la lista para que el dashboard refleje el nuevo tenant.
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
      // Navega al detalle (placeholder hasta PROMPT I).
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
      {/* ====== Sección 1 — Datos del negocio ====== */}
      <Card>
        <CardHeader>
          <CardTitle>Nuevo cliente</CardTitle>
          <CardDescription>Datos del negocio</CardDescription>
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
              onValueChange={(v) => form.setValue('giro', v as (typeof GIRO_VALUES)[number])}
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
              onCheckedChange={(c) =>
                form.setValue('abre_domingo', c === true)
              }
              disabled={mutation.isPending}
            />
            <Label htmlFor="abre_domingo" className="cursor-pointer font-normal">
              Abre domingos
            </Label>
          </div>
        </CardContent>
      </Card>

      {/* ====== Sección 2 — Configuración del bot ====== */}
      <Card>
        <CardHeader>
          <CardTitle>Configuración del bot</CardTitle>
          <CardDescription>
            Identidad y comportamiento del bot de WhatsApp
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="numero_whatsapp">
                Número WhatsApp asignado <span className="text-destructive">*</span>
              </Label>
              <Input
                id="numero_whatsapp"
                type="tel"
                placeholder="+527471234567"
                disabled={mutation.isPending}
                {...form.register('bot_configuration.numero_whatsapp_asignado')}
              />
              {form.formState.errors.bot_configuration?.numero_whatsapp_asignado && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.bot_configuration.numero_whatsapp_asignado.message}
                </p>
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="nombre_bot">Nombre del bot</Label>
              <Input
                id="nombre_bot"
                placeholder="Asistente"
                disabled={mutation.isPending}
                {...form.register('bot_configuration.nombre_bot')}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="tono">Tono</Label>
            <Select
              value={form.watch('bot_configuration.tono_bot') ?? 'amigable'}
              onValueChange={(v) =>
                form.setValue(
                  'bot_configuration.tono_bot',
                  v as (typeof TONO_VALUES)[number],
                )
              }
              disabled={mutation.isPending}
            >
              <SelectTrigger id="tono">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TONO_VALUES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {TONO_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="mensaje_bienvenida">Mensaje de bienvenida</Label>
            <Textarea
              id="mensaje_bienvenida"
              placeholder="¡Hola! ¿En qué puedo ayudarte?"
              rows={3}
              disabled={mutation.isPending}
              {...form.register('bot_configuration.mensaje_bienvenida')}
            />
          </div>
        </CardContent>
      </Card>

      {/* ====== Sección 3 — Molde inicial (opcional) ====== */}
      <Card>
        <CardHeader>
          <CardTitle>Molde inicial (opcional)</CardTitle>
          <CardDescription>
            Template de flow de bot pre-armado por industria. Puedes asignarlo
            ahora o más tarde desde el detalle del cliente.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2">
            <Label htmlFor="template">Template</Label>
            <Select
              value={form.watch('template_slug') ?? SENTINEL_NO_TEMPLATE}
              onValueChange={(v) =>
                form.setValue(
                  'template_slug',
                  v === SENTINEL_NO_TEMPLATE ? undefined : v,
                )
              }
              disabled={mutation.isPending || templatesLoading}
            >
              <SelectTrigger id="template">
                <SelectValue
                  placeholder={
                    templatesLoading ? 'Cargando templates…' : 'Selecciona un template'
                  }
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SENTINEL_NO_TEMPLATE}>
                  — Sin molde (asignar después) —
                </SelectItem>
                {(templates ?? []).map((t) => (
                  <SelectItem key={t.slug} value={t.slug}>
                    {t.nombre} ({t.giro})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {templatesError && (
              <p className="text-xs text-destructive">
                No se pudieron cargar templates. Puedes crear el cliente sin
                molde y asignarlo después.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ====== Error global ====== */}
      {serverError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      )}

      {/* ====== Acciones ====== */}
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

export const tenantsNewRoute = createRoute({
  getParentRoute: () => authedLayoutRoute,
  path: '/tenants/new',
  component: NewTenantPage,
});
