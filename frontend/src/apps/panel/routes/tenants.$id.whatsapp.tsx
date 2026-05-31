import { useState } from 'react';
import { createLazyRoute, Link } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  ArrowLeft, Play, Pause, Loader2, Send, RotateCcw, KeyRound, Trash2,
} from 'lucide-react';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Badge } from '@/shared/ui/badge';
import { Alert, AlertDescription } from '@/shared/ui/alert';
import { Textarea } from '@/shared/ui/textarea';
import { useTenant } from '../hooks/use-tenant';
import { useTenantServices } from '../hooks/use-tenant-services';
import { useSetServiceStatus } from '../hooks/use-set-service-status';
import { useUpdateBotConfig } from '../hooks/use-update-bot-config';
import { useTemplates } from '../hooks/use-templates';
import { useAssignMolde, useRemoveMolde } from '../hooks/use-molde';
import {
  useUpsertMetaCredentials, useRevokeMetaCredentials,
} from '../hooks/use-meta-credentials';
import { useSession } from '@/shared/auth/useSession';
import {
  simulate, simulateReset,
  type InterpreterOutput, type BotConfigPatch,
} from '@/shared/api/tenants';
import { ApiError } from '@/shared/api/client';

const SIM_PHONE = '5210000000000';

const botConfigSchema = z.object({
  numero_whatsapp_asignado: z.string().min(8).max(20),
  nombre_bot: z.string().max(60).optional().or(z.literal('')),
  tono_bot: z.enum(['formal', 'amigable', 'directo']).optional().or(z.literal('')),
  mensaje_bienvenida: z.string().max(1024).optional().or(z.literal('')),
  mensaje_menu_principal: z.string().max(1024).optional().or(z.literal('')),
  mensaje_fuera_horario: z.string().max(1024).optional().or(z.literal('')),
  mensaje_no_entendio: z.string().max(1024).optional().or(z.literal('')),
  mensaje_confirmacion_pedido: z.string().max(1024).optional().or(z.literal('')),
});
type BotConfigForm = z.infer<typeof botConfigSchema>;

const metaSchema = z.object({
  phoneNumberId: z.string().min(5).max(40),
  wabaId: z.string().min(5).max(40),
  displayPhoneNumber: z.string().min(5).max(20),
  accessToken: z.string().min(20).max(500),
});
type MetaForm = z.infer<typeof metaSchema>;

type Turn = { from: 'user' | 'bot'; output?: InterpreterOutput; text?: string };

