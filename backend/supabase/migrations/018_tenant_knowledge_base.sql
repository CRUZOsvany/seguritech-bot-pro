-- ============================================================================
-- Migration 018: Base de conocimiento del tenant (Secretaria Digital, Fase 1)
--
-- Tabla tenant_knowledge_chunks: fragmentos de conocimiento del negocio
-- (FAQ, catálogo, manual) recuperables por similaridad semántica. El
-- KnowledgeBaseRepository (ver .claude/SEGURITECH_AI_SECRETARIA_PLAN.md §3.2)
-- es la ÚNICA pieza de código autorizada a leer/escribir esta tabla — nunca
-- SQL armado por el modelo (regla 4 del plan, §0). ADR-014 documenta el
-- aislamiento por tenant_id (crear docs/adr/ADR-014 antes de mergear código
-- que use esta tabla, según regla 6 del plan).
--
-- PRERREQUISITO: extensión pgvector. Si `create extension vector` falla con
-- "extension \"vector\" is not available", habilítala primero desde
-- Supabase Dashboard → Database → Extensions → busca "vector" → Enable,
-- luego reintenta esta migración completa.
--
-- DIMENSIÓN DEL EMBEDDING: 1024, asumiendo voyage-3 / voyage-3-large
-- (partner de embeddings recomendado por Anthropic para usar junto con
-- Claude). Si en la Fase 1.2/1.3 se elige otro proveedor, ajusta ANTES de
-- cargar datos reales (la tabla queda vacía tras esta migración, el ALTER
-- es gratis todavía):
--   -- OpenAI text-embedding-3-small/large -> vector(1536)
--   -- Cohere embed-v3                     -> vector(1024)
--   alter table public.tenant_knowledge_chunks
--     alter column embedding type extensions.vector(N);
-- ============================================================================

create extension if not exists vector with schema extensions;

-- ============================================================================
-- TENANT_KNOWLEDGE_CHUNKS
-- ============================================================================
create table if not exists public.tenant_knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  content text not null check (char_length(content) > 0),
  embedding extensions.vector(1024),
  source_type text not null default 'manual'
    check (source_type in ('manual', 'catalog', 'faq')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_knowledge_chunks_tenant
  on public.tenant_knowledge_chunks(tenant_id);

create index if not exists idx_knowledge_chunks_source
  on public.tenant_knowledge_chunks(tenant_id, source_type);

-- Índice ivfflat para búsqueda aproximada por similaridad (coseno).
-- lists=100 es un default razonable para <1M filas; revisar si el volumen
-- real de conocimiento por tenant crece mucho más allá de eso.
create index if not exists idx_knowledge_chunks_embedding
  on public.tenant_knowledge_chunks
  using ivfflat (embedding extensions.vector_cosine_ops)
  with (lists = 100);

drop trigger if exists trg_knowledge_chunks_updated_at on public.tenant_knowledge_chunks;
create trigger trg_knowledge_chunks_updated_at
before update on public.tenant_knowledge_chunks
for each row execute function public.set_updated_at();

comment on table public.tenant_knowledge_chunks is
  'Conocimiento del negocio recuperable por similaridad semántica para el '
  'agente IA (Secretaria Digital, Fase 1). Aislado por tenant_id — ver '
  'KnowledgeBaseRepository y ADR-014.';
comment on column public.tenant_knowledge_chunks.embedding is
  'Vector de embedding. Dimensión fija en 1024 (voyage-3 family) — ver '
  'nota al inicio de esta migración si cambias de proveedor.';
comment on column public.tenant_knowledge_chunks.source_type is
  'Origen del fragmento: manual (capturado a mano en el panel), catalog '
  '(derivado del catálogo del tenant) o faq (preguntas frecuentes).';

-- ============================================================================
-- ROW LEVEL SECURITY
-- Patrón idéntico a 001_full_schema.sql: super_admin ve todo, admin_operator
-- solo su tenant. El backend usa service_role y bypasea RLS — esto es
-- defensa en profundidad, no el mecanismo de aislamiento primario (ese es
-- el filtro tenant_id explícito y obligatorio en KnowledgeBaseRepository,
-- regla 3 del plan).
-- ============================================================================
alter table public.tenant_knowledge_chunks enable row level security;

drop policy if exists knowledge_chunks_super_all on public.tenant_knowledge_chunks;
create policy knowledge_chunks_super_all on public.tenant_knowledge_chunks
  for all
  using (public.is_super_admin())
  with check (public.is_super_admin());

drop policy if exists knowledge_chunks_admin_tenant on public.tenant_knowledge_chunks;
create policy knowledge_chunks_admin_tenant on public.tenant_knowledge_chunks
  for all
  using (tenant_id = public.jwt_tenant_id())
  with check (tenant_id = public.jwt_tenant_id());
