# SegurITech Bot Pro — Estado Actual del Proyecto

> **Documento de control vivo.** Complementa al `SEGURITECH_PROYECTO_MAESTRO.md` (guía de arquitectura y roadmap). Este archivo refleja el ESTADO REAL del código a la fecha de corte, verificado contra el repositorio, no contra los PDFs antiguos.
>
> **Versión:** 1.3 — Agosto 2026
> **Fecha de corte:** 2026-08-20
> **Método:** verificación directa sobre el árbol de código, migraciones y `git log`.
> **Regla:** si este documento contradice al MAESTRO, este gana en lo que toca a ESTADO; el MAESTRO gana en arquitectura/roadmap. Si ambos contradicen al código de `main`, el código gana.

---

## ✅ 0-bis. Alerta operativa RESUELTA (verificado 2026-08-19)

**Actualización 2026-08-19:** el proyecto Supabase Cloud histórico
(`aakbliewttiuqhyfyqwn.supabase.co`) **vuelve a resolver por DNS y a
responder**. Verificado con `nslookup` (resuelve a edge de Cloudflare,
`104.18.38.10`) y con una query autenticada real contra `/rest/v1/tenants`
usando la `service_role` key del `.env` local → `200 OK` con datos. Causa
original no confirmada (probable pausa/reactivación de proyecto free-tier
por inactividad); no hubo que crear un proyecto nuevo ni recargar
migraciones. Dev local ya no está bloqueado por esto.

Nota operativa: sigue sin haber `supabase` CLI ni `psql` instalados en el
entorno de desarrollo actual — solo hay acceso vía REST API con la
`service_role` key. Aplicar migraciones nuevas requiere pegarlas a mano en
Supabase Dashboard → SQL Editor (Opción A del README) hasta que se
instale/enlace el CLI.

<details>
<summary>Alerta original (2026-08-02), por historial</summary>

El proyecto Supabase Cloud histórico dejó de resolver por DNS (NXDOMAIN),
confirmado contra el DNS del router y contra 1.1.1.1 (Cloudflare). Esto
bloqueaba `npm run dev` local: el login fallaba con `TypeError: fetch
failed` / `getaddrinfo ENOTFOUND`.

</details>

---

## 0. Aviso sobre documentos previos

| Documento | Estado | Acción |
|---|---|---|
| `SegurITech_Bot_Pro_Estado_Proyecto.pdf` (v1.0) | **OBSOLETO.** Describe Next.js 15 + Vercel, 3 migraciones, 6 endpoints, Sprint 4, 10 tests. Todo eso fue superado. Next.js se eliminó en Sprint E. | A `docs/archive/`. No actualizar. No usar como referencia. |
| `SEGURITECH_PROYECTO_MAESTRO.md` (v2.0) | **Vigente con parches pendientes.** Base correcta, congelada en "Sprint 5.1a". El código ya rebasó varias secciones. | Aplicar los parches de la sección 5 de este documento. |
| `FLUJO_DE_TRABAJO_POS-WHATSAPP` (la "carta") | **Vigente.** Define el modelo Fase 0 / Fase 1 (WhatsApp) / Fase 2 (POS) y el flujo GitHub. Reemplaza la numeración de Sprints para efectos de planeación. | Mantener como guía de fases. |

---

## 1. Resumen de una línea

Fase 0 (cimientos: integración de ramas, modularización de `AdminRouter`, migraciones 012–015, branch protection) está **completa**. El proyecto entra a **Fase 1 (WhatsApp en producción)**, cuyo bloqueador más lento es la **verificación de Meta Business**.

---

## 2. Estado del código (verificado)

### 2.1. Backend

