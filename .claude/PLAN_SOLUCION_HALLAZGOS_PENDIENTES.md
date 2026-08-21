# Plan de Solución — Hallazgos Pendientes (Documento 1 de 2)

> **Producto:** ChatBot (SegurITech) — V1 sin IA. ChatBot Pro (con IA/Secretaria Digital) queda pausado para una fase futura — ver nota de pausa en `.claude/SEGURITECH_AI_SECRETARIA_PLAN.md`.
>
> Consolida todo lo encontrado en la auditoría del 2026-08-20: 3 ramas sin integrar, contradicciones de documentación, y los gaps de cumplimiento Meta. Cada bloque está pensado para convertirse en un prompt de Claude Code independiente, en el orden en que aparece.
>
> **Companion:** `PLAN_V1_BOT_FLOWS_SIN_IA.md` (Documento 2) — la primera versión general del ChatBot, con foco actual en papelería. Este documento (1) es lo que hay que cerrar ANTES o EN PARALELO a ese trabajo, no después.
>
> **Fuente de verdad de estado, en detalle, con verificación línea por línea:** `.claude/SEGURITECH_ESTADO_ACTUAL.md` §0-ter (v1.3, 2026-08-20). Este documento es el plan de acción derivado de esa auditoría — si hay diferencia entre lo que dice aquí y lo que dice §0-ter, gana §0-ter.
>
> **Creado:** 2026-08-20, a partir de la ronda de auditoría de esa misma fecha. Guardado tal cual se definió en la conversación, para retomarlo como lista de prompts — no se ha ejecutado ningún bloque todavía salvo lo anotado explícitamente abajo.

---

## Bloque 0 — Ramas sueltas (5 minutos, cero dependencias)

```bash
git push origin security/audit-hardening-2026-08-20 feat/1.2-intent-router-port feature/sprint-6-new-tenant
```

Abrir los 3 PRs en GitHub aunque no se mergeen todavía. Una rama solo local se pierde si esta máquina falla; un PR abierto, no.

> **Nota al guardar (2026-08-20):** el owner reportó en la misma sesión de la auditoría que ya resolvió el push por su cuenta. **No verificado desde este entorno** (sin credenciales `git` remotas aquí — `git fetch origin` devuelve `Permission denied (publickey)`). Antes de repetir este comando, confirmar con `git branch -r` si las ramas ya están en `origin`. Además: **`feature/sprint-6-new-tenant` NO debe pushearse/abrirse como PR con intención de mergear** — ver la corrección de ese punto en Bloque 1 y en `SEGURITECH_ESTADO_ACTUAL.md` §0-ter (esa rama quedó 145 archivos atrasada respecto a `main` y el owner decidió abandonarla, no rescatarla).

---

## Bloque 1 — Mergear `security/audit-hardening-2026-08-20` (prioridad máxima)

**Por qué primero:** corrige un IDOR cross-tenant real (un `admin_operator` podía mutar `bot_users` de otro cliente) y un webhook que nunca verificaba firma HMAC en ningún ambiente. Verificado de forma independiente: 163/163 tests, type-check limpio, 0 vulnerabilidades de producción. Listo para review de Osvany tal cual está — no requiere trabajo adicional, solo mergear.

**Estado real (no repetir la verificación, ya está hecha):** los 3 fixes puntuales fueron confirmados línea por línea contra el código el 2026-08-20 (`tenantsRouter.ts:508,580`, `ExpressServer.ts:234,290`, `env.ts:46`) y `npm test --workspace backend` corrido de verdad: 19 suites, 163/163 en verde. Sigue **sin mergear a `main`** — mientras no haya merge, estos fixes no protegen producción, solo la rama.

---

## Bloque 2 — Cumplimiento Meta (antes de que la verificación termine)

Esto no es "buena práctica" — es lo que decide si Meta te deja operar o te marca el número por abuso. Dos sub-bloques, ambos no negociables antes de mandar tráfico real:

### 2.1 Ventana de servicio de 24h

**Problema real:** fuera de esa ventana, WhatsApp solo permite responder con un template aprobado — texto libre fuera de ventana arriesga que Meta marque el número. Hoy no hay tracking del timestamp del último mensaje entrante del cliente.

**Ticket:** agregar `lastInboundMessageAt` a `bot_users` (o derivarlo de la tabla `messages` ya existente, que sí tiene `created_at` por mensaje inbound — confirmar cuál es más barato antes de decidir). `BotController` debe consultar esto antes de enviar texto libre fuera de flow-response inmediato; si han pasado más de 24h, la única opción válida es un template aprobado.

