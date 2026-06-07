import { useState } from 'react';
import {
  Send, RotateCcw, Loader2, ExternalLink, MapPin, FileText, Smile,
} from 'lucide-react';
import { simulate, simulateReset, type InterpreterOutput } from '@/shared/api/tenants';
import { ApiError } from '@/shared/api/client';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Alert, AlertDescription } from '@/shared/ui/alert';

/**
 * Simulador de conversación de WhatsApp reutilizable.
 *
 * Simula contra el flow ACTIVO/publicado del tenant vía POST /api/admin/simulate
 * (no contra el draft del canvas). Renderiza fielmente los 13 kinds de
 * InterpreterOutput dentro de un mockup de teléfono.
 *
 * Props:
 *   tenantId    — tenant a simular.
 *   phoneNumber — teléfono de prueba (default un número simulado fijo).
 *   hasFlow     — si false, muestra aviso de que no hay flujo que simular.
 *   compact     — si true, reduce altura (para split-screen del designer).
 */

const DEFAULT_SIM_PHONE = '5210000000000';

type Turn = { from: 'user' | 'bot'; output?: InterpreterOutput; text?: string };

export function WhatsAppSimulator({
  tenantId,
  phoneNumber = DEFAULT_SIM_PHONE,
  hasFlow = true,
  compact = false,
}: {
  tenantId: string;
  phoneNumber?: string;
  hasFlow?: boolean;
  compact?: boolean;
}) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const send = async (content: string) => {
    if (!content.trim() || busy) return;
    setBusy(true);
    setErr(null);
    setTurns((t) => [...t, { from: 'user', text: content }]);
    setText('');
    try {
      const res = await simulate(tenantId, phoneNumber, content);
      setTurns((t) => [...t, ...res.outputs.map((o) => ({ from: 'bot' as const, output: o }))]);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Error al simular');
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    await simulateReset(tenantId, phoneNumber).catch(() => {});
    setTurns([]);
    setErr(null);
  };

  const chatHeight = compact ? 'h-56' : 'max-h-96 min-h-72';

  return (
    <div className="flex flex-col gap-2">
      {!hasFlow && (
        <Alert>
          <AlertDescription>Asigna un molde antes de simular.</AlertDescription>
        </Alert>
      )}

      {/* Mockup de teléfono */}
      <div className="mx-auto w-full max-w-sm overflow-hidden rounded-2xl border border-border/70 bg-card shadow-card">
        {/* Header estilo WhatsApp */}
        <div className="flex items-center gap-2 bg-emerald-600 px-3 py-2 text-white">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white/25 text-xs font-semibold">
            B
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-xs font-medium">Bot (simulación)</span>
            <span className="text-[10px] text-white/80">en línea</span>
          </div>
        </div>

        {/* Área de mensajes */}
        <div
          className={`flex flex-col gap-1.5 overflow-y-auto bg-[oklch(0.96_0.01_140)] px-3 py-3 ${chatHeight}`}
        >
          {turns.length === 0 && (
            <p className="my-auto text-center text-[11px] text-muted-foreground">
              Escribe un mensaje para iniciar la conversación.
            </p>
          )}
          {turns.map((turn, i) => (
            <SimulatorBubble key={i} turn={turn} onReply={send} />
          ))}
          {busy && (
            <div className="self-start rounded-lg bg-white px-3 py-1.5 text-xs text-muted-foreground shadow-sm">
              <Loader2 className="inline h-3 w-3 animate-spin" /> escribiendo…
            </div>
          )}
        </div>

        {/* Input */}
        <div className="flex items-center gap-1.5 border-t bg-card px-2 py-2">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                send(text);
              }
            }}
            placeholder="Escribe un mensaje…"
            disabled={busy || !hasFlow}
            className="h-8 text-xs"
          />
          <Button
            size="sm"
            className="h-8 w-8 shrink-0 p-0"
            disabled={busy || !text.trim() || !hasFlow}
            onClick={() => send(text)}
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

      <div className="flex justify-center">
        <Button size="sm" variant="ghost" onClick={reset} disabled={busy}>
          <RotateCcw className="mr-1 h-3 w-3" /> Reiniciar conversación
        </Button>
      </div>
    </div>
  );
}

