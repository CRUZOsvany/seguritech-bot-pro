import { useEffect, useState } from 'react';
import { createLazyRoute, Link } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  ArrowLeft, Loader2, Plus, Pencil, Trash2, AlertCircle, ListTree,
} from 'lucide-react';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Textarea } from '@/shared/ui/textarea';
import { Badge } from '@/shared/ui/badge';
import { Checkbox } from '@/shared/ui/checkbox';
import { Alert, AlertDescription } from '@/shared/ui/alert';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/shared/ui/table';
import { useSession } from '@/shared/auth/useSession';
import { ApiError } from '@/shared/api/client';
import type { ServiceDirectoryEntry } from '@/shared/api/service-directory';
import {
  useServiceDirectory,
  useCreateServiceDirectoryEntry,
  useUpdateServiceDirectoryEntry,
  useDeleteServiceDirectoryEntry,
} from '../hooks/use-service-directory';

/**
 * Directorio de servicios (Capa 2 de la arquitectura híbrida sin IA — ver
 * `.claude/PLAN_V1_BOT_FLOWS_SIN_IA.md`). El operador carga aquí preguntas
 * frecuentes/servicios heterogéneos con sus palabras clave; el flow del bot
 * solo referencia la condición `service_directory_match` — nunca edita el
 * texto de la respuesta desde el Designer.
 *
 * Sin match tolera acentos/typos vía fuzzyIncludes (Capa 0, backend); esta
 * pantalla solo captura texto plano, el matching es responsabilidad del bot.
 */
