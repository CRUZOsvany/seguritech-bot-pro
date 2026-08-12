import { useMemo, useState } from 'react';
import { createLazyRoute, Link } from '@tanstack/react-router';
import { ArrowLeft, Loader2, MessageCircle, Play, RotateCcw } from 'lucide-react';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { Badge } from '@/shared/ui/badge';
import { Alert, AlertDescription } from '@/shared/ui/alert';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/shared/ui/select';
import { useMessages } from '../hooks/use-messages';
import { usePausedPhones, useResumeHandoff } from '../hooks/use-paused-phones';
import { formatRelativeTime, formatAbsoluteTime } from '@/shared/lib/format-date';
import type { MessageRow } from '@/shared/api/tenants';

/**
 * Vista de conversaciones reales (P5). El backend (GET /tenants/:id/messages)
 * devuelve un tail plano ordenado desc — el agrupado por hilo (from_phone) es
 * trabajo de este componente, no del backend (ver comentario en
 * MessagesRepository.tailByTenant).
 *
 * "Paginación por limit" (criterio 3): la ruta NO soporta cursor/offset, solo
 * un `limit` clampado [1,200] en el tail completo del tenant. No hay forma
 * honesta de dar "página 2" sin cambiar el backend — lo que sí se puede dar
 * es un selector de cuánta historia traer (50/100/200), que es lo que se
 * implementa abajo.
 */

const LIMIT_OPTIONS = [50, 100, 200] as const;

interface Thread {
  phoneNumber: string;
  messages: MessageRow[]; // asc por timestamp
  lastMessage: MessageRow;
}

function groupIntoThreads(messages: MessageRow[]): Thread[] {
  const byPhone = new Map<string, MessageRow[]>();
  for (const m of messages) {
    const list = byPhone.get(m.fromPhone) ?? [];
    list.push(m);
    byPhone.set(m.fromPhone, list);
  }
  const threads: Thread[] = [];
  for (const [phoneNumber, msgs] of byPhone) {
    // El tail llega desc; cada hilo se ordena asc para lectura cronológica.
    const asc = [...msgs].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );
    threads.push({ phoneNumber, messages: asc, lastMessage: asc[asc.length - 1] });
  }
  // Hilos ordenados por mensaje más reciente primero.
  threads.sort(
    (a, b) => new Date(b.lastMessage.timestamp).getTime() - new Date(a.lastMessage.timestamp).getTime(),
  );
  return threads;
}

/**
 * Un mensaje inbound se marca como "recibido mientras el bot estaba en
 * pausa" si: (a) el teléfono del hilo está en la lista de pausados AHORA, y
 * (b) no hay ningún mensaje outbound después de él en el hilo. No hay
 * histórico de "cuándo empezó" cada pausa (human_paused_until es un valor
 * puntual, no una bitácora) — este es el heurístico honesto derivable de los
 * datos reales: "el bot nunca contestó esto".
 */
function isDuringPause(thread: Thread, msgIndex: number, isPaused: boolean): boolean {
  if (!isPaused) return false;
  const msg = thread.messages[msgIndex];
  if (msg.direction !== 'inbound') return false;
  return !thread.messages
    .slice(msgIndex + 1)
    .some((m) => m.direction === 'outbound');
}

