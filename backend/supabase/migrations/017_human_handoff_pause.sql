-- ============================================================================
-- Migration 017: Human handoff pause en bot_users
--
-- Agrega human_paused_until a bot_users para que escape_to_human pause
-- el bot. NULL = bot activo. Timestamp futuro = bot silenciado hasta esa
-- fecha (el BotController ignora mensajes entrantes del usuario).
-- El campo se limpia a NULL cuando expira (por tiempo) o cuando el dueño
-- reactiva al usuario via el panel/API.
-- ============================================================================

alter table public.bot_users
  add column if not exists human_paused_until timestamptz;

comment on column public.bot_users.human_paused_until is
  'NULL = bot activo. Timestamp futuro = usuario en handoff humano: '
  'el bot no responde hasta que expire o se limpie a NULL. '
  'Se establece automáticamente por el nodo escape_to_human '
  '(TTL configurable via HANDOFF_PAUSE_MINUTES, default 2880 min = 48h, D3). '
  'Se limpia manualmente con #listo/#reanudar del dueño por WhatsApp (P4) '
  'o desde el panel.';
