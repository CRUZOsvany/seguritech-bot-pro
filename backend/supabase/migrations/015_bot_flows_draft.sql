-- ============================================================================
-- Migration 015: scratch de borrador para el Bot Designer (Bloque A1)
--
-- El Designer (A2) edita un flow sin publicarlo. El borrador vive en
-- bot_flows.draft_json (un solo draft por flow) y puede estar incompleto o
-- inválido: NO se valida contra FlowSchema hasta el publish.
--
-- bot_flow_versions (mig 008) queda como historial SOLO de publicados.
-- bot_flows.json_definition sigue siendo el flow publicado y activo.
-- ============================================================================

alter table public.bot_flows
  add column if not exists draft_json       jsonb,
  add column if not exists draft_updated_at timestamptz;

comment on column public.bot_flows.draft_json is
  'Borrador en edición del Designer. NO validado contra FlowSchema hasta publish. NULL = sin draft.';

comment on column public.bot_flows.draft_updated_at is
  'Timestamp del último guardado de draft_json. NULL = sin draft.';
