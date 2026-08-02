# SegurITech Bot Pro — Índice de documentación

> El Documento Maestro y el Estado Actual son documentos internos del equipo
> (`.claude/SEGURITECH_PROYECTO_MAESTRO.md`, `.claude/SEGURITECH_ESTADO_ACTUAL.md`).
> Viven fuera de control de versiones (`.claude/` está en `.gitignore`) porque son
> de trabajo interno, no documentación pública del repo. Si algo en esta carpeta
> contradice el código de `main`, gana el código de `main`.
> Este índice cubre solo documentación técnica versionada.

## Arquitectura
- [Arquitectura del sistema](architecture/ARCHITECTURE.md)
- [Estructura del proyecto](architecture/PROJECT_STRUCTURE.md)
- [Arquitectura visual multi-tenant](architecture/ARQUITECTURA_VISUAL_MULTI_TENANT.md)

## Desarrollo
- [Cómo arrancar el proyecto (local)](development/ARRANCAR_PROYECTO.md)
- [Guía del desarrollador](development/DEVELOPER_GUIDE.md)
- [Referencia del equipo](development/REFERENCIA_EQUIPO.md)

## Módulo POS (Sprint 5.1a)
- [Visión general](pos/README.md)
- [API POS](pos/api.md)
- [Schema POS](pos/schema.md)
- [Seguridad POS](pos/security.md)

## Meta WhatsApp Cloud API
- [Quickstart Meta](meta-adapter/META_QUICKSTART.md)
- [Guía completa del adapter](meta-adapter/META_WHATSAPP_ADAPTER_GUIDE.md)

## Diseño de chatbots (flows)
- [Cómo diseñar un chatbot de WhatsApp](whatsapp/DISENO_DE_CHATBOTS.md) — discovery, patrones anti-loop/anti-dato-basura, node types, cumplimiento Meta, QA. Caso de estudio: cerrajerías.

## Deploy
- [Runbook de producción](deployment/RUNBOOK_PRODUCCION.md) — precondiciones, migraciones en Supabase Cloud, secretos, VPS (PM2/Docker), Cloudflare, Meta/WhatsApp, seed de pilotos, smoke test, rollback.

## Tests
- [Quick start](testing/QUICK_START_TESTS.md)
- [Arquitectura del suite](testing/TEST_SUITE_ARCHITECTURE.md)
- [Documentación del suite](testing/TEST_SUITE_DOCUMENTATION.md)

---

*Documentación histórica (sprints anteriores, troubleshooting de issues ya resueltos, primeras versiones del adapter Meta) en [`archive/`](archive/) — referencia bitácora, no refleja el estado actual del código.*
