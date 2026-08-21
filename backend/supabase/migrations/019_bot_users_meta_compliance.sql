-- ============================================================================
-- Migration 019: Cumplimiento Meta en bot_users — ventana de servicio 24h
-- y opt-out real.
--
-- Bloque 2.1 (ventana de servicio): agrega last_inbound_at, timestamp del
-- último mensaje entrante del cliente. Hoy no había ningún tracking de esto;
-- lo necesita cualquier envío que no sea respuesta directa e inmediata a un
-- mensaje entrante (fuera de esa ventana de 24h, WhatsApp solo permite
-- template aprobado, no texto libre).
--
-- Bloque 2.2 (opt-out real): agrega opted_out_at. Antes "cancelar" solo
-- reseteaba el flow (ver FlowInterpreter.ESCAPE_WORDS) — no existía forma de
-- que un cliente dejara de recibir mensajes de verdad. NULL = puede recibir
-- mensajes. Timestamp = opt-out activo, el bot no debe enviarle nada salvo
-- la confirmación del opt-out mismo, hasta que el cliente vuelva a escribir
-- voluntariamente (reactivación implícita, patrón estándar).
-- ============================================================================

alter table public.bot_users
  add column if not exists last_inbound_at timestamptz,
  add column if not exists opted_out_at timestamptz;

comment on column public.bot_users.last_inbound_at is
  'Timestamp del último mensaje entrante del cliente (se actualiza en '
  'CUALQUIER mensaje recibido, sea o no de opt-out). Base para decidir si '
  'un envío está dentro de la ventana de servicio de 24h de Meta.';

comment on column public.bot_users.opted_out_at is
  'NULL = el cliente puede recibir mensajes. Timestamp = opt-out activo '
  '(el cliente escribió una palabra de baja, ej. STOP). Mientras esté '
  'seteado, el bot no debe enviar nada a este número salvo la confirmación '
  'del opt-out. Se limpia automáticamente cuando el cliente vuelve a '
  'escribir cualquier mensaje (opt-in implícito) — no requiere acción del '
  'panel.';

create index if not exists idx_bot_users_opted_out_at
  on public.bot_users (opted_out_at)
  where opted_out_at is not null;