- Arquitectura hexagonal intacta (`domain/` no importa `infrastructure/`).
- **`AdminRouter` modularizado** en sub-routers por dominio: `admin/flowsRouter.ts`, `admin/metaRouter.ts`, `admin/servicesRouter.ts`, `admin/tenantsRouter.ts`, además de `AuthRouter.ts` y `PosRouter.ts`.
- **API A1 de flows mergeada**: draft / publish / rollback sobre `bot_flow_versions` + simulación de draft. El rollback es un endpoint real: `POST /api/admin/tenants/:id/flows/:flowId/rollback` (super_admin, auditado).
- **`HandleMessageUseCase` ELIMINADO y YA EN `main`** (ADR-012 cumplido). La rama `chore/adr-012-remove-legacy-handlemessage` ya no existe (mergeada y borrada). Solo queda un comentario histórico en `backend/src/domain/entities/index.ts` explicando que el campo `currentState` de `User` perdió su único consumidor por este ADR — no es una referencia rota, es documentación in-code.
- Fix aplicado: en el path de `x-api-key`, el `adminId` se sanitiza a `null` cuando el `sub` no es UUID (evita reventar columnas UUID con `'cli'`).
- **Tests: 120 passed, 3 skipped (123 total) en 12 de 13 suites (1 suite skipped).** Número exacto verificado el 2026-08-02 corriendo `npm test --workspace backend` sobre `main` — ya no hay divergencia de conteo que fijar.

### 2.2. Frontend (YA EXISTE)

- Workspace `frontend/` con **Vite + React 19 + TanStack Router/Query + shadcn/ui + Zustand + Tailwind 4**.
- App activa: **`panel`** (apps/panel). **El Designer YA EXISTE**: `frontend/src/apps/panel/designer/` (flow-types, NodePalette, NodeContextMenu, TransitionsEditor, nodos, store, validación, mapping) — ya no está "por construir". POS en frontend tiene solo una pantalla de config (`routes/tenants.$id.pos.tsx`, 44 líneas); el PWA/CRUD operativo del cajero sigue diferido, tal como documenta el roadmap operativo.
- Pantalla de **configuración WhatsApp** construida: credenciales, mensajes del bot, asignación de molde, simulador embebido.
- Dashboard con **columna de estado operativo** del servicio `whatsapp_bot`.
- Type-check como gate real de CI (`tsc -p tsconfig.app.json`).

### 2.3. Base de datos

- Migraciones **001–017** presentes en el repo (016 = `whatsapp_flows`, 017 = `human_handoff_pause`, agrega `bot_users.human_paused_until`). Estado de aplicación en Supabase Cloud: **[PENDIENTE DE VERIFICAR]** — ver alerta 0-bis, el proyecto Cloud histórico no resuelve por DNS al 2026-08-02, no se pudo confirmar contra la BD real en esta sesión.
- `tenant_services` = **fuente única de verdad** de servicios habilitados. `active` = operativo.
- POS: **12 tablas `pos_*`** (users, categories, products, cash_sessions, customers, sales, sale_items, inventory_movements, suppliers, purchases, purchase_items, tenant_config). Idempotencia offline-first por `unique(tenant_id, client_id)` en `pos_sales`.

### 2.4. Operación / GitHub

- `main` protegida vía Rulesets: PR obligatorio, status check Node 20.x, force push bloqueado.
- Conventional commits en uso. Integración diaria, sin stacking de ramas.

---

## 3. Deuda y pendientes de limpieza detectados

Los 4 puntos que esta sección listaba en la v1.0 (2026-06-05) **ya están resueltos**, verificado el 2026-08-02:

1. ~~`enabled_modules` en `ModuleGuard.ts`~~ — cero hits en `backend/src`. Ya no existe.
2. ~~`HandleMessageUseCase` nombrado en `domain/entities/index.ts`~~ — lo que queda es un comentario histórico explicando el ADR-012, no una referencia rota. No requiere limpieza.
3. ~~Mergear `chore/adr-012-remove-legacy-handlemessage`~~ — ya mergeada; la rama ya no existe.
4. ~~Fijar el conteo real de tests~~ — hecho, ver sección 2.1: 120 passed, 3 skipped, 123 total.

**Deuda nueva detectada hoy:**