/** Burbuja de un turno. Render fiel por kind de output. */
function SimulatorBubble({
  turn,
  onReply,
}: {
  turn: Turn;
  onReply: (content: string) => void;
}) {
  if (turn.from === 'user') {
    return (
      <div className="max-w-[80%] self-end rounded-lg rounded-br-sm bg-emerald-500 px-3 py-1.5 text-sm text-white shadow-sm">
        {turn.text}
      </div>
    );
  }

  const o = turn.output;
  if (!o) return null;

  const bubble = 'max-w-[85%] self-start rounded-lg rounded-bl-sm bg-white px-3 py-1.5 text-sm text-foreground shadow-sm';
  const chip = 'rounded-full border border-emerald-400 px-2 py-0.5 text-xs text-emerald-700 hover:bg-emerald-50';

  switch (o.kind) {
    case 'text':
      return <div className={bubble}>{o.text}</div>;

    case 'buttons':
      return (
        <div className={bubble}>
          <p className="whitespace-pre-wrap">{o.text}</p>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {o.buttons.map((b) => (
              <button key={b.id} className={chip} onClick={() => onReply(b.title)}>
                {b.title}
              </button>
            ))}
          </div>
        </div>
      );

    case 'list':
      return (
        <div className={bubble}>
          <p className="whitespace-pre-wrap">{o.text}</p>
          <p className="mt-1 text-[10px] font-medium text-muted-foreground">▤ {o.buttonLabel}</p>
          <div className="mt-1 flex flex-col gap-1">
            {o.sections.map((sec, si) => (
              <div key={si} className="flex flex-col gap-0.5">
                <p className="text-[10px] font-semibold text-muted-foreground">{sec.title}</p>
                {sec.items.map((it) => (
                  <button
                    key={it.id}
                    className="rounded-md border px-2 py-1 text-left text-xs hover:bg-muted"
                    onClick={() => onReply(it.title)}
                  >
                    <span className="font-medium">{it.title}</span>
                    {it.description && (
                      <span className="block text-[10px] text-muted-foreground">{it.description}</span>
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
          {o.caption && <p className="text-xs">{o.caption}</p>}
          <p className="truncate text-[10px] text-muted-foreground">{o.url}</p>
        </div>
      );

    case 'document':
      return (
        <div className={bubble}>
          <div className="flex items-center gap-1.5">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-medium">{o.filename}</span>
          </div>
          {o.caption && <p className="mt-0.5 text-xs">{o.caption}</p>}
        </div>
      );

    case 'location':
      return (
        <div className={bubble}>
          <div className="flex items-center gap-1.5">
            <MapPin className="h-4 w-4 text-red-500" />
            <span className="text-xs">{o.name ?? `${o.latitude}, ${o.longitude}`}</span>
          </div>
          {o.address && <p className="text-[10px] text-muted-foreground">{o.address}</p>}
        </div>
      );

    case 'escape_to_human':
      return (
        <div className={bubble}>
          <p>{o.userResponse}</p>
          <p className="mt-1 text-[10px] text-amber-600">🔔 Se alertó al dueño del negocio.</p>
        </div>
      );

    // ── v23.0 ──

    case 'cta_url':
      return (
        <div className={bubble}>
          {o.header?.type === 'text' && (
            <p className="mb-1 text-xs font-semibold">{o.header.text}</p>
          )}
          <p className="whitespace-pre-wrap">{o.body}</p>
          {o.footer && <p className="mt-0.5 text-[10px] text-muted-foreground">{o.footer}</p>}
          <a
            href={o.button.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1.5 flex items-center justify-center gap-1 rounded-md border border-emerald-400 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
          >
            <ExternalLink className="h-3 w-3" />
            {o.button.display_text}
          </a>
        </div>
      );

    case 'location_request':
      return (
        <div className={bubble}>
          <p className="whitespace-pre-wrap">{o.body}</p>
          <button
            className="mt-1.5 flex w-full items-center justify-center gap-1 rounded-md border border-emerald-400 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
            onClick={() => onReply('[ubicación compartida]')}
          >
            <MapPin className="h-3 w-3" /> Enviar ubicación
          </button>
        </div>
      );

    case 'media_carousel':
      return (
        <div className={bubble}>
          {o.body && <p className="mb-1.5 whitespace-pre-wrap">{o.body}</p>}
          <div className="flex gap-2 overflow-x-auto pb-1">
            {o.cards.map((card, ci) => (
              <div key={ci} className="w-40 shrink-0 rounded-md border bg-muted/30">
                <div className="flex h-20 items-center justify-center rounded-t-md bg-muted text-xl">
                  {card.header.type === 'video' ? '🎬' : '🖼️'}
                </div>
                <div className="p-1.5">
                  <p className="text-[11px] line-clamp-2">{card.body}</p>
                  <div className="mt-1 flex flex-col gap-1">
                    {card.buttons.map((btn, bi) =>
                      btn.type === 'quick_reply' ? (
                        <button
                          key={bi}
                          className="rounded border border-emerald-400 px-1.5 py-0.5 text-[10px] text-emerald-700 hover:bg-emerald-50"
                          onClick={() => onReply(btn.title)}
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
                          <ExternalLink className="h-2.5 w-2.5" /> {btn.display_text}
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
        <div className="self-start text-lg" title="Reacción al último mensaje">
          {o.emoji || '👍'}
        </div>
      );

    case 'call_permission_request':
      return (
        <div className={bubble}>
          <p className="whitespace-pre-wrap">{o.body}</p>
          {o.footer && <p className="mt-0.5 text-[10px] text-muted-foreground">{o.footer}</p>}
          <div className="mt-1.5 flex gap-1">
            <button className={chip} onClick={() => onReply('Permitir llamada')}>
              📞 Permitir
            </button>
            <button
              className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted"
              onClick={() => onReply('Rechazar llamada')}
            >
              Rechazar
            </button>
          </div>
        </div>
      );

    case 'whatsapp_flow':
      return (
        <div className={bubble}>
          {o.header && <p className="mb-1 text-xs font-semibold">{o.header}</p>}
          <p className="whitespace-pre-wrap">{o.body}</p>
          {o.footer && <p className="mt-0.5 text-[10px] text-muted-foreground">{o.footer}</p>}
          <button
            className="mt-1.5 flex w-full items-center justify-center gap-1 rounded-md border border-emerald-400 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
            onClick={() => onReply(`[abrió formulario: ${o.flow_cta}]`)}
          >
            <Smile className="h-3 w-3" /> {o.flow_cta}
          </button>
          <p className="mt-0.5 text-[9px] text-muted-foreground">Formulario · modo {o.mode}</p>
        </div>
      );
  }
}
