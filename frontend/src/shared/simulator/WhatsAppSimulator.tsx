import { Fragment, useRef, useState } from 'react';
import {
  Send, RotateCcw, Loader2, ExternalLink, MapPin, FileText, Smile, Clock, HelpCircle, Phone,
} from 'lucide-react';
import {
  simulateConversation,
  type SimEvent,
  type SimOutbound,
  type SimTurn,
  type SimulateSource,
} from '@/shared/api/studio';
import { ApiError } from '@/shared/api/client';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Alert, AlertDescription } from '@/shared/ui/alert';
import {
  SIMULATED_LOCATION,
  bubbleFromPayload,
  eventLabel,
  formatWhen,
  sessionVariables,
  startAtTodayAt,
} from './studioView';

/**
 * Simulador de conversación de WhatsApp, sobre el motor real del bot.
 *
 * Cada acción del operador se agrega a la lista de eventos y la conversación
 * entera se vuelve a correr en el backend (POST .../studio/flows/:flowId/
 * simulate): el mismo ConversationEngine que atiende a los clientes, con
 * sesiones, reloj y envío falsos. Nada se escribe en la base ni se manda a
 * WhatsApp. Si el borrador cambió entre un turno y otro, la conversación se
 * recalcula completa con lo último editado.
 *
 * Cada burbuja se pinta desde el JSON exacto que se mandaría a WhatsApp, y
 * debajo de cada respuesta va el "Por qué" en español claro.
 *
 * Props:
 *   tenantId, flowId — qué se simula. Sin flowId no hay nada que simular.
 *   source           — 'draft' (lo que se edita), 'active' (lo que el bot
 *                      contesta hoy) o 'version' (+ versionId, del historial).
 *   phoneNumber      — teléfono del cliente simulado.
 *   onBeforeSend     — se espera antes de cada turno (el Designer guarda ahí
 *                      los cambios del canvas, para simular lo último editado).
 */

const DEFAULT_SIM_PHONE = '5210000000000';

const CLOCK_STEPS: Array<{ minutes: number; label: string; hint: string }> = [
  { minutes: 30, label: '+30 min', hint: 'Inactividad corta' },
  { minutes: 180, label: '+3 h', hint: 'Expira una sesión a media captura' },
  { minutes: 1440, label: '+1 día', hint: 'Cierra la ventana de 24 h' },
  { minutes: 2940, label: '+49 h', hint: 'Termina la pausa por paso a humano' },
];

const MEDIA_OPTIONS: Array<{ value: Extract<SimEvent, { type: 'media' }>['mediaType']; label: string }> = [
  { value: 'audio', label: 'Nota de voz' },
  { value: 'image', label: 'Imagen' },
  { value: 'sticker', label: 'Sticker' },
  { value: 'document', label: 'Documento' },
];

