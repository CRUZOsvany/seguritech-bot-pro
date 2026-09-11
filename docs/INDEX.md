# SegurITech Bot Pro — Índice de documentación

> **Documentos de control** (viven en `.claude/`, fuera de este índice):
> [`SEGURITECH_PROYECTO_MAESTRO.md`](../.claude/SEGURITECH_PROYECTO_MAESTRO.md) — qué es y por qué ·
> [`SEGURITECH_ESTADO_ACTUAL.md`](../.claude/SEGURITECH_ESTADO_ACTUAL.md) — cómo está hoy ·
> [`SEGURITECH_ROADMAP_OPERATIVO.md`](../.claude/SEGURITECH_ROADMAP_OPERATIVO.md) — qué sigue.
> Punto de entrada del repo: [`CLAUDE.md`](../CLAUDE.md).
>
> Este índice cubre solo la documentación técnica complementaria.

## Arquitectura
- [Arquitectura del sistema](architecture/ARCHITECTURE.md)
- [Estructura del proyecto](architecture/PROJECT_STRUCTURE.md)
- [Arquitectura visual multi-tenant](architecture/ARQUITECTURA_VISUAL_MULTI_TENANT.md)

## Desarrollo
- [Cómo arrancar el proyecto (local)](development/ARRANCAR_PROYECTO.md)
- [Guía del desarrollador](development/DEVELOPER_GUIDE.md)
- [Referencia del equipo](development/REFERENCIA_EQUIPO.md)

## Módulo POS
- [Visión general](pos/README.md)
- [API POS](pos/api.md)
- [Schema POS](pos/schema.md)
- [Seguridad POS](pos/security.md)

## Meta WhatsApp Cloud API
- [Quickstart Meta](meta-adapter/META_QUICKSTART.md)
- [Guía completa del adapter](meta-adapter/META_WHATSAPP_ADAPTER_GUIDE.md)

## Diseño de chatbots (flows)
- [Cómo diseñar un chatbot de WhatsApp](whatsapp/DISENO_DE_CHATBOTS.md) — discovery, patrones anti-loop/anti-dato-basura, node types, cumplimiento Meta, QA. Caso de estudio: cerrajerías.
- [Studio — inventario de la Fase 0](studio/INVENTARIO.md) — motor, moldes, Designer y límites de Meta verificados el 2026-09-10, contra la especificación del Studio.

## Deploy
- [Runbook de producción](deployment/RUNBOOK_PRODUCCION.md)

## Tests
- [Quick start](testing/QUICK_START_TESTS.md)
- [Arquitectura del suite](testing/TEST_SUITE_ARCHITECTURE.md)
- [Documentación del suite](testing/TEST_SUITE_DOCUMENTATION.md)

---

*`docs/archive/` (documentación histórica de sprints anteriores) se borró el 2026-08-26 (F-03, auditoría del mismo día) — el historial completo sigue disponible en `git log`/`git show` para cualquier archivo que se necesite consultar.*
