# SegurITech Bot Pro — Estado Actual del Proyecto

> **Documento de control vivo.** Complementa al `SEGURITECH_PROYECTO_MAESTRO.md` (guía de arquitectura y roadmap). Este archivo refleja el ESTADO REAL del código a la fecha de corte, verificado contra el repositorio, no contra los PDFs antiguos.
>
> **Versión:** 1.5 — Agosto 2026
> **Fecha de corte:** 2026-08-26
> **Método:** verificación directa sobre el árbol de código, migraciones y `git log`.
> **Regla:** si este documento contradice al MAESTRO, este gana en lo que toca a ESTADO; el MAESTRO gana en arquitectura/roadmap. Si ambos contradicen al código de `main`, el código gana.

---

## ⚠️ 0-ter. Ramas locales con trabajo real fuera de `main` (verificado 2026-08-20)

Al auditar el entorno se encontraron ramas locales no mergeadas a `main`. Cada afirmación de esta sección fue verificada con `git diff`/`git log` real, no tomada de un reporte externo sin confirmar — un reporte de otra sesión traía estas mismas ramas pero con una de las tres descrita de forma incorrecta y potencialmente peligrosa (ver abajo).

| Rama | Estado verificado | Acción |
|---|---|---|
| `security/audit-hardening-2026-08-20` | **Real y correcta.** Commit único `c85f870`. Verificado línea por línea: fix IDOR cross-tenant en `POST /api/admin/tenants/:id/simulate` y `/simulate/reset` (`tenantsRouter.ts:508,580`, ahora `403` si `admin.role !== 'super_admin' && admin.tenantId !== tenantId`); el webhook "caso B" (payload simple, sin firma HMAC) ahora responde `404` cuando `config.isProduction` (`ExpressServer.ts:234,290`, antes aceptaba mensajes falsos en producción con solo un `tenantId` válido); `BACKEND_API_KEY` subido a `.min(32)` (`env.ts:46`). Corrí `npm test --workspace backend` yo mismo: **19 suites, 163 tests, 163 pasan** — coincide con lo reportado. **Pendiente de merge a `main`.** | Owner confirma que ya la respaldó en GitHub (push resuelto por su cuenta el 2026-08-20); no verificable desde este entorno por falta de credenciales `git` remotas (`git fetch origin` → `Permission denied (publickey)`). **Falta el PR y el merge a `main`.** |
| `feat/1.2-intent-router-port` | **RESUELTA — mergeada a `main` vía PR #53 (2026-08-20, sesión separada de esta auditoría).** El smoke test contra la API viva de Anthropic que faltaba cuando se escribió esta fila sí se corrió: la key autentica, pero la cuenta no tiene crédito — el fallback a `'flow'` funciona como se espera, no es un bug. Ver el ticket 1.2 en `SEGURITECH_AI_SECRETARIA_PLAN.md` para el detalle completo. Sigue sin cablear en `BotController` (ticket 1.4, fuera de scope). | Cerrada — no requiere acción. |
| `feature/sprint-6-new-tenant` | **INCORRECTA en el reporte que la describió.** Se dijo "solo el formulario `/tenants/new`, sin cambios desde el corte anterior" — falso. `git diff main feature/sprint-6-new-tenant --stat` real: **145 archivos, -17,138/+1,346 líneas**. La rama se bifurcó de un punto del historial anterior a las migraciones 012–018, al Designer completo, al router de WhatsApp Flows, a human handoff, a la bandeja de escalaciones y al guion de textos — todo eso aparece como "borrado" en el diff porque la rama nunca lo tuvo. Mergearla tal cual **habría revertido meses de trabajo ya en `main`**. | **DECISIÓN TOMADA (owner, 2026-08-20): abandonada.** No se mergea. Si se quiere el formulario `/tenants/new` con `react-hook-form` + Zod + shadcn que traía, se reimplementa desde cero sobre el `main` actual — no se rescata por cherry-pick de esta rama. |

**Corrección de contradicción #1 de la v1.2 (§3, ahora resuelta):** el owner confirma directamente (2026-08-20) que la verificación de negocio en Meta Business **ya está en curso**. No se verificaron aquí los sub-pasos individuales (System User con token permanente, alta del número, primer template enviado a aprobación) — eso sigue pendiente de confirmar uno por uno contra el propio Meta Business Manager, no asumir completo solo porque el trámite general arrancó.