function ServiceDirectoryPage() {
  const { id } = Route.useParams();
  const sessionQ = useSession();
  const entriesQ = useServiceDirectory(id);
  const deleteM = useDeleteServiceDirectoryEntry(id);

  const isSuperAdmin = sessionQ.data?.role === 'super_admin';
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ServiceDirectoryEntry | null>(null);

  const entries = [...(entriesQ.data ?? [])].sort((a, b) => a.orden - b.orden);

  const startCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const startEdit = (entry: ServiceDirectoryEntry) => {
    setEditing(entry);
    setFormOpen(true);
  };
  const closeForm = () => {
    setFormOpen(false);
    setEditing(null);
  };

  const handleDelete = (entry: ServiceDirectoryEntry) => {
    const ok = window.confirm(
      `¿Eliminar "${entry.nombre}" del directorio? Esta acción no se puede deshacer.`,
    );
    if (ok) deleteM.mutate(entry.id);
  };

  return (
    <div className="flex flex-col gap-4">
      <Button asChild variant="ghost" size="sm" className="self-start">
        <Link to="/tenants/$id/whatsapp" params={{ id }}>
          <ArrowLeft className="mr-1 h-3 w-3" /> Volver a WhatsApp
        </Link>
      </Button>

      <Card className="shadow-card">
        <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <ListTree className="h-4 w-4 text-muted-foreground" aria-hidden />
              Directorio de servicios
            </CardTitle>
            <CardDescription>
              Preguntas y servicios sueltos que el bot resuelve en texto libre, sin tocar
              el flujo. Ej.: "¿hacen copia de llave de auto?" → respuesta + precio.
            </CardDescription>
          </div>
          {!formOpen && (
            <Button size="sm" onClick={startCreate}>
              <Plus className="mr-1 h-3 w-3" /> Agregar entrada
            </Button>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {formOpen && (
            <EntryForm
              tenantId={id}
              entry={editing}
              onDone={closeForm}
              onCancel={closeForm}
            />
          )}

          {deleteM.error instanceof ApiError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{deleteM.error.message}</AlertDescription>
            </Alert>
          )}

          {entriesQ.isLoading && (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Cargando…
            </div>
          )}

          {entriesQ.error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {entriesQ.error instanceof Error
                  ? entriesQ.error.message
                  : 'Error cargando el directorio'}
              </AlertDescription>
            </Alert>
          )}

          {!entriesQ.isLoading && entries.length === 0 && !formOpen && (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
              <ListTree className="h-7 w-7 text-muted-foreground/50" aria-hidden />
              <p className="text-sm text-muted-foreground">
                Todavía no hay entradas en el directorio de este cliente.
              </p>
            </div>
          )}

          {entries.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Nombre</TableHead>
                  <TableHead className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Palabras clave</TableHead>
                  <TableHead className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Precio</TableHead>
                  <TableHead className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Estado</TableHead>
                  <TableHead className="text-right text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => (
                  <TableRow key={entry.id} className="hover:bg-muted/40">
                    <TableCell className="max-w-[220px] align-top">
                      <p className="font-medium">{entry.nombre}</p>
                      <p className="line-clamp-2 text-xs text-muted-foreground">{entry.respuesta}</p>
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="flex flex-wrap gap-1">
                        {entry.keywords.map((kw) => (
                          <Badge key={kw} variant="outline" className="text-[10px]">
                            {kw}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="align-top text-sm">
                      {entry.precio != null ? `$${entry.precio.toFixed(2)}` : '—'}
                    </TableCell>
                    <TableCell className="align-top">
                      <Badge variant={entry.activo ? 'fsm-active' : 'outline'}>
                        {entry.activo ? 'Activo' : 'Inactivo'}
                      </Badge>
                    </TableCell>
                    <TableCell className="align-top text-right">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="ghost" onClick={() => startEdit(entry)}>
                          <Pencil className="mr-1 h-3 w-3" /> Editar
                        </Button>
                        {isSuperAdmin && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={deleteM.isPending}
                            onClick={() => handleDelete(entry)}
                          >
                            {deleteM.isPending && deleteM.variables === entry.id ? (
                              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                            ) : (
                              <Trash2 className="mr-1 h-3 w-3" />
                            )}
                            Eliminar
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================================
// FORMULARIO — mismo componente para crear y editar
// ============================================================================

const EntryFormSchema = z.object({
  nombre: z.string().min(1, 'Nombre requerido').max(200, 'Máximo 200 caracteres'),
  keywords: z.string().min(1, 'Al menos una palabra clave, separadas por coma'),
  respuesta: z.string().min(1, 'Respuesta requerida').max(4096, 'Máximo 4096 caracteres'),
  precio: z.string().optional(),
  orden: z.string().optional(),
  activo: z.boolean(),
});
type EntryFormValues = z.infer<typeof EntryFormSchema>;

function toDefaultValues(entry: ServiceDirectoryEntry | null): EntryFormValues {
  return {
    nombre: entry?.nombre ?? '',
    keywords: entry?.keywords.join(', ') ?? '',
    respuesta: entry?.respuesta ?? '',
    precio: entry?.precio != null ? String(entry.precio) : '',
    orden: entry ? String(entry.orden) : '0',
    activo: entry?.activo ?? true,
  };
}

function EntryForm({
  tenantId, entry, onDone, onCancel,
}: {
  tenantId: string;
  entry: ServiceDirectoryEntry | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const createM = useCreateServiceDirectoryEntry(tenantId);
  const updateM = useUpdateServiceDirectoryEntry(tenantId);
  const saving = createM.isPending || updateM.isPending;
  const saveError = createM.error ?? updateM.error;

  const {
    register, handleSubmit, watch, setValue, reset, formState,
  } = useForm<EntryFormValues>({
    resolver: zodResolver(EntryFormSchema),
    defaultValues: toDefaultValues(entry),
  });

  // Re-sincroniza el formulario si cambia la entrada a editar (o se limpia a "crear").
  useEffect(() => {
    reset(toDefaultValues(entry));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry?.id]);

  const onSubmit = handleSubmit(async (data) => {
    const keywords = data.keywords
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);
    const precio = data.precio && data.precio.trim() !== '' ? Number(data.precio) : undefined;
    const orden = data.orden && data.orden.trim() !== '' ? Number(data.orden) : 0;

    const payload = {
      nombre: data.nombre,
      keywords,
      respuesta: data.respuesta,
      precio,
      orden,
      activo: data.activo,
    };

    if (entry) {
      await updateM.mutateAsync({ entryId: entry.id, patch: payload });
    } else {
      await createM.mutateAsync(payload);
    }
    onDone();
  });

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-3 rounded-md border border-border/60 bg-muted/20 p-4"
    >
      <p className="text-sm font-medium">
        {entry ? `Editando "${entry.nombre}"` : 'Nueva entrada'}
      </p>

      {saveError instanceof ApiError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{saveError.message}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="nombre">Nombre *</Label>
          <Input id="nombre" {...register('nombre')} />
          {formState.errors.nombre && (
            <span className="text-xs text-destructive">{formState.errors.nombre.message}</span>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="keywords">Palabras clave (separadas por coma) *</Label>
          <Input id="keywords" placeholder="copia de llave, duplicado" {...register('keywords')} />
          {formState.errors.keywords && (
            <span className="text-xs text-destructive">{formState.errors.keywords.message}</span>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="respuesta">Respuesta del bot *</Label>
        <Textarea id="respuesta" rows={3} {...register('respuesta')} />
        {formState.errors.respuesta && (
          <span className="text-xs text-destructive">{formState.errors.respuesta.message}</span>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="precio">Precio (opcional)</Label>
          <Input id="precio" type="number" step="0.01" min="0" {...register('precio')} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="orden">Orden</Label>
          <Input id="orden" type="number" step="1" {...register('orden')} />
        </div>
        <div className="flex items-end gap-2 pb-1.5">
          <Checkbox
            id="activo"
            checked={watch('activo')}
            onCheckedChange={(c) => setValue('activo', c === true)}
          />
          <Label htmlFor="activo" className="cursor-pointer font-normal">
            Activo (el bot la usa)
          </Label>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={saving}>
          {saving && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
          {entry ? 'Guardar cambios' : 'Crear entrada'}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

export const Route = createLazyRoute('/_authed/tenants/$id/service-directory')({
  component: ServiceDirectoryPage,
});
