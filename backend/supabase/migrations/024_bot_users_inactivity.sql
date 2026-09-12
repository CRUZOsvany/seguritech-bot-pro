-- ============================================================================
-- Migration 024: inactividad (Studio, Fase 5).
--
-- El barrido de inactividad manda como máximo UN recordatorio por silencio
-- del cliente (V-CUMP-04). Para no mandarlo dos veces (otra pasada del
-- barrido, otra instancia, un reinicio) lo reclama antes de enviarlo: marca
-- inactivity_reminded_at solo si el cliente no volvió a escribir
-- (last_inbound_at igual al que se leyó) y no se le recordó ya desde entonces.
--
-- Un mensaje nuevo del cliente no necesita limpiar la columna: el
-- recordatorio cuenta solo si es posterior a last_inbound_at.
--
-- bot_users ya tiene tenant_id y RLS (001). Idempotente: correrla dos veces
-- no rompe nada.
-- ============================================================================

alter table public.bot_users
  add column if not exists inactivity_reminded_at timestamptz;

comment on column public.bot_users.inactivity_reminded_at is
  'Cuándo se mandó el recordatorio de inactividad (Studio, Fase 5). Cuenta '
  'solo si es posterior a last_inbound_at: un mensaje nuevo del cliente abre '
  'otro silencio sin tener que limpiarla.';

-- El barrido busca, por tenant, conversaciones a media conversación por la
-- hora del último mensaje del cliente.
create index if not exists idx_bot_users_awaiting_reply
  on public.bot_users (tenant_id, last_inbound_at)
  where current_node_id is not null
    and current_node_id <> 'end'
    and opted_out_at is null;
