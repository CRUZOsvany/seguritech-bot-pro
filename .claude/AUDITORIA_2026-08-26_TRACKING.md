# Auditoría 2026-08-26 — Documento de seguimiento

> **Qué es esto.** Registro vivo de la auditoría completa recibida el 2026-08-26 (commit auditado `7014757`), con estado de avance por hallazgo. El texto completo de la auditoría original está en la sección 2, sin editar. Esta sección 0 y la tabla de la sección 1 son las que se actualizan en cada sesión de trabajo.
>
> **Regla:** igual que el resto de `.claude/*.md` — si esto contradice al código de `main`, el código gana. Verificar antes de asumir "pendiente" sigue vigente.
>
> **Fuente:** conversación con Claude Code, 2026-08-26. Auditoría solicitada por Cris, trabajada paso a paso con justificación de cada fix.

---

## 0. Correcciones a la auditoría misma (verificado contra el código HOY, no contra el commit `7014757`)

La auditoría se cortó en el commit `7014757` (merge de PR #60). `main` ya tiene 7 commits más encima, incluyendo dos PRs que cierran hallazgos que la auditoría reporta como abiertos. Trabajar estos dos como si siguieran pendientes sería tiempo tirado — exactamente el problema que la sección 1 de la propia auditoría (R-01…R-09) advierte sobre los docs desactualizados, aplicado ahora a la auditoría misma.

| Hallazgo | Auditoría dice | Código real dice (2026-08-26) | Evidencia |
|---|---|---|---|
| **B-01** (ranking de búsqueda) | Abierto, P0, `limit=1` + `results[0]` sin scoring | **CERRADO.** `CatalogSearchService.ts` ya tiene `SEARCH_CANDIDATES_LIMIT=8` + `rankResults()` con scoring de 3 niveles (match exacto → cuenta de tokens → cercanía de longitud) | commit `620f166`, PR #61, mergeado 2026-08-25 — **antes** del corte de la auditoría en commits pero el merge quedó fuera del rango revisado |
| **B-03** (menú principal no consulta directorio) | Abierto, P1 | **CERRADO** para el caso puntual (fallback agregado). Transición `service_directory_match` sí existe ahora en el nodo `bienvenida`, antes de `default` | commit `c60df86`, PR #62, mergeado 2026-08-25 |
| **F-01** (archivos con nombre corrupto en `docs/archive/`) | Reportado con salida de `git status` | **No reproducible** en este checkout (Windows) — `git status` limpio de esos archivos ahora | verificado 2026-08-26; probablemente artefacto del entorno donde se corrió la auditoría (Fedora, con otro `core.quotepath`), no un problema persistente en este repo |
| **A-03** (migraciones sin confirmar en Cloud) | Genérico: "verificar" | **Hallazgo concreto y más grave de lo enunciado:** migración `019_bot_users_meta_compliance.sql` **NO aplicada** en Cloud. El código que depende de ella (`BotController.ts:115`, `touchLastInbound`) ya está en `main` y **va a lanzar excepción en cada mensaje entrante real** en cuanto haya tráfico de Meta. Ver detalle abajo, tratado como **A-03-bis, P0 real**, no como tarea de verificación. | Query de solo-lectura contra Supabase Cloud real, 2026-08-26 (ver sección 1) |

**Lo que esto no cambia:** B-04 (prioridad `catalog_found` vs `service_directory_match`) sigue abierto tal cual la auditoría lo describe — verificado hoy, el nodo `buscar` sigue evaluando `catalog_found` antes que `service_directory_match`. Los fixes de PR #61/#62 no tocaron el orden de transiciones.

### A-03-bis · Migración 019 sin aplicar en Cloud — **P0 confirmado, no solo "por verificar"**

**Verificado 2026-08-26** (lectura vía REST con `service_role` key de `backend/.env`, sin exponerla):
```
GET .../bot_users?select=last_inbound_at   → 400 "column bot_users.last_inbound_at does not exist"
GET .../bot_users?select=opted_out_at      → 400 "column bot_users.opted_out_at does not exist"
```
Mientras tanto, `018_tenant_knowledge_base.sql` (tabla real `tenant_knowledge_chunks`, no `tenant_knowledge_base` como dice la query de ejemplo de la auditoría — nombre corregido) **sí está aplicada** (`200`).

**Impacto:** `BotController.ts:115` hace `await this.userRepository.touchLastInbound(...)` para TODO mensaje entrante, sin try/catch alrededor de esa línea específica, y `SupabaseUserRepository.touchLastInbound()` relanza el error de Postgres como excepción. En cuanto A-01 (Meta) termine y llegue el primer mensaje real, este código corre contra columnas que no existen en Cloud.

**Solución:** pegar `backend/supabase/migrations/019_bot_users_meta_compliance.sql` completo en el SQL Editor de Supabase Dashboard (2 min, acción manual del owner — no hay CLI enlazado, mismo patrón que la migración 020 ya documentado en `CONTRATOS_API_ADMIN.md`).

**Estado:** ⏳ pendiente de que Cris lo aplique. Claude verificará después con la misma query de solo-lectura.

---

## 1. Tabla de progreso por hallazgo

`✅ resuelto` · `🔵 verificado, ya estaba resuelto antes de esta sesión` · `⏳ pendiente de acción manual (fuera del alcance de este entorno)` · `❓ esperando decisión` · `⬜ no iniciado`

### Grupo A — Bloqueadores comerciales
| ID | Título | Estado | Nota |
|---|---|---|---|
| A-01 | Meta Business Verification | ⬜ | Externo, calendario, no técnico |
| A-02 | VPS Hetzner sin provisionar | ⬜ | |
| A-03 | Migraciones 012-020 en Cloud | 🔵 parcial | 001-018, 020 confirmadas aplicadas hoy. **019 NO aplicada — ver A-03-bis, ⏳ pendiente de que Cris la pegue en SQL Editor** |
| A-04 | Inventario real sin cargar | ⬜ | Bloqueado por DEC-10 |
| A-05 | Sin observabilidad | ⬜ | Bloqueado por DEC-14 |
| A-06 | Sin backups automáticos | ⬜ | |

### Grupo B — Bugs de producto
| ID | Título | Estado | Nota |
|---|---|---|---|
| B-01 | Ranking de búsqueda | 🔵 | Ya resuelto en PR #61 (620f166), antes de esta sesión |
| B-02 | Sin desambiguación multi-match | ⬜ | Depende de B-01 (ya listo) |
| B-03 | `service_directory_match` en `bienvenida` | ✅ | Fallback resuelto en PR #62 (c60df86, antes de esta sesión). DEC-04 (menú dinámico) también resuelto — ver esa fila. Los dos frentes de B-03 quedaron cerrados. |
| B-04 | Prioridad catálogo vs servicios | ✅ ejecutado esta sesión — DEC-03 = condicional por categoría. `pos_products.unit_type='service'` (ya soportado por el CHECK de la migración 011, sin schema nuevo) cede el paso a `service_directory_match` SI el directorio tiene respuesta real; si no, el producto igual gana. 3 tests nuevos, `FlowInterpreter.serviceVsCatalogPriority.test.ts`. Confirmado con datos reales: `papeleria_demo_inventario_completo.csv` ya tiene `SRV-0005,Engargolado Tamaño Carta,...,service` |
| B-05 | Sinónimos por giro | 🔵 | Confirmado cerrado, ya lo decía la auditoría |

### Grupo C — Deuda del motor
| ID | Título | Estado |
|---|---|---|
| C-01 | Motor no calcula (aritmética/carrito) | ❓ esperando DEC-01, DEC-02 |
| C-02 | Sin branching por contexto | ❓ |
| C-03 | Orden de transiciones invisible | ✅ resuelto — ver DEC-06, scoring automático implementado |
| C-04 | `wait_input` sin validar | ⬜ |
| C-05 | Sin extracción de cantidades | ⬜ |
| C-06 | Sin expiración de sesión | ✅ ejecutado — DEC-07 con 3 correcciones del owner sobre la propuesta original: TTL 2h (no 6h), aviso condicional (solo a media captura, no en `start_node`/`end`), cierre real del negocio como frontera adicional vía `BusinessHoursService.hadClosureBetween()` (nuevo, sampling cada 15 min), gate después del handoff humano, limpia contexto de verdad. 7 tests en `BotController.sessionTtl.test.ts` + 5 en `BusinessHoursService.test.ts`. Nota: depende de `bot_users.last_inbound_at` (migración 019) — con `lastInboundAt=null` (migración sin aplicar) el gate se salta con seguridad, no truena, ver A-03-bis |
| C-07 | Sin leído/"escribiendo" | ⬜ bloqueado por A-01 |
| C-08 | Escape words hardcodeadas | ⬜ |
| C-09 | Todo termina en humano | ✅ **DEC-01 = A, sigue escalando siempre.** Confirmado como decisión de producto, no como bug — sin código a ejecutar. |
| C-10 | `IntentRouterPort` huérfano | 🔵 informativo, sin acción |

### Grupo D — Deuda técnica backend
| ID | Título | Estado |
|---|---|---|
| D-01 | Caché de TenantConfig no se invalida | ✅ ejecutado esta sesión — alcance real era más chico de lo que sugería la auditoría: solo `bot_configuration` (PATCH /tenants/:id) y `tenant_service_directory` están cacheados en TenantConfig; `pos_products`/catálogo NUNCA pasaban por esta caché (se consultan en vivo), así que no necesitaban invalidación. `AssignMoldeUseCase` ya invalidaba (sin cambios ahí). 5 tests nuevos, `adminCacheInvalidation.test.ts` |
| D-02 | POS sin endpoints de escritura | ✅ **DEC-09 = No.** Diferido explícitamente a Fase 2, ver §4 Ola 4 de la auditoría original — no se toca hasta después del primer cliente pagando solo con el bot. |
| D-03 | `/simulate persist:true` sin audit log | ⬜ |
| D-04 | Rate limit global estrangula webhook | ✅ ejecutado esta sesión — `skip` agregado al limitador global para excluir `/webhook`, que ahora solo lo gobierna el limitador dedicado (1000/min). 2 tests nuevos, `webhookRateLimitExclusion.test.ts` |
| D-05 | Cobertura audit log 27/29 | = D-03, ver ahí |
| D-06 | `tenant_knowledge_chunks` tabla sin uso | ✅ ejecutado esta sesión — nota agregada al header de `018_tenant_knowledge_base.sql` explicando que está reservada, no huérfana por accidente |
| D-07 | `baseUrl` deprecado | 🔵 ya estaba resuelto — `tsconfig.json` ya tenía `"ignoreDeprecations": "5.0"`; `tsc --noEmit` corre limpio, sin TS5101. Hallazgo de la auditoría no reproducible hoy |
| D-08 | Timezone hardcodeado | ⬜ sin acción (a propósito) |

### Grupo E — Frontend
| ID | Título | Estado |
|---|---|---|
| E-01 | Cero tests frontend | ⬜ esperando DEC-11 |
| E-02 | POS PWA no existe | = D-02, resuelta vía DEC-09 (diferido a Fase 2) |
| E-03 | Sin CRUD de catálogo producto a producto | ⬜ |

### Grupo F — Higiene
| ID | Título | Estado |
|---|---|---|
| F-01 | Archivos nombre corrupto en `docs/archive/` | 🔵 no reproducible en este entorno |
| F-02 | `supabase/` raíz sin gitignore | ✅ ejecutado esta sesión — `.gitignore` actualizado, `git rm --cached` de los 2 archivos (estaban tracked, no solo sin ignorar) |
| F-03 | Borrar `docs/archive/` completo | ✅ ejecutado esta sesión — 22 archivos borrados (`git rm -r`), historial completo sigue en `git log`. `docs/INDEX.md` actualizado (ya no enlaza a `archive/`) |
| F-04 | Limpiar ramas locales mergeadas | ✅ ejecutado esta sesión — 14 ramas confirmadas mergeadas (`git merge-base --is-ancestor`) borradas con `git branch -d` (rechaza cualquiera no mergeada, red de seguridad extra) |

### Decisiones (Sección 3 de la auditoría original)
| # | Decisión | Estado |
|---|---|---|
| DEC-01 | ¿Bot cotiza y cierra? | ✅ **A: sigue escalando siempre.** Status quo, sin código nuevo requerido. C-09 queda resuelta como decisión (no como bug) — el flow actual ya hace esto. C-01 (motor de cálculo) pierde su urgencia de "requisito para cerrar" pero puede seguir teniendo valor para mejorar la calidad de la alerta al dueño; queda como mejora futura, no bloqueante. |
| DEC-02 | ¿Carrito multi-producto en V1? | ✅ **Sí** — pendiente de implementar (Ola 2, C-01). Con DEC-01=A el valor es juntar varios artículos en UNA alerta estructurada al dueño, no cerrar la venta. |
| DEC-03 | Prioridad catálogo vs servicios | ✅ **Condicional por categoría** — implementado, ver B-04 |
| DEC-04 | `menu_servicios` estático/dinámico | ✅ **Dinámico — ejecutado.** Nueva fuente `service_directory` en `ItemsSource`/`DynamicSectionResolver`/`flowSchema.ts` (Zod). `menu_servicios` en `papeleria-flow.json` ahora es `{type:'dynamic', items_source:'service_directory'}`. Reusa las variables ya existentes `matched_service_name/response/price` de `VariableResolver` (cambié `save_to_context` de `servicio_seleccionado` a `matched_service_id`, mismo patrón que `service_directory_match`) — no hizo falta código nuevo en VariableResolver. 7 tests nuevos, `DynamicSectionResolver.test.ts` (antes sin ningún test, gap encontrado al implementar esto). Espejo de `ItemsSource` en `frontend/.../flow-types.ts` actualizado también. |
| DEC-05 | Desempate de ranking | 🔵 **ya resuelto en código de forma distinta a la propuesta** — ver nota abajo |
| DEC-06 | Prioridad de transiciones | ✅ **Scoring automático — ejecutado.** `evaluateTransitions()` ya no es first-match-wins: evalúa todas las transiciones del nodo, filtra las que matchean y gana la de mayor especificidad (`button` 100 > `list_item` 90 > `call_permission_*` 85 > `catalog_found` 80 > `service_directory_match` 70 > `list_item_any` 60 > `keyword` 50 > `catalog_not_found` 20 > `default` 0), con el orden del array solo como desempate entre transiciones del MISMO nivel. Ranking derivado de comportamiento YA testeado (no inventado): `catalog_found` va sobre `service_directory_match` porque el test de B-04 lo exige. Log de `debug` cuando hay ambigüedad real (>1 transición matchea) para que se pueda depurar. Zero cambio necesario en el Designer — es automático, no hay campo `priority` que mostrar. 5 tests nuevos, `FlowInterpreter.transitionSpecificity.test.ts`, incluyendo el caso literal del bug (keyword antes que button en el array, button igual gana). Los 330 tests preexistentes (incluidos los de B-04) siguieron en verde sin tocarlos — confirma que el ranking no rompió ningún comportamiento ya decidido. |
| DEC-07 | TTL de sesión | ✅ **ejecutado**, ver C-06 — con 3 correcciones del owner sobre la propuesta original (TTL 2h no 6h, aviso condicional, cierre de negocio como frontera) |
| DEC-08 | Delay artificial entre mensajes | ✅ **Sí, 600-1200ms** — decidido, pendiente de implementar. Bloqueado por A-01 para probarse contra número real. |
| DEC-09 | ¿POS en V1 comercial? | ✅ **No — bot primero, POS fase 2.** Sin código a ejecutar ahora; D-02/E-02 quedan diferidos explícitamente. |
| DEC-10 | SKUs mínimos para lanzar | ✅ **150** — decisión de negocio, sin código (bloquea A-04, carga real con el cliente) |
| DEC-11 | Alcance de tests frontend | ✅ **ValidationPanel + serialización + hooks de TanStack Query** — decidida, sin implementar (E-01) |
| DEC-12 | ¿Rubros médico/farmacia en V1? | ✅ **Ofrecerlos con guardrail ahora** — pendiente de implementar: rechazar en `flowSchema.ts` categorías de `catalog_items` que permitan cotizar/vender medicamento con receta o lenguaje de diagnóstico para esos 2 giros. No hecho todavía. |
| DEC-13 | `tenant_knowledge_chunks`: construir o documentar | 🔵 **resuelta de facto: documentada** (D-06 ejecutado) |
| DEC-14 | Observabilidad mínima | ✅ **UptimeRobot + Sentry juntos** — decidido, pendiente de implementar (infraestructura externa, no código de este repo salvo el SDK de Sentry) |

**Nota DEC-05:** el fix real de B-01 (PR #61) NO usó el desempate propuesto por la auditoría (precio ascendente). Usó: 1) match exacto de frase → 2) cuenta de tokens del término presentes en el nombre → 3) cercanía de longitud entre término y nombre normalizado. No hay desempate por precio en absoluto. Si quieres que el desempate final sea por precio ascendente cuando el scoring quede empatado en los 3 niveles, es un cambio pequeño adicional — avisa si lo quieres.

---

## 2. Texto completo de la auditoría original (sin editar)

> Ver el mensaje del usuario fechado 2026-08-26 en la conversación de origen para el texto íntegro (Grupos A-F, tabla de decisiones, secuencia por olas). No se duplica aquí para evitar que este documento y la fuente original diverjan — este archivo es el tracker, la auditoría original es inmutable una vez entregada.

---

## 3. Bitácora

| Fecha | Cambio |
|---|---|
| 2026-08-26 | Documento creado. Verificadas B-01/B-03 (ya resueltas por PR #61/#62, fuera del rango de commits que la auditoría revisó), F-01 (no reproducible en este entorno), D-07 (ya resuelto, no reproducible), A-03 (migración 019 confirmada NO aplicada en Cloud, con impacto identificado en `BotController.ts:115` — degradado a A-03-bis, P0 real, **sigue pendiente que Cris la aplique en el SQL Editor**). Ejecutados sin necesidad de decisión de negocio, commit `2f0670a` (rama `chore/auditoria-2026-08-26-ola-0`): D-06 (documentar tabla huérfana), F-02 (gitignore + destrackear `supabase/.branches` y `.temp`), F-04 (14 ramas locales mergeadas borradas). Commit `46433f2`: D-04 (rate limit del webhook) y D-01 (invalidación de caché de TenantConfig). Cris decidió DEC-01=A (bot sigue escalando siempre, resuelve C-09 como decisión no como bug), DEC-09=No (POS diferido a Fase 2, resuelve D-02/E-02), DEC-03=condicional por categoría, F-03=borrar `docs/archive/`. Ejecutados en este mismo turno: F-03 (22 archivos borrados, `docs/INDEX.md` actualizado) y B-04/DEC-03 (prioridad `unit_type='service'` sobre catálogo en `FlowInterpreter.ts`, sin migración nueva porque el schema ya soportaba `unit_type='service'` desde la migración 011; confirmado contra datos reales del CSV demo — `SRV-0005 Engargolado`). Suite completa: 42 suites, 306/306, typecheck limpio. PR #70 abierto con todo lo anterior. |
| 2026-08-26 (cont.) | Resto de decisiones recogidas: DEC-02=Sí (carrito), DEC-04=dinámico, DEC-06=scoring automático, DEC-08=sí 600-1200ms, DEC-10=150 SKUs, DEC-12=médico/farmacia con guardrail, DEC-14=UptimeRobot+Sentry. **DEC-07 implementada** con 3 correcciones reales del owner sobre la propuesta original de la auditoría (TTL 2h no 6h, aviso condicional solo a media captura, cierre real del negocio como frontera adicional vía `BusinessHoursService.hadClosureBetween()` nuevo, gate después del handoff humano, limpieza de contexto de verdad) — ver C-06. 12 tests nuevos (`BotController.sessionTtl.test.ts` + `BusinessHoursService.test.ts`). Suite completa: 43 suites, 318/318, typecheck limpio, eslint sin errores nuevos. |
| 2026-08-26 (cont. 2) | DEC-11 recogida (ValidationPanel + serialización + hooks TanStack Query). **DEC-04 implementada**: nueva fuente `service_directory` en `ItemsSource`, reusa `matched_service_name/response/price` ya existentes en `VariableResolver` (cambio de `save_to_context` de `servicio_seleccionado` a `matched_service_id`) — sin código nuevo en el resolver de variables. `menu_servicios` en `papeleria-flow.json` es dinámico. 7 tests nuevos en `DynamicSectionResolver.test.ts` (antes sin ningún test — gap encontrado al hacer esto, cubre también `catalog_items` como regresión). Espejo de tipos en `frontend/src/apps/panel/designer/flow-types.ts` actualizado. Suite: 44 suites, 325/325, typecheck backend+frontend limpio. **Hallazgo nuevo, no arreglado (fuera de alcance de DEC-04):** ese mismo archivo del frontend tiene más drift preexistente contra `backend/src/domain/entities/flow.ts` — le faltan los `TransitionCondition` de `service_directory_match`/`catalog_found`/`catalog_not_found` enteros (no solo `ItemsSource`). No bloquea nada hoy porque el Designer no tiene UI que dependa de esos tipos todavía, pero conviene cerrarlo antes de que alguien construya esa UI sobre un espejo incompleto. Quedan sin implementar: DEC-02 (carrito), DEC-08 (delay), DEC-12 (guardrail médico/farmacia), DEC-14 (Sentry/UptimeRobot), E-01 (tests frontend). |
| 2026-08-26 (cont. 3) | **DEC-06 implementada**: `evaluateTransitions()` pasa de first-match-wins puro a scoring por especificidad (`button` 100 > `list_item` 90 > `call_permission_*` 85 > `catalog_found` 80 > `service_directory_match` 70 > `list_item_any` 60 > `keyword` 50 > `catalog_not_found` 20 > `default` 0), con el array como desempate solo entre transiciones del mismo nivel. Ranking verificado, no inventado: derivado para preservar el resultado ya testeado de B-04 (catalog_found gana sobre service_directory_match cuando el producto no es servicio). 5 tests nuevos (`FlowInterpreter.transitionSpecificity.test.ts`), incluyendo el caso literal del bug (keyword antes que button en el array). Los 330 tests preexistentes (incluidos B-01/B-04) siguieron en verde sin tocarlos. Suite: 45 suites, 330/330, typecheck y eslint limpios. Quedan sin implementar: DEC-02 (carrito), DEC-08 (delay), DEC-12 (guardrail médico/farmacia), DEC-14 (Sentry/UptimeRobot), E-01 (tests frontend). |