function WhatsAppPanelPage() {
  const { id } = Route.useParams();
  const tenantQ = useTenant(id);
  const servicesQ = useTenantServices(id);
  const sessionQ = useSession();
  const setStatus = useSetServiceStatus();

  const isSuperAdmin = sessionQ.data?.role === 'super_admin';
  const tenant = tenantQ.data;
  const svc = servicesQ.data?.find((s) => s.serviceType === 'whatsapp_bot');

  if (tenantQ.isLoading) {
    return <div className="p-4 text-sm text-muted-foreground">Cargando…</div>;
  }
  if (!tenant) {
    return (
      <Alert variant="destructive">
        <AlertDescription>No se encontró el cliente.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Button asChild variant="ghost" size="sm" className="self-start">
        <Link to="/tenants/$id" params={{ id }}>
          <ArrowLeft className="mr-1 h-3 w-3" /> Volver al cliente
        </Link>
      </Button>

      {/* 1. Estado / activación */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{tenant.nombre_negocio} · WhatsApp Bot</CardTitle>
          <CardDescription>
            Estado del servicio, webhook y flujo activo.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          {svc ? (
            <Badge variant={`fsm-${svc.status}` as const}>servicio: {svc.status}</Badge>
          ) : (
            <Badge variant="outline">servicio no habilitado</Badge>
          )}
          <Badge variant={tenant.webhook_verified ? 'fsm-active' : 'outline'}>
            webhook: {tenant.webhook_verified ? 'verificado' : 'pendiente'}
          </Badge>
          <Badge variant={tenant.has_active_flow ? 'fsm-active' : 'outline'}>
            flujo: {tenant.has_active_flow ? 'activo' : 'sin molde'}
          </Badge>
          <div className="ml-auto flex gap-2">
            {svc && (svc.status === 'configuring' || svc.status === 'paused') && (
              <Button
                size="sm"
                disabled={setStatus.isPending}
                onClick={() => setStatus.mutate({ tenantId: id, serviceType: 'whatsapp_bot', status: 'active' })}
              >
                {setStatus.isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Play className="mr-1 h-3 w-3" />}
                Activar bot
              </Button>
            )}
            {svc && svc.status === 'active' && (
              <Button
                size="sm" variant="outline"
                disabled={setStatus.isPending}
                onClick={() => setStatus.mutate({ tenantId: id, serviceType: 'whatsapp_bot', status: 'paused' })}
              >
                {setStatus.isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Pause className="mr-1 h-3 w-3" />}
                Pausar
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 2. Credenciales Meta (solo super_admin) */}
      {isSuperAdmin && <MetaCredentialsCard tenantId={id} meta={tenant.meta_credentials} />}

      {/* 3. Mensajes del bot */}
      <BotMessagesCard tenantId={id} config={tenant.bot_configuration} />

      {/* 4. Molde */}
      <MoldeCard
        tenantId={id}
        giro={tenant.giro}
        activeFlow={tenant.active_flow}
      />

      {/* 5. Simulador */}
      <SimulatorCard tenantId={id} hasFlow={tenant.has_active_flow} />
    </div>
  );
}

function MetaCredentialsCard({
  tenantId, meta,
}: { tenantId: string; meta: import('@/shared/api/tenants').MetaCredentialsInfo | null }) {
  const [open, setOpen] = useState(false);
  const upsert = useUpsertMetaCredentials(tenantId);
  const revoke = useRevokeMetaCredentials(tenantId);
  const { register, handleSubmit, reset, formState } = useForm<MetaForm>({
    resolver: zodResolver(metaSchema),
  });

  const onSubmit = handleSubmit(async (data) => {
    try {
      await upsert.mutateAsync(data);
      reset({ phoneNumberId: '', wabaId: '', displayPhoneNumber: '', accessToken: '' });
      setOpen(false);
    } catch {
      /* el error se muestra abajo vía upsert.error */
    }
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Credenciales Meta</CardTitle>
        <CardDescription>
          WhatsApp Cloud API. El token es secreto: se escribe, no se muestra.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {meta ? (
          <div className="text-sm">
            <p>Número: <strong>{meta.display_phone_number}</strong></p>
            <p className="text-muted-foreground">phone_number_id: <code className="text-xs">{meta.phone_number_id}</code></p>
            <p className="text-muted-foreground">WABA: <code className="text-xs">{meta.waba_id}</code></p>
            <p className="text-muted-foreground">
              {meta.is_active ? 'activas' : 'inactivas'}
              {meta.rotated_at ? ` · rotadas ${new Date(meta.rotated_at).toLocaleString()}` : ''}
            </p>
          </div>
        ) : (
          <Alert><AlertDescription>Aún no hay credenciales Meta para este cliente.</AlertDescription></Alert>
        )}

        {upsert.error instanceof ApiError && (
          <Alert variant="destructive"><AlertDescription>{upsert.error.message}</AlertDescription></Alert>
        )}

        {!open ? (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
              <KeyRound className="mr-1 h-3 w-3" /> {meta ? 'Rotar / reemplazar token' : 'Agregar credenciales'}
            </Button>
            {meta && (
              <Button size="sm" variant="ghost" disabled={revoke.isPending}
                onClick={() => revoke.mutate()}>
                <Trash2 className="mr-1 h-3 w-3" /> Revocar
              </Button>
            )}
          </div>
        ) : (
          <form onSubmit={onSubmit} className="flex flex-col gap-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="flex flex-col gap-1">
                <Label htmlFor="phoneNumberId">Phone number ID</Label>
                <Input id="phoneNumberId" autoComplete="off" {...register('phoneNumberId')} />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="wabaId">WABA ID</Label>
                <Input id="wabaId" autoComplete="off" {...register('wabaId')} />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="displayPhoneNumber">Número visible</Label>
                <Input id="displayPhoneNumber" autoComplete="off" {...register('displayPhoneNumber')} />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="accessToken">Access token</Label>
                <Input id="accessToken" type="password" autoComplete="new-password" {...register('accessToken')} />
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={formState.isSubmitting || upsert.isPending}>
                {upsert.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />} Guardar
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => { reset(); setOpen(false); }}>
                Cancelar
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

function BotMessagesCard({
  tenantId, config,
}: { tenantId: string; config: import('@/shared/api/tenants').BotConfiguration | null }) {
  const update = useUpdateBotConfig(tenantId);
  const { register, handleSubmit, formState } = useForm<BotConfigForm>({
    resolver: zodResolver(botConfigSchema),
    defaultValues: {
      numero_whatsapp_asignado: config?.numero_whatsapp_asignado ?? '',
      nombre_bot: config?.nombre_bot ?? '',
      tono_bot: config?.tono_bot ?? undefined,
      mensaje_bienvenida: config?.mensaje_bienvenida ?? '',
      mensaje_menu_principal: config?.mensaje_menu_principal ?? '',
      mensaje_fuera_horario: config?.mensaje_fuera_horario ?? '',
      mensaje_no_entendio: config?.mensaje_no_entendio ?? '',
      mensaje_confirmacion_pedido: config?.mensaje_confirmacion_pedido ?? '',
    },
  });

  const onSubmit = handleSubmit((data) => {
    // Enviar solo campos con valor (vacío → no tocar).
    const patch: BotConfigPatch = {};
    Object.entries(data).forEach(([k, v]) => {
      if (typeof v === 'string' && v.trim() !== '') {
        (patch as Record<string, string>)[k] = v;
      }
    });
    update.mutate(patch);
  });

  const fields: Array<[keyof BotConfigForm, string]> = [
    ['mensaje_bienvenida', 'Mensaje de bienvenida'],
    ['mensaje_menu_principal', 'Menú principal'],
    ['mensaje_fuera_horario', 'Fuera de horario'],
    ['mensaje_no_entendio', 'No entendió'],
    ['mensaje_confirmacion_pedido', 'Confirmación de pedido'],
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Mensajes del bot</CardTitle>
        <CardDescription>Número asignado, tono y mensajes de plantilla.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="numero">Número WhatsApp asignado *</Label>
              <Input id="numero" {...register('numero_whatsapp_asignado')} />
              {formState.errors.numero_whatsapp_asignado && (
                <span className="text-xs text-destructive">Requerido (8–20).</span>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="nombre_bot">Nombre del bot</Label>
              <Input id="nombre_bot" {...register('nombre_bot')} />
            </div>
            <div className="flex flex-col gap-1">
              <Label>Tono</Label>
              <select
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                {...register('tono_bot')}
              >
                <option value="">—</option>
                <option value="formal">formal</option>
                <option value="amigable">amigable</option>
                <option value="directo">directo</option>
              </select>
            </div>
          </div>
          {fields.map(([key, label]) => (
            <div key={key} className="flex flex-col gap-1">
              <Label htmlFor={key}>{label}</Label>
              <Textarea id={key} rows={2} {...register(key)} />
            </div>
          ))}
          <div className="flex items-center gap-2">
            <Button type="submit" size="sm" disabled={update.isPending}>
              {update.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />} Guardar mensajes
            </Button>
            {update.isSuccess && <span className="text-xs text-emerald-600">Guardado ✓</span>}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function MoldeCard({
  tenantId, giro, activeFlow,
}: {
  tenantId: string; giro: string;
  activeFlow: import('@/shared/api/tenants').ActiveFlowInfo | null;
}) {
  const templatesQ = useTemplates();
  const assign = useAssignMolde(tenantId);
  const remove = useRemoveMolde(tenantId);
  const [slug, setSlug] = useState('');

  const templates = templatesQ.data ?? [];
  const sorted = [...templates].sort((a, b) =>
    a.giro === giro ? -1 : b.giro === giro ? 1 : 0,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Molde (flujo del bot)</CardTitle>
        <CardDescription>Plantilla de conversación por industria.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {activeFlow ? (
          <div className="flex items-center justify-between">
            <p className="text-sm">Molde activo: <strong>{activeFlow.nombre}</strong></p>
            <Button size="sm" variant="ghost" disabled={remove.isPending} onClick={() => remove.mutate()}>
              <Trash2 className="mr-1 h-3 w-3" /> Quitar
            </Button>
          </div>
        ) : (
          <div className="flex items-end gap-2">
            <div className="flex flex-1 flex-col gap-1">
              <Label>Elegir molde</Label>
              <select
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                value={slug} onChange={(e) => setSlug(e.target.value)}
              >
                <option value="">— selecciona —</option>
                {sorted.map((t) => (
                  <option key={t.slug} value={t.slug}>
                    {t.nombre} ({t.giro})
                  </option>
                ))}
              </select>
            </div>
            <Button size="sm" disabled={!slug || assign.isPending} onClick={() => assign.mutate(slug)}>
              {assign.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />} Asignar
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SimulatorCard({ tenantId, hasFlow }: { tenantId: string; hasFlow: boolean }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const send = async (content: string) => {
    if (!content.trim()) return;
    setBusy(true);
    setErr(null);
    setTurns((t) => [...t, { from: 'user', text: content }]);
    setText('');
    try {
      const res = await simulate(tenantId, SIM_PHONE, content);
      setTurns((t) => [...t, ...res.outputs.map((o) => ({ from: 'bot' as const, output: o }))]);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Error al simular');
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    await simulateReset(tenantId, SIM_PHONE).catch(() => {});
    setTurns([]);
    setErr(null);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Simulador</CardTitle>
        <CardDescription>Prueba el flujo sin tocar WhatsApp real.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {!hasFlow && (
          <Alert><AlertDescription>Asigna un molde antes de simular.</AlertDescription></Alert>
        )}
        <div className="flex max-h-80 flex-col gap-2 overflow-y-auto rounded-md border p-3">
          {turns.length === 0 && <p className="text-xs text-muted-foreground">Escribe un mensaje para empezar…</p>}
          {turns.map((turn, i) => (
            <Bubble key={i} turn={turn} onChip={(label) => send(label)} />
          ))}
        </div>
        {err && <Alert variant="destructive"><AlertDescription>{err}</AlertDescription></Alert>}
        <div className="flex gap-2">
          <Input
            value={text} onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); send(text); } }}
            placeholder="hola" disabled={busy}
          />
          <Button size="sm" disabled={busy || !text.trim()} onClick={() => send(text)}>
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
          </Button>
          <Button size="sm" variant="ghost" onClick={reset}>
            <RotateCcw className="mr-1 h-3 w-3" /> Reiniciar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Bubble({ turn, onChip }: { turn: Turn; onChip: (label: string) => void }) {
  if (turn.from === 'user') {
    return (
      <div className="self-end rounded-lg bg-primary px-3 py-1.5 text-sm text-primary-foreground">
        {turn.text}
      </div>
    );
  }
  const o = turn.output!;
  const base = 'self-start max-w-[80%] rounded-lg bg-muted px-3 py-1.5 text-sm';
  switch (o.kind) {
    case 'text':
      return <div className={base}>{o.text}</div>;
    case 'buttons':
      return (
        <div className={base}>
          <p>{o.text}</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {o.buttons.map((b) => (
              <button key={b.id} className="rounded border px-2 py-0.5 text-xs hover:bg-background" onClick={() => onChip(b.title)}>
                {b.title}
              </button>
            ))}
          </div>
        </div>
      );
    case 'list':
      return (
        <div className={base}>
          <p>{o.text}</p>
          <div className="mt-1 flex flex-col gap-1">
            {o.sections.flatMap((s) => s.items).map((it) => (
              <button key={it.id} className="rounded border px-2 py-0.5 text-left text-xs hover:bg-background" onClick={() => onChip(it.title)}>
                {it.title}{it.description ? ` — ${it.description}` : ''}
              </button>
            ))}
          </div>
        </div>
      );
    case 'image':
      return <div className={base}>🖼️ {o.caption ?? o.url}</div>;
    case 'document':
      return <div className={base}>📄 {o.filename}</div>;
    case 'location':
      return <div className={base}>📍 {o.name ?? `${o.latitude}, ${o.longitude}`}</div>;
    case 'escape_to_human':
      return <div className={base}>{o.userResponse} <span className="text-xs text-muted-foreground">🔔 alerta al dueño</span></div>;
    default:
      return null;
  }
}

export const Route = createLazyRoute('/_authed/tenants/$id/whatsapp')({
  component: WhatsAppPanelPage,
});