5. ~~`scripts/smoke-test.sh` está desactualizado~~ — **RESUELTA 2026-08-20.** Reescrito: usa `npm run dev` (nombre real), reemplaza el `/webhook/test-tenant` inventado (no es un endpoint real ni un tenant sembrado) por los checks reales que ya documentaba el README ("Smoke test post-deploy"): `/health`, `/api/admin/tenants` sin cookie (401), login + `/api/admin/tenants` con cookie (200) — este último bloque es opcional vía `ADMIN_EMAIL`/`ADMIN_PASSWORD`. Verificado corriendo el script real dos veces (con y sin credenciales) contra el backend real, ambas pasaron.
6. ~~El proyecto Supabase Cloud histórico dejó de resolver por DNS~~ — **RESUELTO 2026-08-19**, ver alerta 0-bis actualizada arriba.
7. ~~No hay `supabase` CLI ni `psql` instalados~~ — **PARCIAL 2026-08-19:** el CLI (`v2.98.2`) ya se invocó en el entorno Windows (existe `supabase/.temp/cli-latest` y `supabase/.branches/`), pero **`supabase init` no se completó** (no hay `supabase/config.toml`) y el proyecto **no está enlazado** (`supabase link` pendiente). `psql` sigue sin instalarse. Hasta enlazar, `npm run supabase:types` y `supabase db push` siguen bloqueados; migraciones nuevas se aplican a mano en el SQL Editor del Dashboard (confirmado funcionando: migración de admin_users vía este camino en esta misma sesión). Siguiente paso real: `npx supabase login` → `npx supabase link --project-ref aakbliewttiuqhyfyqwn`. **Nota 2026-08-19:** `npx supabase --version` (2.115.0) funciona correctamente desde Git Bash; falla desde PowerShell por policy de ejecución de scripts (`npx.ps1` bloqueado). Usar Git Bash para todo lo relacionado al CLI hasta que se resuelva la policy o se instale el binario standalone.
8. **RESUELTA 2026-08-19:** `@supabase/supabase-js` y `@supabase/ssr` se habían instalado en el `package.json` **raíz** (fuera del workspace `backend`), duplicando la versión ya declarada en `backend/package.json` (`^2.38.5` vs `^2.112.3` nuevo) y arrastrando `@supabase/ssr` — paquete para frameworks SSR (Next.js/Remix) que este proyecto no usa (Next.js se eliminó en Sprint E). Consolidado: `backend/package.json` actualizado a `^2.112.3` (única versión, única ubicación), `@supabase/ssr` desinstalado, root vuelve a `dependencies: {}`. Verificado con `npm run type-check` y `npm test` (143 passed, 3 skipped, 0 failed) tras el cambio.
9. **RESUELTA 2026-08-19:** la regla operativa 9 y la nota "GPT/AI dentro del flow (queda para V3)" del `SEGURITECH_PROYECTO_MAESTRO.md` quedaban contradichas por `.claude/SEGURITECH_AI_SECRETARIA_PLAN.md`, que ya existía completo y aprobado. Ambos puntos del MAESTRO se marcaron como superados, con referencia al plan y sus guardrails. También se corrigió una colisión de numeración: el plan proponía "ADR-013" para el aislamiento de la base de conocimiento, pero ese número ya lo usa el MAESTRO ("test cases del designer son gate de publicación") — renumerado a **ADR-014** en el plan y en `backend/supabase/migrations/018_tenant_knowledge_base.sql`.
10. **RESUELTA 2026-08-20:** esta misma bitácora (entrada 2026-08-02) afirmaba "`DEPLOYMENT_STEPS.md` jubilado, `RUNBOOK_PRODUCCION.md` creado" — falso, verificado contra el repo real: `docs/deployment/` solo tenía `DEPLOYMENT_STEPS.md` (describiendo la arquitectura pre-multi-tenant con `phone_tenant_map`, tabla que ya no existe) y `RUNBOOK_PRODUCCION.md` nunca se creó, pese a que este mismo documento y el plan IA (§0 regla 7) lo referencian varias veces como si existiera. Archivado `DEPLOYMENT_STEPS.md` a `docs/archive/` con nota de obsolescencia. **`docs/deployment/RUNBOOK_PRODUCCION.md` ya se escribió** (2026-08-20, mismo día): pasos ejecutables con comandos reales para el Camino B/C del roadmap operativo (VPS Hetzner, hardening, Node+PM2+nginx, secretos, Cloudflare DNS+Access, migraciones+seed, deploy PM2, webhook Meta, smoke test). Ahora sí es verdad lo que esta bitácora decía antes.
11. **RESUELTA 2026-08-20 (verificación, no cambio de código):** los 6 ítems restantes de "Deuda técnica conocida" en `SEGURITECH_PROYECTO_MAESTRO.md` (congelada desde Sprint 4) se verificaron uno a uno contra el código real de `main` — los 6 ya estaban resueltos (status gating de webhook con test dedicado, `send_list` ya nativo de Meta, N+1 de `GET /tenants` ya resuelto con comentario explícito, `ReadlineAdapter` ya gateado a dev, `.env.example` raíz y `bin/www` ya no existen). El MAESTRO nunca se actualizó para reflejarlo. Sección marcada como resuelta en el MAESTRO.