### 2.2 Opt-out real

**Problema real:** hoy `cancelar` existe como palabra de escape que **resetea el flow**, no que marca opt-out. Un cliente que ya no quiere mensajes puede seguir recibiéndolos.

**Ticket:** nueva columna `bot_users.opted_out_at` (o similar). Palabra(s) de opt-out (`STOP`, `cancelar suscripción`, ajustar copy exacto según lo que Meta espera) marcan esta columna y el `BotController` debe rechazar CUALQUIER envío saliente a ese número hasta que el cliente vuelva a escribir voluntariamente (reactivación implícita al recibir un mensaje nuevo de su parte, patrón estándar de opt-in/opt-out).

### 2.3 Monitoreo de quality rating (puede ir después de 2.1/2.2)

Sin código todavía. Mínimo viable: loggear/alertar cuando Meta reporte degradación de calidad vía webhook de estado (Meta manda eventos de `account_update`/quality rating por webhook si están suscritos). No bloquea el lanzamiento del primer cliente, pero sí bloquea escalar a más de unos pocos.

### 2.4 Rubros restringidos (médico, farmacia)

**Problema real:** esos dos moldes no tienen ningún guardrail que impida que el bot conteste como si vendiera medicamentos con receta o diera diagnóstico — política de comercio restringida de Meta para esos rubros.

**Decisión pendiente, no técnica:** ¿vas a ofrecer el servicio a médico/farmacia en la V1, o los pausas hasta tener el guardrail? Si los ofreces, el ticket mínimo es que el molde de esos dos giros nunca incluya nodos que permitan cotizar/vender medicamento con receta o cualquier lenguaje de diagnóstico — se resuelve a nivel de diseño del flow, reforzado con un check en `flowSchema.ts` que rechace ciertas categorías de `catalog_items` para esos dos giros específicamente.

---

## Bloque 3 — Contradicciones de documentación a resolver contigo, no en código

1. ~~**Estado real de Meta Business Verification.**~~ **RESUELTO 2026-08-20:** el owner confirmó directamente que la verificación ya está en curso. Sub-pasos individuales (App creada, System User con token permanente, número dado de alta, primer template enviado) siguen sin confirmar uno por uno — ver `SEGURITECH_ROADMAP_OPERATIVO.md`, Camino A.
2. **`docs/deployment/RUNBOOK_PRODUCCION.md`** referenciado en 3 documentos distintos, **confirmado que no existe** en el repo (`Glob` real, 2026-08-20). O se crea, o se corrigen las referencias.

---

## Bloque 4 — Infraestructura de producción (sin cambios desde el último corte)

Migraciones 016/017 sin confirmar en Cloud, VPS Hetzner sin provisionar, Sentry/UptimeRobot/Backblaze sin código, `scripts/smoke-test.sh` roto. Mismo estado documentado en `SEGURITECH_ESTADO_ACTUAL.md` — no repetido en detalle aquí para no duplicar.

## Bloque 5 — Sin herramienta para cargar catálogo real (bloquea el arranque de papelería)

**Verificado en código (2026-08-20):** `PosRouter.ts` solo expone endpoints de lectura (`GET /products`, `/products/lookup`, `/products/:id`, `/categories`, `/config`) — confirmado con grep directo sobre el archivo, cero `router.post/put/patch/delete`. Tampoco hay pantalla en el frontend para gestionar catálogo — solo una pantalla de config del POS (44 líneas).

**Por qué es un bloqueador real:** el plan de negocio depende de que tú puedas cargar el inventario real de la papelería (150-500 SKUs según el propio molde de POS). Hoy eso solo lo puede hacer un desarrollador corriendo un script a mano. Detalle completo del diseño en `PLAN_V1_BOT_FLOWS_SIN_IA.md` §2.0-bis — este bloque queda anotado aquí porque es, en la práctica, el ticket de mayor prioridad de todo este documento.

---

## Orden sugerido de ejecución

1. Bloque 0 (push) — verificar si ya está hecho (ver nota arriba) antes de repetirlo.
2. Bloque 1 (mergear seguridad) — esta semana, sin excusa.
3. Bloque 2.1 + 2.2 (ventana 24h + opt-out) — antes de que termine la verificación Meta, en paralelo al Documento 2.
4. Bloque 3 — punto 1 ya resuelto; punto 2 (runbook) no requiere código, solo decidir.
5. Bloque 2.3 + 2.4 y Bloque 4 — según se acerque la fecha real de tráfico con clientes.
