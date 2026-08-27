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
| B-03 | `service_directory_match` en `bienvenida` | 🔵 | Fallback ya resuelto en PR #62 (c60df86). DEC-04 (dinámico vs estático) sigue abierta, es mejora, no bug |
| B-04 | Prioridad catálogo vs servicios | ❓ | Esperando DEC-03 |
| B-05 | Sinónimos por giro | 🔵 | Confirmado cerrado, ya lo decía la auditoría |

### Grupo C — Deuda del motor
| ID | Título | Estado |
|---|---|---|
| C-01 | Motor no calcula (aritmética/carrito) | ❓ esperando DEC-01, DEC-02 |
| C-02 | Sin branching por contexto | ❓ |
| C-03 | Orden de transiciones invisible | ❓ esperando DEC-06 |
| C-04 | `wait_input` sin validar | ⬜ |
| C-05 | Sin extracción de cantidades | ⬜ |
| C-06 | Sin expiración de sesión | ❓ esperando DEC-07 |
| C-07 | Sin leído/"escribiendo" | ⬜ bloqueado por A-01 |
| C-08 | Escape words hardcodeadas | ⬜ |
| C-09 | Todo termina en humano | ❓ **la más importante — esperando DEC-01** |
| C-10 | `IntentRouterPort` huérfano | 🔵 informativo, sin acción |

### Grupo D — Deuda técnica backend
| ID | Título | Estado |
|---|---|---|
| D-01 | Caché de TenantConfig no se invalida | ⬜ siguiente a ejecutar |
| D-02 | POS sin endpoints de escritura | ❓ esperando DEC-09 |
| D-03 | `/simulate persist:true` sin audit log | ⬜ |
| D-04 | Rate limit global estrangula webhook | ⬜ siguiente a ejecutar |
| D-05 | Cobertura audit log 27/29 | = D-03, ver ahí |
| D-06 | `tenant_knowledge_chunks` tabla sin uso | ✅ ejecutado esta sesión — nota agregada al header de `018_tenant_knowledge_base.sql` explicando que está reservada, no huérfana por accidente |
| D-07 | `baseUrl` deprecado | 🔵 ya estaba resuelto — `tsconfig.json` ya tenía `"ignoreDeprecations": "5.0"`; `tsc --noEmit` corre limpio, sin TS5101. Hallazgo de la auditoría no reproducible hoy |
| D-08 | Timezone hardcodeado | ⬜ sin acción (a propósito) |

### Grupo E — Frontend
| ID | Título | Estado |
|---|---|---|
| E-01 | Cero tests frontend | ⬜ esperando DEC-11 |
| E-02 | POS PWA no existe | = D-02, ver DEC-09 |
| E-03 | Sin CRUD de catálogo producto a producto | ⬜ |

### Grupo F — Higiene
| ID | Título | Estado |
|---|---|---|
| F-01 | Archivos nombre corrupto en `docs/archive/` | 🔵 no reproducible en este entorno |
| F-02 | `supabase/` raíz sin gitignore | ✅ ejecutado esta sesión — `.gitignore` actualizado, `git rm --cached` de los 2 archivos (estaban tracked, no solo sin ignorar) |
| F-03 | Borrar `docs/archive/` completo | ❓ esperando confirmación |
| F-04 | Limpiar ramas locales mergeadas | ✅ ejecutado esta sesión — 14 ramas confirmadas mergeadas (`git merge-base --is-ancestor`) borradas con `git branch -d` (rechaza cualquiera no mergeada, red de seguridad extra) |

### Decisiones (Sección 3 de la auditoría original)
| # | Decisión | Estado |
|---|---|---|
| DEC-01 | ¿Bot cotiza y cierra? | ❓ |
| DEC-02 | ¿Carrito multi-producto en V1? | ❓ |
| DEC-03 | Prioridad catálogo vs servicios | ❓ **preguntada esta sesión** |
| DEC-04 | `menu_servicios` estático/dinámico | ❓ |
| DEC-05 | Desempate de ranking | 🔵 **ya resuelto en código de forma distinta a la propuesta** — ver nota abajo |
| DEC-06 | Prioridad de transiciones | ❓ |
| DEC-07 | TTL de sesión | ❓ |
| DEC-08 | Delay artificial entre mensajes | ❓ |
| DEC-09 | ¿POS en V1 comercial? | ❓ |
| DEC-10 | SKUs mínimos para lanzar | ❓ |
| DEC-11 | Alcance de tests frontend | ❓ |
| DEC-12 | ¿Rubros médico/farmacia en V1? | ❓ |
| DEC-13 | `tenant_knowledge_chunks`: construir o documentar | 🔵 **resuelta de facto: documentada** (D-06 ejecutado) |
| DEC-14 | Observabilidad mínima | ❓ |

**Nota DEC-05:** el fix real de B-01 (PR #61) NO usó el desempate propuesto por la auditoría (precio ascendente). Usó: 1) match exacto de frase → 2) cuenta de tokens del término presentes en el nombre → 3) cercanía de longitud entre término y nombre normalizado. No hay desempate por precio en absoluto. Si quieres que el desempate final sea por precio ascendente cuando el scoring quede empatado en los 3 niveles, es un cambio pequeño adicional — avisa si lo quieres.

---

## 2. Texto completo de la auditoría original (sin editar)

> Ver el mensaje del usuario fechado 2026-08-26 en la conversación de origen para el texto íntegro (Grupos A-F, tabla de decisiones, secuencia por olas). No se duplica aquí para evitar que este documento y la fuente original diverjan — este archivo es el tracker, la auditoría original es inmutable una vez entregada.

---

## 3. Bitácora

| Fecha | Cambio |
|---|---|
| 2026-08-26 | Documento creado. Verificadas B-01/B-03 (ya resueltas por PR #61/#62, fuera del rango de commits que la auditoría revisó), F-01 (no reproducible en este entorno), A-03 (migración 019 confirmada NO aplicada en Cloud, con impacto identificado en `BotController.ts:115` — degradado a A-03-bis, P0 real). Ejecutados sin necesidad de decisión de negocio: D-07 (baseUrl), D-06 (documentar tabla huérfana), F-02 (gitignore supabase/), F-04 (limpieza de ramas locales mergeadas). Pendiente de Cris: aplicar migración 019 en Supabase Dashboard, y las decisiones DEC-01/02/03/04/06/07/08/09/10/11/12/14 + confirmar F-03. |