---

## 4. Stack real vs. MAESTRO (drift de versiones)

| Componente | MAESTRO v2.0 | Real en repo |
|---|---|---|
| Node | 18+ (LTS 20) | Se ejecuta en **22** |
| React | 18+ | **19.2** |
| Vite | 5+ | **8** |
| Tailwind | 3 | **4** |
| Zustand | (mencionado) | **5** |

Acción: actualizar la sección 4.2 del MAESTRO a estas versiones. No es bloqueante, pero evita confusión al onboardear al segundo dev.

---

## 5. Parches pendientes al MAESTRO v2.0

- Marcar ADR-012 como **CUMPLIDO** (no "Sprint 7").
- Sección 3.1: estado de migraciones 011→015, no "001–011".
- Sección 4.2: versiones reales (sección 4 de este doc).
- Sección 5.1: el frontend ya existe; actualizar el "estado objetivo" a "estado parcial real".
- Reconciliar numeración: el MAESTRO usa Sprints; la operación real usa Fases (0/1/2). Decidir una sola y migrar la otra a alias.

---

## 6. Entorno de trabajo — qué hay y qué falta

### 6.1. Ya disponible
- Dev OS: **Fedora 41** (espeja Linux del VPS; sin los problemas de build de Windows).
- Supabase (Cloud + CLI para local), IntelliJ + Claude Code (plan Max), Meta (en verificación).
- Git/GitHub con branch protection. Node 22, npm workspaces.

### 6.2. Falta para DESBLOQUEAR dev hoy (barato/rápido)
- **Túnel público para webhook Meta**: `cloudflared` (gratis) o ngrok. Sin esto no se prueba WhatsApp end-to-end mientras Meta verifica.
- **Docker** (o **Podman** nativo de Fedora) para el Supabase local del segundo dev. Confirmar Supabase CLI corriendo local.

### 6.3. Falta para PRODUCCIÓN (ruta crítica Fase 1 — WhatsApp)
- **VPS Hetzner CX22** (Ubuntu) — sin provisionar.
- **Dominio** + DNS.
- **Cloudflare** (DNS + Access Zero Trust para el panel).
- **PM2** en el VPS.
- **Meta**: verificación de negocio + System User permanent token + número + primer template aprobado. *(El más lento: 1–2 semanas. Arrancar YA.)*
- Observabilidad: **Sentry**, **UptimeRobot**, **Backblaze B2** (backups `pg_dump`).

### 6.4. Falta solo cuando llegue el POS (Fase 2 — no ahora)
- Impresora térmica ESC/POS, lector de barras USB HID, empaquetado del print-agent con `pkg`.

---

## 7. Siguientes acciones inmediatas (orden sugerido)