export function WhatsAppSimulator({
  tenantId,
  phoneNumber = DEFAULT_SIM_PHONE,
  hasFlow = true,
  compact = false,
  source = 'active',
  flowId,
  versionId,
  versionLabel,
  onBeforeSend,
}: {
  tenantId: string;
  phoneNumber?: string;
  hasFlow?: boolean;
  compact?: boolean;
  source?: SimulateSource;
  flowId?: string;
  versionId?: string;
  /** Etiqueta a mostrar en el chip cuando source='version', ej. "v3". */
  versionLabel?: string;
  onBeforeSend?: () => Promise<void> | void;
}) {
  const [events, setEvents] = useState<SimEvent[]>([]);
  const [turns, setTurns] = useState<SimTurn[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [atFixedTime, setAtFixedTime] = useState(false);
  const [simulatedTime, setSimulatedTime] = useState('22:00');
  // Hora de arranque del reloj simulado. Se fija en el primer turno y se
  // conserva al volver a correr la conversación, para que los turnos viejos
  // no cambien de hora cada vez.
  const startAtRef = useRef<string | null>(null);

  const canSimulate = hasFlow && !!flowId && (source !== 'version' || !!versionId);

  const run = async (nextEvents: SimEvent[]) => {
    if (busy || !flowId) return;
    setBusy(true);
    setErr(null);
    try {
      if (onBeforeSend) await onBeforeSend();
      if (!startAtRef.current) {
        startAtRef.current = atFixedTime ? startAtTodayAt(simulatedTime) : new Date().toISOString();
      }
      const res = await simulateConversation(tenantId, flowId, {
        events: nextEvents,
        source,
        ...(source === 'version' && versionId ? { versionId } : {}),
        startAt: startAtRef.current,
        from: phoneNumber,
      });
      setEvents(nextEvents);
      setTurns(res.turns);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Error al simular');
    } finally {
      setBusy(false);
    }
  };

  const send = (event: SimEvent) => run([...events, event]);

  const sendText = () => {
    const value = text.trim();
    if (!value) return;
    setText('');
    void send({ type: 'text', text: value });
  };

  const reset = () => {
    startAtRef.current = null;
    setEvents([]);
    setTurns([]);
    setErr(null);
  };

  const last = turns.at(-1);
  const totalMessages = turns.reduce((acc, t) => acc + t.billing.serviceMessages, 0);
  const chatHeight = compact ? 'h-72' : 'max-h-[32rem] min-h-72';

  return (
    <div className="flex flex-col gap-2">
      {!canSimulate && (
        <Alert>
          <AlertDescription>
            {!hasFlow || !flowId
              ? 'Asigna un molde antes de simular.'
              : 'Elige una versión para simular.'}
          </AlertDescription>
        </Alert>
      )}

      {/* Mockup de teléfono */}
      <div className="mx-auto w-full max-w-sm overflow-hidden rounded-2xl border border-border/70 bg-card shadow-card">
        <div className="flex items-center gap-2 bg-emerald-600 px-3 py-2 text-white">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white/25 text-xs font-semibold">
            B
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-xs font-medium">Bot (simulación)</span>
            <span className="text-[10px] text-white/80">motor real · sin enviar nada</span>
          </div>
          <span
            className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold ${
              source === 'draft'
                ? 'bg-amber-400 text-amber-950'
                : source === 'version'
                  ? 'bg-sky-300 text-sky-950'
                  : 'bg-white/25 text-white'
            }`}
          >
            {source === 'draft'
              ? 'BORRADOR'
              : source === 'version'
                ? `VERSIÓN ${versionLabel ?? ''}`.trim()
                : 'PUBLICADO'}
          </span>
        </div>

        <div className={`flex flex-col gap-1.5 overflow-y-auto bg-[oklch(0.96_0.01_140)] px-3 py-3 ${chatHeight}`}>
          {turns.length === 0 && (
            <p className="my-auto text-center text-[11px] text-muted-foreground">
              Escribe un mensaje para iniciar la conversación.
            </p>
          )}
          {turns.map((turn, i) => (
            <Fragment key={i}>
              <EventBubble event={events[i]} />
              {turn.outbound.map((out, j) => (
                <OutboundBubble key={j} out={out} onSend={send} disabled={busy} />
              ))}
              {turn.outbound.length === 0 && events[i]?.type !== 'advance_time' && (
                <p className="self-start text-[10px] italic text-muted-foreground">(el bot no contesta)</p>
              )}
              <WhyBlock lines={turn.why} initiallyOpen={i === turns.length - 1} />
            </Fragment>
          ))}
          {busy && (
            <div className="self-start rounded-lg bg-white px-3 py-1.5 text-xs text-muted-foreground shadow-sm">
              <Loader2 className="inline h-3 w-3 animate-spin" /> escribiendo…
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5 border-t bg-card px-2 py-2">
          <select
            aria-label="Mandar un mensaje que no es texto"
            value=""
            disabled={busy || !canSimulate}
            onChange={(e) => {
              const value = e.target.value as Extract<SimEvent, { type: 'media' }>['mediaType'];
              if (value) void send({ type: 'media', mediaType: value });
            }}
            className="h-8 w-9 shrink-0 rounded border border-input bg-background px-1 text-xs disabled:opacity-50"
            title="Mandar audio, imagen o sticker"
          >
            <option value="">📎</option>
            {MEDIA_OPTIONS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                sendText();
              }
            }}
            placeholder="Escribe un mensaje…"
            disabled={busy || !canSimulate}
            className="h-8 text-xs"
          />
          <Button
            size="sm"
            className="h-8 w-8 shrink-0 p-0"
            disabled={busy || !text.trim() || !canSimulate}
            onClick={sendText}
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>

      {err && (
        <Alert variant="destructive">
          <AlertDescription>{err}</AlertDescription>
        </Alert>
      )}

      {/* Reloj simulado */}
      <div className="flex flex-wrap items-center justify-center gap-1 text-[11px] text-muted-foreground">
        <Clock className="h-3 w-3" aria-hidden />
        <span>Adelantar reloj:</span>
        {CLOCK_STEPS.map((step) => (
          <Button
            key={step.minutes}
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-[11px]"
            title={step.hint}
            disabled={busy || turns.length === 0}
            onClick={() => void send({ type: 'advance_time', minutes: step.minutes })}
          >
            {step.label}
          </Button>
        ))}
      </div>

      <div className="flex items-center justify-center gap-2 text-[11px] text-muted-foreground">
        <label className="flex cursor-pointer items-center gap-1.5">
          <input
            type="checkbox"
            checked={atFixedTime}
            onChange={(e) => {
              setAtFixedTime(e.target.checked);
              reset();
            }}
            className="h-3 w-3"
          />
          Empezar hoy a las
        </label>
        <input
          type="time"
          value={simulatedTime}
          onChange={(e) => {
            setSimulatedTime(e.target.value);
            reset();
          }}
          disabled={!atFixedTime}
          className="h-6 rounded border border-input bg-background px-1 text-[11px] disabled:opacity-50"
        />
        <span className="text-[10px]">(reinicia; sirve para probar fuera de horario)</span>
      </div>

      {/* Estado de la conversación */}
      {last?.session && (
        <div className="mx-auto w-full max-w-sm rounded-lg border bg-muted/30 px-3 py-2 text-[11px]">
          <p>
            <span className="font-semibold">Paso actual:</span> «{last.session.currentNodeId ?? '—'}»
            {' · '}
            <span className="font-semibold">Reloj:</span> {formatWhen(last.at)}
          </p>
          {last.session.humanPausedUntil && new Date(last.session.humanPausedUntil) > new Date(last.at) && (
            <p className="text-amber-700">En manos de una persona hasta {formatWhen(last.session.humanPausedUntil)}</p>
          )}
          {last.session.optedOut && <p className="text-red-700">El cliente se dio de baja</p>}
          {last.session.lastInboundAt && (
            <p>
              <span className="font-semibold">Ventana de 24 h:</span> abierta hasta{' '}
              {formatWhen(new Date(new Date(last.session.lastInboundAt).getTime() + 86_400_000).toISOString())}
            </p>
          )}
          {sessionVariables(last.session).length > 0 && (
            <div className="mt-1">
              <span className="font-semibold">Variables:</span>
              <ul className="ml-3 list-disc">
                {sessionVariables(last.session).map(([k, v]) => (
                  <li key={k}>
                    <code>{`{{${k}}}`}</code> = {v.length > 60 ? `${v.slice(0, 59)}…` : v}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="mt-1 text-muted-foreground">Mensajes enviados en la conversación: {totalMessages}</p>
        </div>
      )}

      <div className="flex justify-center">
        <Button size="sm" variant="outline" onClick={reset} disabled={busy}>
          <RotateCcw className="mr-1 h-3.5 w-3.5" />
          Reiniciar conversación
        </Button>
      </div>
    </div>
  );
}

function EventBubble({ event }: { event: SimEvent | undefined }) {
  if (!event) return null;
  const label = eventLabel(event);
  if (label.from === 'system') {
    return (
      <p className="self-center rounded-full bg-white/70 px-2 py-0.5 text-[10px] text-muted-foreground">
        {label.text}
      </p>
    );
  }
  return (
    <div className="max-w-[80%] self-end whitespace-pre-wrap rounded-lg rounded-br-sm bg-emerald-500 px-3 py-1.5 text-sm text-white shadow-sm">
      {label.text}
    </div>
  );
}

function WhyBlock({ lines, initiallyOpen }: { lines: string[]; initiallyOpen: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  if (lines.length === 0) return null;
  return (
    <div className="max-w-[90%] self-start text-[10px]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 font-medium text-sky-700 hover:underline"
      >
        <HelpCircle className="h-3 w-3" /> {open ? 'Ocultar por qué' : 'Por qué'}
      </button>
      {open && (
        <ul className="mt-0.5 space-y-0.5 rounded-md border border-sky-200 bg-sky-50 px-2 py-1 text-sky-950">
          {lines.map((line, i) => (
            <li key={i}>· {line}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function OutboundBubble({
  out,
  onSend,
  disabled,
}: {
  out: SimOutbound;
  onSend: (event: SimEvent) => void;
  disabled: boolean;
}) {
  if (!out.payload) {
    return (
      <div className="max-w-[85%] self-start rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 text-xs text-red-900">
        No se enviaría: {out.rejected}
      </div>
    );
  }

  const b = bubbleFromPayload(out.payload);

  if (out.audience === 'owner') {
    return (
      <div className="max-w-[85%] self-start rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs text-amber-900">
        <p className="mb-1 font-semibold text-amber-700">🔔 Mensaje al dueño ({out.to})</p>
        <p className="whitespace-pre-wrap">{b.kind === 'text' ? b.text : `[${b.kind}]`}</p>
      </div>
    );
  }

  const bubble = 'max-w-[85%] self-start rounded-lg rounded-bl-sm bg-white px-3 py-1.5 text-sm text-foreground shadow-sm';
  const chip = 'rounded-full border border-emerald-400 px-2 py-0.5 text-xs text-emerald-700 hover:bg-emerald-50 disabled:opacity-50';

  switch (b.kind) {
    case 'text':
      return <div className={`${bubble} whitespace-pre-wrap`}>{b.text}</div>;

    case 'buttons':
      return (
        <div className={bubble}>
          <p className="whitespace-pre-wrap">{b.text}</p>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {b.buttons.map((btn) => (
              <button
                key={btn.id}
                className={chip}
                disabled={disabled}
                onClick={() => onSend({ type: 'button_reply', id: btn.id, title: btn.title })}
              >
                {btn.title}
              </button>
            ))}
          </div>
        </div>
      );

    case 'list':
      return (
        <div className={bubble}>
          <p className="whitespace-pre-wrap">{b.text}</p>
          <p className="mt-1 text-[10px] font-medium text-muted-foreground">▤ {b.button}</p>
          <div className="mt-1 flex flex-col gap-1">
            {b.sections.map((sec, si) => (
              <div key={si} className="flex flex-col gap-0.5">
                <p className="text-[10px] font-semibold text-muted-foreground">{sec.title}</p>
                {sec.rows.map((row) => (
                  <button
                    key={row.id}
                    disabled={disabled}
                    className="rounded-md border px-2 py-1 text-left text-xs hover:bg-muted disabled:opacity-50"
                    onClick={() => onSend({ type: 'list_reply', id: row.id, title: row.title })}
                  >
                    <span className="font-medium">{row.title}</span>
                    {row.description && (
                      <span className="block text-[10px] text-muted-foreground">{row.description}</span>
                    )}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      );

    case 'image':
      return (
        <div className={bubble}>
          <div className="mb-1 flex h-24 items-center justify-center rounded bg-muted text-2xl">🖼️</div>
          {b.caption && <p className="whitespace-pre-wrap text-xs">{b.caption}</p>}
          <p className="truncate text-[10px] text-muted-foreground">{b.url}</p>
        </div>
      );

    case 'document':
      return (
        <div className={bubble}>
          <div className="flex items-center gap-1.5">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-medium">{b.filename}</span>
          </div>
          {b.caption && <p className="mt-0.5 text-xs">{b.caption}</p>}
        </div>
      );

    case 'location':
      return (
        <div className={bubble}>
          <div className="flex items-center gap-1.5">
            <MapPin className="h-4 w-4 text-red-500" />
            <span className="text-xs">{b.name ?? `${b.latitude}, ${b.longitude}`}</span>
          </div>
          {b.address && <p className="text-[10px] text-muted-foreground">{b.address}</p>}
        </div>
      );

    case 'cta':
      return (
        <div className={bubble}>
          {b.header && <p className="mb-1 text-xs font-semibold">{b.header}</p>}
          <p className="whitespace-pre-wrap">{b.body}</p>
          {b.footer && <p className="mt-0.5 text-[10px] text-muted-foreground">{b.footer}</p>}
          <a
            href={b.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1.5 flex items-center justify-center gap-1 rounded-md border border-emerald-400 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
          >
            <ExternalLink className="h-3 w-3" />
            {b.label}
          </a>
        </div>
      );

    case 'location_request':
      return (
        <div className={bubble}>
          <p className="whitespace-pre-wrap">{b.body}</p>
          <button
            disabled={disabled}
            className="mt-1.5 flex w-full items-center justify-center gap-1 rounded-md border border-emerald-400 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
            onClick={() => onSend(SIMULATED_LOCATION)}
          >
            <MapPin className="h-3 w-3" /> Enviar ubicación
          </button>
        </div>
      );

    case 'carousel':
      return (
        <div className={bubble}>
          {b.body && <p className="mb-1.5 whitespace-pre-wrap">{b.body}</p>}
          <div className="flex gap-2 overflow-x-auto pb-1">
            {b.cards.map((card, ci) => (
              <div key={ci} className="w-40 shrink-0 rounded-md border bg-muted/30">
                <div className="flex h-20 items-center justify-center rounded-t-md bg-muted text-xl">
                  {card.media === 'video' ? '🎬' : '🖼️'}
                </div>
                <div className="p-1.5">
                  <p className="line-clamp-3 text-[11px]">{card.body}</p>
                  <div className="mt-1 flex flex-col gap-1">
                    {card.buttons.map((btn, bi) =>
                      btn.kind === 'reply' ? (
                        <button
                          key={bi}
                          disabled={disabled}
                          className="rounded border border-emerald-400 px-1.5 py-0.5 text-[10px] text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                          onClick={() => onSend({ type: 'button_reply', id: btn.id, title: btn.title })}
                        >
                          {btn.title}
                        </button>
                      ) : (
                        <a
                          key={bi}
                          href={btn.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-center gap-0.5 rounded border px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-muted"
                        >
                          <ExternalLink className="h-2.5 w-2.5" /> {btn.label}
                        </a>
                      ),
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      );

    case 'reaction':
      return (
        <div className="self-start text-lg" title="Reacción al último mensaje del cliente">
          {b.emoji || '👍'}
        </div>
      );

    case 'call_permission':
      return (
        <div className={bubble}>
          <p className="whitespace-pre-wrap">{b.body}</p>
          {b.footer && <p className="mt-0.5 text-[10px] text-muted-foreground">{b.footer}</p>}
          <p className="mt-1.5 flex items-center gap-1 text-[10px] text-muted-foreground">
            <Phone className="h-3 w-3" /> Permiso de llamada (la respuesta no se puede simular todavía)
          </p>
        </div>
      );

    case 'flow':
      return (
        <div className={bubble}>
          {b.header && <p className="mb-1 text-xs font-semibold">{b.header}</p>}
          <p className="whitespace-pre-wrap">{b.body}</p>
          {b.footer && <p className="mt-0.5 text-[10px] text-muted-foreground">{b.footer}</p>}
          <p className="mt-1.5 flex items-center justify-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground">
            <Smile className="h-3 w-3" /> {b.cta} (formulario de Meta: no se simula)
          </p>
        </div>
      );

    case 'unknown':
      return (
        <div className={`${bubble} text-xs text-muted-foreground`}>
          [mensaje de tipo {b.type}]
        </div>
      );
  }
}
