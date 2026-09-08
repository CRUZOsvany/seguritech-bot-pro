-- ============================================================================
-- Migration 021: imagen de respaldo por tenant para cards de carrusel
-- ============================================================================
--
-- Meta exige header image/video en CADA card de un mensaje interactivo
-- `media_carousel`. Un producto de `catalog_items` sin `imagen_url` no puede
-- convertirse en card, así que un catálogo a medio fotografiar produciría un
-- carrusel con huecos silenciosos.
--
-- `imagen_fallback_url` es la foto genérica del negocio (logo, fachada) que
-- ocupa el lugar de la que falta. Es opcional: si está en NULL, los productos
-- sin foto propia simplemente quedan fuera del carrusel, y si ninguno tiene
-- foto el nodo resuelve a 0 cards y el flow toma su transición `default`
-- (mismo comportamiento que un send_list que resuelve a 0 items).
--
-- Aditiva y idempotente: no toca datos existentes ni rompe tenants actuales.
-- ============================================================================

alter table public.bot_configurations
  add column if not exists imagen_fallback_url text;

comment on column public.bot_configurations.imagen_fallback_url is
  'URL https de la imagen de respaldo del negocio para cards de carrusel cuyo producto no tiene imagen_url propia. NULL = esos productos se omiten del carrusel.';
