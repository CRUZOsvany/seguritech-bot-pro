-- ============================================================================
-- 003_backfill_current_node_id.sql
-- Sprint B — backfill de current_state legacy → current_node_id
--
-- Mapping: cada UserState antigua → nodo equivalente en default_v1.
-- Solo aplica a usuarios cuyo current_node_id está NULL (es decir, los
-- preexistentes al Sprint B). Los usuarios nuevos arrancan con
-- current_node_id = flow.start_node_id directamente desde el código.
--
-- IMPORTANTE: NO se dropea current_state. Queda como columna zombi.
-- Una migración futura (004) la eliminará tras N días sin regresiones.
-- ============================================================================

update public.bot_users
set current_node_id = case current_state
  when 'initial'            then 'welcome'
  when 'menu'               then 'welcome'
  when 'viewing_products'   then 'show_catalog'
  when 'making_order'       then 'select_product'
  when 'confirming_order'   then 'confirm_order'
  else 'welcome'
end
where current_node_id is null;

-- Comentario informativo para que un DBA futuro entienda el porqué
comment on column public.bot_users.current_state is
  'DEPRECATED Sprint B. Mantenido para rollback. Eliminar en migración 004 tras N días sin regresiones.';