function ConversationsPage() {
  const { id } = Route.useParams();
  const [limit, setLimit] = useState<number>(200);
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);

  const messagesQ = useMessages(id, limit);
  const pausedQ = usePausedPhones(id);
  const resume = useResumeHandoff(id);

  const threads = useMemo(
    () => groupIntoThreads(messagesQ.data ?? []),
    [messagesQ.data],
  );
  const pausedSet = useMemo(
    () => new Map((pausedQ.data ?? []).map((p) => [p.phoneNumber, p.humanPausedUntil])),
    [pausedQ.data],
  );

  const activeThread = threads.find((t) => t.phoneNumber === selectedPhone) ?? threads[0] ?? null;

  return (
    <div className="flex flex-col gap-4">
      <Button asChild variant="ghost" size="sm" className="self-start">
        <Link to="/tenants/$id" params={{ id }}>
          <ArrowLeft className="mr-1 h-3 w-3" /> Volver al cliente
        </Link>
      </Button>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
          <div>
            <CardTitle className="text-base">Conversaciones</CardTitle>
            <CardDescription>
              Lo que el bot dijo de verdad — no una simulación.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Historial</span>
            <Select value={String(limit)} onValueChange={(v) => setLimit(Number(v))}>
              <SelectTrigger className="h-8 w-24 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LIMIT_OPTIONS.map((n) => (
                  <SelectItem key={n} value={String(n)}>{n} mensajes</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {messagesQ.isLoading && (
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Cargando conversaciones…
            </div>
          )}

          {messagesQ.error && (
            <Alert variant="destructive">
              <AlertDescription>
                {messagesQ.error instanceof Error ? messagesQ.error.message : 'Error cargando mensajes'}
              </AlertDescription>
            </Alert>
          )}

          {!messagesQ.isLoading && !messagesQ.error && threads.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <MessageCircle className="h-8 w-8 text-muted-foreground/50" aria-hidden />
              <p className="text-sm text-muted-foreground">
                Todavía no hay conversaciones registradas para este cliente.
              </p>
            </div>
          )}

          {!messagesQ.isLoading && !messagesQ.error && threads.length > 0 && (
            <div className="grid gap-3 lg:grid-cols-[280px_1fr]">
              <ThreadList
                threads={threads}
                pausedSet={pausedSet}
                selected={activeThread?.phoneNumber ?? null}
                onSelect={setSelectedPhone}
              />
              {activeThread && (
                <ThreadDetail
                  thread={activeThread}
                  isPaused={pausedSet.has(activeThread.phoneNumber)}
                  pausedUntil={pausedSet.get(activeThread.phoneNumber) ?? null}
                  onResume={() => resume.mutate({ phoneNumber: activeThread.phoneNumber })}
                  resuming={resume.isPending}
                />
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ThreadList({
  threads, pausedSet, selected, onSelect,
}: {
  threads: Thread[];
  pausedSet: Map<string, string | null>;
  selected: string | null;
  onSelect: (phone: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1 overflow-y-auto rounded-lg border border-border/70 bg-muted/20 p-1.5 lg:max-h-[65vh]">
      {threads.map((t) => {
        const active = t.phoneNumber === selected;
        const paused = pausedSet.has(t.phoneNumber);
        return (
          <button
            key={t.phoneNumber}
            type="button"
            onClick={() => onSelect(t.phoneNumber)}
            className={`flex flex-col gap-0.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors ${
              active ? 'bg-card shadow-sm' : 'hover:bg-card/60'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate font-medium">{t.phoneNumber}</span>
              {paused && <Badge variant="fsm-paused">pausado</Badge>}
            </div>
            <p className="truncate text-xs text-muted-foreground">{t.lastMessage.content}</p>
            <p
              className="text-[10px] text-muted-foreground"
              title={formatAbsoluteTime(t.lastMessage.timestamp)}
            >
              {formatRelativeTime(t.lastMessage.timestamp)}
            </p>
          </button>
        );
      })}
    </div>
  );
}

function ThreadDetail({
  thread, isPaused, pausedUntil, onResume, resuming,
}: {
  thread: Thread;
  isPaused: boolean;
  pausedUntil: string | null;
  onResume: () => void;
  resuming: boolean;
}) {
  return (
    <div className="flex flex-col rounded-lg border border-border/70 bg-card shadow-card">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <div>
          <p className="text-sm font-medium">{thread.phoneNumber}</p>
          {isPaused && (
            <p className="text-[11px] text-amber-700">
              🔇 Bot pausado{pausedUntil ? ` · ${formatRelativeTime(pausedUntil)}` : ''}
            </p>
          )}
        </div>
        {isPaused && (
          <Button size="sm" variant="outline" onClick={onResume} disabled={resuming}>
            {resuming ? (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            ) : (
              <Play className="mr-1 h-3 w-3" />
            )}
            Reanudar
          </Button>
        )}
      </div>

      <div className="flex max-h-[60vh] flex-col gap-1.5 overflow-y-auto p-3">
        {thread.messages.map((m, idx) => {
          const duringPause = isDuringPause(thread, idx, isPaused);
          const outbound = m.direction === 'outbound';
          return (
            <div
              key={m.id}
              className={`flex flex-col gap-0.5 ${outbound ? 'items-end' : 'items-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-lg px-3 py-1.5 text-sm shadow-sm ${
                  outbound
                    ? 'rounded-br-sm bg-emerald-500 text-white'
                    : 'rounded-bl-sm bg-muted text-foreground'
                }`}
              >
                <p className="whitespace-pre-wrap">{m.content}</p>
              </div>
              <p
                className="text-[10px] text-muted-foreground"
                title={formatAbsoluteTime(m.timestamp)}
              >
                {formatRelativeTime(m.timestamp)}
              </p>
              {duringPause && (
                <p className="flex items-center gap-1 text-[10px] text-amber-700">
                  <RotateCcw className="h-2.5 w-2.5" aria-hidden />
                  recibido mientras el bot estaba en pausa
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export const Route = createLazyRoute('/_authed/tenants/$id/messages')({
  component: ConversationsPage,
});