**Confirmado, no derivado de la sesión anterior:** `docs/deployment/RUNBOOK_PRODUCCION.md` **no existe** en el árbol (`Glob` real, 2026-08-20) — solo `docs/deployment/DEPLOYMENT_STEPS.md`. Todas las referencias de este documento y del plan IA a un "RUNBOOK_PRODUCCION.md ya creado" están mal; o se corrige la referencia o se crea el archivo real. `docs/adr/` tampoco existe — ADR-014 (aislamiento de conocimiento por tenant) sigue siendo solo una mención dentro del plan, no un archivo, y sigue siendo requisito antes de escribir código que use la tabla `018_tenant_knowledge_base.sql`.

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
- ~~Tests: 120 passed, 3 skipped (123 total) en 12 de 13 suites (1 suite skipped).~~ Número verificado el 2026-08-02, superado por trabajo posterior (deuda #16 y stress test de "Papelería DEMO"). **Actualizado 2026-08-26:** `npm test --workspace backend` → **38 suites, 292 tests, 292 pasan, 0 skipped.**

### 2.2. Frontend (YA EXISTE)

- Workspace `frontend/` con **Vite + React 19 + TanStack Router/Query + shadcn/ui + Zustand + Tailwind 4**.
- App activa: **`panel`** (apps/panel). **El Designer YA EXISTE**: `frontend/src/apps/panel/designer/` (flow-types, NodePalette, NodeContextMenu, TransitionsEditor, nodos, store, validación, mapping) — ya no está "por construir". POS en frontend tiene solo una pantalla de config (`routes/tenants.$id.pos.tsx`, 44 líneas); el PWA/CRUD operativo del cajero sigue diferido, tal como documenta el roadmap operativo.
- Pantalla de **configuración WhatsApp** construida: credenciales, mensajes del bot, asignación de molde, simulador embebido.
- Dashboard con **columna de estado operativo** del servicio `whatsapp_bot`.
- Type-check como gate real de CI (`tsc -p tsconfig.app.json`).

### 2.3. Base de datos

- ~~Migraciones 001–017 presentes en el repo~~ **Actualizado 2026-08-26:** son **001–020** (016 = `whatsapp_flows`, 017 = `human_handoff_pause`/`bot_users.human_paused_until`, 018 = `tenant_knowledge_base`, 019 = `bot_users_meta_compliance`, 020 = `tenant_service_directory`). Estado de aplicación en Supabase Cloud: **001–020 confirmadas aplicadas** — ver auditoría completa en `.claude/CONTRATOS_API_ADMIN.md` (2026-08-25; 020 fue la única mergeada-y-no-aplicada, corregido ese mismo día).
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

**Deuda nueva detectada 2026-08-20 (ver 0-ter para el detalle completo):**

13. **RESUELTA por este mismo PR:** `security/audit-hardening-2026-08-20` tenía trabajo verificado y correcto pero no estaba mergeada a `main` — este PR es exactamente ese merge. `feat/1.2-intent-router-port`, que estaba en la misma situación cuando se escribió este punto, ya se mergeó por separado vía PR #53 (ver fila actualizada arriba en 0-ter y changelog 1.3).
14. **RESUELTA 2026-08-20 (decisión, no código):** `feature/sprint-6-new-tenant` abandonada por estar 145 archivos atrasada respecto a `main` — ver 0-ter. Si se retoma el formulario `/tenants/new`, es trabajo nuevo sobre `main` actual, no un merge de esa rama.
16. **RESUELTA 2026-08-25:** migración `020_tenant_service_directory.sql` (PR #59) estaba mergeada a `main` pero nunca aplicada contra el Supabase remoto — bloqueaba el directorio de servicios completo (`GET`/`POST .../service-directory` fallaban con `PGRST205`). Aplicada manualmente vía SQL Editor. Auditadas las 20 migraciones contra el Supabase remoto vía REST (`grep` de `create table` + `GET /rest/v1/<tabla>` por cada una): 020 era la única mergeada y no aplicada, las 19 restantes sí lo estaban. Detalle completo en `.claude/CONTRATOS_API_ADMIN.md`.
17. **DOCUMENTADO 2026-08-25 (no es deuda, es contrato descubierto):** varios endpoints de `/api/admin/*` tienen shapes de request/response que varios prompts anteriores asumían distintos al código real (`dryRun` del import por body no query, `serviceType` no `service_type`, FSM de servicios en 2 pasos, directorio de servicios sin bulk create, `/simulate` usa `content` + requiere `persist:true` para encadenar turnos, delete de tenant es soft no cascade). Ver `.claude/CONTRATOS_API_ADMIN.md` — nuevo documento de referencia para no volver a pagar el costo de descubrirlo por prueba y error.
18. **PENDIENTE:** decisión de producto 2026-08-25 (tenant demo "Papelería DEMO", `.claude/PROMPT_DEMO_PAPELERIA_STRESS_TEST.md`) — dentro del nodo `buscar` del flow de papelería, cuando un mensaje matchea a la vez un producto real de `pos_products` y una entrada del directorio de servicios (ej. "copias a color" matchea tanto el SKU "Fotocopia a Color" como la entrada genérica "Fotocopias"), `catalog_found` gana sobre `service_directory_match` (orden actual del JSON, sin cambios). Verificado con un experimento aislado (`FlowInterpreter` real, sin tocar el tenant demo ni el servidor) que este orden da la respuesta más específica (SKU + precio exacto) cuando el catálogo tiene variantes; el orden invertido pierde esa precisión sin ganar nada cuando el mensaje es genérico. Recomendación: mantener el orden actual. Decisión final pendiente de Cris.
19. **PENDIENTE:** decisión de producto 2026-08-20 — el plan de "secretaria digital IA" (`SEGURITECH_AI_SECRETARIA_PLAN.md`) queda en pausa deliberada. Prioridad pasa a explotar el motor de flows determinista (los 13 tipos de nodo v23.0, hoy subutilizados) y a cumplimiento Meta (ventana de 24h, opt-out real — hoy no implementados, ver hallazgos de la sesión 2026-08-20) antes de retomar IA.

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
| 2026-08-25 | 1.4 | **Stress test del tenant demo "Papelería DEMO"** (110 SKUs reales, flow de 20 nodos, directorio de servicios — `.claude/PROMPT_DEMO_PAPELERIA_STRESS_TEST.md`) encontró y cerró 2 bugs reales de producto con TDD: (1) `CatalogSearchService.search()` tomaba `results[0]` de un repo sin `.order()` — sin scoring, "cuaderno profesional 100 hojas" podía devolver el SKU de 200 hojas; ahora rankea por match exacto → cuenta de tokens → cercanía de longitud (4 tests nuevos, `CatalogSearchService.ranking.test.ts`). (2) el nodo `bienvenida` del flow de papelería nunca consultaba el directorio de servicios para texto libre sin keyword match (ej. "curp" caía en `no_entendi`) — agregada transición `service_directory_match` al final, antes de `default`, confirmado en vivo contra el tenant demo (v2 publicada). Migración `020_tenant_service_directory.sql` (PR #59, mergeada) estaba sin aplicar en el Supabase remoto — aplicada manualmente, auditadas las 20 migraciones contra Cloud (solo esa faltaba). Nuevo documento `.claude/CONTRATOS_API_ADMIN.md` con los contratos reales de `/api/admin/*` descubiertos por prueba y error durante el stress test (varios difieren de lo que asumían prompts anteriores). Nueva regla operativa #15 en el MAESTRO (Git Bash + `curl -d` inline corrompe UTF-8, usar `--data-binary @archivo`). Queda una decisión de producto abierta para Cris (ítem 18 de esta sección): orden `catalog_found` vs `service_directory_match` dentro del nodo `buscar` cuando ambos matchean — recomendación (con datos) de mantener el orden actual. |
| 2026-08-20 | 1.3 | **Decisión de negocio: pausar el plan IA, enfocar el bot en flows deterministas al máximo antes de meter modelo alguno** (razón: P0 de infraestructura de producción sigue sin cerrar, y el motor de flows —13 tipos de nodo v23.0— sigue subexplotado). Auditado un reporte de otra sesión sobre 3 ramas locales no mergeadas: 2 verificadas correctas (`security/audit-hardening-2026-08-20` — 3 fixes P0/P1 reales confirmados en código, 163/163 tests corridos por mí; `feat/1.2-intent-router-port` — ticket 1.2 del plan IA implementado, en ese momento sin smoke test contra API viva), 1 verificada **incorrecta y peligrosa en el reporte original** (`feature/sprint-6-new-tenant` descrita como "sin cambios menores" cuando en realidad está 145 archivos / -17k líneas atrasada respecto a `main` — mergearla habría revertido meses de trabajo). Owner decide abandonar esa rama. Contradicción #1 de v1.2 resuelta: verificación de negocio en Meta **confirmada en curso** por el owner directamente (sub-pasos individuales aún sin confirmar uno por uno). **Misma fecha, sesión separada:** ticket 1.2 del plan IA cerrado con smoke test real contra la API de Anthropic (bloqueado solo por falta de crédito en la cuenta, no por el código) y mergeado a `main` vía **PR #53**; deuda `scripts/smoke-test.sh` reescrita y verificada end-to-end (resuelta); los 6 ítems de "Deuda técnica conocida" del MAESTRO (congelada desde Sprint 4) verificados uno a uno contra el código — ya estaban resueltos, MAESTRO desactualizado; `docs/deployment/RUNBOOK_PRODUCCION.md` (que este mismo documento y el plan IA daban por existente sin estarlo) escrito de cero y mergeado vía **PR #54**, `DEPLOYMENT_STEPS.md` archivado a `docs/archive/`. |
| 2026-08-26 | 1.5 | **Auditoría documental** (pedida por Cris, corrigiendo drift acumulado tras PRs #59–#63): §2.1 y §2.3 actualizados con conteo real de tests (38 suites, 292/292, 0 skipped — verificado corriendo `npm test --workspace backend`) y rango real de migraciones (001–020, no 001–017, todas confirmadas aplicadas en Cloud). Mismo pase corrigió `README.md` (tabla de migraciones 012–015 tenía las descripciones de 006–009 pegadas por error, faltaban 018–020, y "API admin (15 rutas)" estaba obsoleto tras la modularización) y `docs/INDEX.md` (enlazaba a `deployment/DEPLOYMENT_STEPS.md`, archivado desde 2026-08-20; corregido a `deployment/RUNBOOK_PRODUCCION.md`). |