1. **Resolver la alerta 0-bis**: confirmar en el dashboard de Supabase si el proyecto Cloud histórico existe o hay que crear uno nuevo. Bloquea dev local ahora mismo.
2. **Arrancar verificación Meta Business** (corre en paralelo a todo, es el bloqueador más lento).
3. Levantar **túnel `cloudflared`** para probar la pantalla de config WhatsApp contra un número real.
4. Provisionar **VPS Hetzner + dominio + Cloudflare + PM2** (Fase 1: F1-1) — ver `docs/deployment/RUNBOOK_PRODUCCION.md`.
5. Onboarding del primer cliente WhatsApp (molde + credenciales + activar — F1-3) una vez Meta verifique.
6. Aplicar los parches al MAESTRO (sección 5) y archivar el PDF obsoleto.
7. Corregir `scripts/smoke-test.sh` (deuda nueva #5).

---

## 8. Bitácora de este documento

| Fecha | Versión | Cambio |
|---|---|---|
| 2026-06-05 | 1.0 | Creado a partir de verificación directa del repo. Reconcilia estado real con MAESTRO v2.0 y marca el PDF v1.0 como obsoleto. |
| 2026-08-02 | 1.1 | Sincronización total (rama `chore/sync-repo-y-runbook`): las 4 deudas de v1.0 confirmadas resueltas (ADR-012 en `main`, `enabled_modules` fuera, tests fijados en 120/3/123, designer confirmado existente). Migraciones 001–017 (antes decía 001–015). 8 ramas mergeadas podadas, 2 atrasadas archivadas como tag. Drift de `.env.example`/`package.json` cerrado. `DEPLOYMENT_STEPS.md` jubilado, `RUNBOOK_PRODUCCION.md` creado. Nueva alerta operativa: proyecto Supabase Cloud histórico sin resolución DNS (0-bis). Nueva deuda: `scripts/smoke-test.sh` desactualizado. |
| 2026-08-19 | 1.2 | Alerta 0-bis RESUELTA (Supabase Cloud vuelve a resolver DNS). Admin de panel reseteado vía SQL directo (usuario nuevo, viejo eliminado). `.claude/SEGURITECH_AI_SECRETARIA_PLAN.md` confirmado como plan vigente para la evolución "secretaria digital" — reemplaza la regla operativa 9 del MAESTRO ("no IA") por sus guardrails ejecutables. Deuda #7 actualizada (CLI de Supabase parcialmente instalado, no enlazado). Deuda nueva #8 resuelta en la misma sesión: dependencias de Supabase mal ubicadas en `package.json` raíz, consolidadas en `backend/`. Deuda nueva #9 resuelta: colisión de numeración ADR-013 entre MAESTRO y plan IA, renumerado a ADR-014. |
| 2026-08-20 | 1.3 | Ticket 1.2 del plan IA cumplido (`IntentRouterPort` + `AnthropicIntentRouter` con Haiku, PR #53) — pausado ahí por decisión de negocio: sin crédito en la cuenta de Anthropic, se prioriza el camino a ingresos (Meta Business en verificación, producción) sobre seguir la Fase 1 de IA. Deuda técnica revisada a fondo: `scripts/smoke-test.sh` reescrito y verificado funcionando end-to-end (deuda #5, resuelta). Verificados uno a uno los 6 ítems de "Deuda técnica conocida" del MAESTRO (congelada desde Sprint 4) — los 6 ya estaban resueltos en código, MAESTRO desactualizado (deuda nueva #11, resuelta — sección marcada en el MAESTRO). Hallazgo nuevo: la bitácora 2026-08-02 de este mismo documento afirmaba falsamente que `RUNBOOK_PRODUCCION.md` ya existía — no existe. `DEPLOYMENT_STEPS.md` (obsoleto, pre-multi-tenant) archivado a `docs/archive/` y `RUNBOOK_PRODUCCION.md` escrito de cero, 303 líneas con comandos ejecutables reales (deuda nueva #10, resuelta por completo). |
