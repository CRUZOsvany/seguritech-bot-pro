-- ============================================================================
-- 013 — Canal en bot_flows (DEC-2: flujos separados por canal)
-- WhatsApp y Messenger tienen flows independientes. Un flow activo por
-- (tenant, channel), no por tenant.
-- ============================================================================

alter table public.bot_flows
  add column if not exists channel text not null default 'whatsapp'
  check (channel in ('whatsapp','messenger'));

-- El índice único viejo era (tenant_id) where is_active.
-- Ahora debe ser (tenant_id, channel) where is_active: un flow activo por canal.
drop index if exists public.idx_bot_flows_tenant_active;

create unique index if not exists idx_bot_flows_tenant_channel_active
  on public.bot_flows(tenant_id, channel)
  where is_active = true;

create index if not exists idx_bot_flows_channel
  on public.bot_flows(channel);

comment on column public.bot_flows.channel is
  'Canal del flow: whatsapp | messenger. Flows separados por canal (DEC-2).';
