# SegurITech Bot Pro — ESTADO

> **Qué es este documento.** La verdad de hoy sobre el proyecto, verificada contra el código, no heredada de documentos anteriores. Es el ÚNICO documento del repo que lleva fechas de progreso y bitácora.
>
> **Jerarquía:** `MAESTRO` dice qué es y por qué · **este** dice cómo está hoy · `ROADMAP` dice qué sigue.
> **Regla de oro:** si este documento contradice al código de `main`, gana el código. Si contradice al MAESTRO en materia de ESTADO, gana este.
> **Regla de escritura:** nada se marca como hecho sin evidencia. Lo no verificable desde el entorno de trabajo se marca `[sin verificar]` con la razón, no se asume.
>
> **Corte:** 2026-09-09 · **Versión:** 2.1 (consolidación + integración)

---

## 1. Resumen en cinco líneas

El backend es sólido y está probado: hexagonal, **364 tests en verde en `main`** y 456 con todo lo pendiente integrado, type-check y lint limpios. El frontend existe y va más lejos de lo que decía la documentación: el Bot Designer con React Flow ya está construido. La base de datos está completa (001–020) y aplicada. **Lo que falta para cobrarle a alguien no es código: es Meta, infraestructura pública y catálogo real.** El proyecto lleva meses generando código más rápido de lo que actualiza sus documentos — este corte cierra esa brecha, y destapa una peor: código mergeado que nunca llegó a `main` (§7).

---

## 2. Verificación de esta sesión (2026-09-09)

Todo lo de esta tabla se corrió realmente en la máquina de desarrollo, no se copió de un corte anterior.

| Check | Comando | Resultado |
|---|---|---|
| Runtime | `node -v` / `npm -v` | Node **24.19.0**, npm 11.17.0 |
| Type-check backend | `npm run type-check --workspace backend` | **Limpio** (exit 0) |
| Type-check frontend | `npm run type-check --workspace frontend` | **Limpio** (exit 0) |
| Tests backend en `main` | `npm test --workspace backend` | **51 suites · 364/364 · 0 skipped** |
| Tests backend con todo lo pendiente integrado | ídem, sobre el merge real de los PRs #80, #78 y #79 | **58 suites · 456/456** |
| Lint backend | `npm run lint --workspace backend` | **0 errores**, 100 warnings (no-console en tests, preexistentes) |
| Lint frontend | `npm run lint --workspace frontend` | **0 errores**, 39 warnings (react-refresh en shadcn/ui, preexistentes) |
| Tests frontend | — | **No existen.** `frontend/package.json` no tiene script `test` ni runner instalado. Ver deuda E-01 |
| `.env` fuera de git | `git ls-files .env backend/.env` | **Correcto**, ninguno trackeado |

> **Corrección respecto al corte del 2026-09-08.** Ese corte anotó 344 tests y Node 22.23.2. Los dos números ya no eran ciertos al escribirse: el 344 era del commit `290bc2d`, y `main` ya llevaba los PRs #73 y #74 encima. El número de tests de este proyecto se mueve rápido — la lección no es corregirlo otra vez, es no copiarlo nunca de un corte anterior.

### 2.1. La fila que importa: por qué hay dos números

Las dos filas de tests no se contradicen, miden estados distintos. **`main` no tiene todo el trabajo que este proyecto cree tener mergeado.** Ver §7: tres PRs marcados como MERGED en GitHub nunca llegaron a `main`.

Y la integración de los tres pendientes **no salía verde sola**. Salía roja, con un fallo que ninguna rama por separado podía ver:

```
TS2554: Expected 6 arguments, but got 5.
```

El PR #75 le añadió un sexto parámetro al constructor de `FlowInterpreter` (`CarouselCardResolver`) y actualizó todos los call sites que veía. No veía dos, porque los trajo el PR #73 y el #75 se ramificó de una base que no lo tenía. Git mergea sin un solo conflicto —son archivos distintos— y TypeScript revienta. Arreglado en `8b63c64`, dentro del PR #80.

---

## 3. Backend

Arquitectura hexagonal intacta: `domain/` no importa de `infrastructure/`.

- **`AdminRouter` modularizado** en sub-routers por dominio: `flowsRouter`, `metaRouter`, `posCatalogRouter`, `serviceDirectoryRouter`, `servicesRouter`, `tenantsRouter`, `whatsappFlowsRouter`, más `AuthRouter` y `PosRouter`. **53 rutas** en total (23 GET, 18 POST, 5 DELETE, 4 PATCH, 3 PUT).
- **`HandleMessageUseCase` eliminado** y en `main` (ADR-012 cumplido). Sin flow → "bot en mantenimiento", nunca fallback a FSM. Solo quedan dos comentarios históricos que lo nombran, en `domain/entities/index.ts` y en `tests/integration/multiTenantFlow.test.ts`.
- **API de flows** draft / publish / rollback sobre `bot_flow_versions`, con simulación de draft y auditoría.
- **`FlowInterpreter`** con scoring de transiciones por especificidad (DEC-06), no first-match-wins.
- Servicios de dominio vivos: `CatalogSearchService` (con ranking), `ServiceDirectoryMatcher`, `BusinessHoursService`, `DynamicSectionResolver`, `VariableResolver`, `serviceFsm`, `restrictedGiroCatalogGuardrail`.

### 3.1. Motor de flows — el número correcto es 14

`FlowNode` en `backend/src/domain/entities/flow.ts` define **14 tipos de nodo**, no 7 ni 13 como afirmaban documentos anteriores:

`send_text` · `send_buttons` · `send_list` · `send_media` · `send_cta_url` · `send_location_request` · `send_media_carousel` · `send_reaction` · `wait_input` · `search_catalog` · `escape_to_human` · `request_call_permission` · `end` · `send_whatsapp_flow`

Y **10 condiciones de transición** en `main`: `button` · `list_item` · `list_item_any` · `keyword` · `service_directory_match` · `catalog_found` · `catalog_not_found` · `call_permission_granted` · `call_permission_denied` · `default`. El PR #80 suma la **undécima**, `card_any`, que es como se rutea un carrusel dinámico: sus ids salen del catálogo en runtime, así que una transición `button` ahí sería inalcanzable por construcción.

**El dato que importa para el negocio:** entre los tres flows del repo (`cerrajeria`, `papeleria`, `securitech`) se usan **7 de los 14** tipos; el flow más maduro, cerrajería, usa 6. Los 7 restantes —`send_media`, `send_cta_url`, `send_location_request`, `send_media_carousel`, `send_reaction`, `request_call_permission`, `send_whatsapp_flow`— no aparecen en ningún flow del repo. Ahí hay valor disponible sin escribir una línea de motor nuevo — solo diseñar mejor el JSON.

---

## 4. Frontend

Workspace `frontend/` con **Vite 8 + React 19.2 + TypeScript + TanStack Router/Query + Zustand 5 + shadcn/ui + Tailwind 4**. Build estático servido por el mismo Express desde `backend/public/app/`.

- **Bot Designer construido** (`apps/panel/designer/`): paleta de nodos, menú contextual, editor de transiciones, panel de versiones, store Zustand, `graphValidator`, y mapping bidireccional `to-bot-flow` / `to-react-flow`. React Flow (`@xyflow/react` 12.11) instalado y en uso.
- **Rutas del panel:** dashboard, escalaciones, login, cambio de contraseña, `tenants/new`, y por tenant: detalle, designer, guion, mensajes, POS, directorio de servicios, WhatsApp.
- **Simulador de WhatsApp embebido** (`shared/simulator/WhatsAppSimulator.tsx`).
- **POS en frontend: solo pantalla de configuración.** El PWA del cajero no existe — `dexie` ni siquiera está instalado. Diferido a Fase 2 por decisión (DEC-09).

> **Corrección importante.** Documentos anteriores y la descripción del proyecto describían el frontend como "por reintroducir" y el CI como "roto por referencias a una carpeta `frontend/` inexistente". Ambas afirmaciones llevaban meses siendo falsas. El CI corre type-check y build de los dos workspaces y es gate real.

---

## 5. Base de datos

**20 migraciones** en `main` (`001` … `020_tenant_service_directory.sql`) + 2 seeds (`seed_admin_user`, `seed_pos_papeleria_pilot`). El PR #80 trae la **021** (`021_carousel_fallback_image.sql`, columna `imagen_fallback_url`): **no está aplicada en Cloud y no está en `main`** — al mergear cae de lleno en la regla 8, se aplica y se verifica el mismo día.

Estado de aplicación en Supabase Cloud: **001–020 aplicadas.** Última confirmación real: la 020 se aplicó a mano el 2026-08-25 y la 019 el 2026-09-01, ambas verificadas por lectura REST en su momento.

> `[sin verificar en esta sesión]` — el egress del entorno de trabajo bloquea `supabase.co` (`403 blocked-by-allowlist`), así que no se pudo reconfirmar hoy. No es un problema de Supabase ni de credenciales. Antes de dar por buena esta línea después de aplicar cualquier migración nueva, reconfirmar con una lectura REST desde un entorno con salida a internet.

- `tenant_services` es la **fuente única de verdad** de qué tiene contratado cada tenant. `active` = operativo.
- POS: **12 tablas `pos_*`**. Idempotencia offline-first por `unique(tenant_id, client_id)` en `pos_sales`.
- Aplicar migraciones sigue siendo **manual vía SQL Editor**: el CLI de Supabase existe en la máquina pero el proyecto no está enlazado (`supabase link` pendiente), y no hay `psql` instalado. Mientras siga así, cada migración mergeada corre el riesgo de quedar sin aplicar — ya pasó dos veces (020 y 019).

### 5.1. Dos catálogos paralelos (deuda documentada, no bug activo)

`catalog_items` (legacy, migración 001, alimenta `TenantConfig.catalog`) y `pos_products` (real, 110+ SKUs, lo consulta `CatalogSearchService`) coexisten sin sincronizar. `VariableResolver` ya tiene fallback a `pos_products`; `{{catalog_listing}}` y `DynamicSectionResolver` con `items_source: 'catalog_items'` **no lo tienen** y mostrarían "aún no hay productos" con inventario real cargado. Hoy no truena porque `papeleria-flow.json` no usa ninguno de los dos. Advertencia ya escrita como comentario en `SupabaseTenantConfigService.ts`.

---

## 6. Infraestructura y operación

**La realidad divergió del plan y el plan no se había actualizado.**

| Pieza | Estado real |
|---|---|
| Servidor donde corre hoy | **Servidor Ubuntu de la LAN**, en Docker (`adminangel@192.168.1.250`). No es el VPS Hetzner del plan |
| `docker-compose.yml` | Arreglado el 2026-09-06: `env_file: ./backend/.env`. Antes ignoraba ese archivo y omitía `ADMIN_JWT_SECRET`, que `validateConfig()` exige en prod → crash-loop |
| VPS Hetzner CX22 | **Sin provisionar.** Sigue siendo el destino de producción con dominio público |
| Dominio + DNS + Cloudflare Access | Sin configurar |
| Verificación de negocio Meta | En curso desde 2026-08-20 (confirmado por el owner). Los sub-pasos —App, System User con token permanente, alta del número, primer template aprobado— **no están confirmados uno por uno** |
| Observabilidad (Sentry, UptimeRobot) | Decidida (DEC-14), sin implementar |
| Backups (`pg_dump` → Backblaze) | Sin implementar. Supabase Free no trae backups automáticos |
| Túnel público para webhook (`cloudflared`) | Sin levantar. Sin esto no se prueba WhatsApp end-to-end mientras Meta verifica |

---

## 7. Git — el hallazgo del 2026-09-09

`main` está protegida (PR obligatorio, status check, force push bloqueado) y los conventional commits están en uso. Eso no impidió lo siguiente.

### 7.1. Cinco PRs con la base equivocada

Los PRs **#75, #76, #77, #78 y #79 se abrieron contra `fix/compose-env-file` en vez de contra `main`.** Esa rama ya se había mergeado a `main` en el #74 el 2026-09-06, así que en lugar de morir quedó viva como rama de integración fantasma: cada PR se revisaba y se mergeaba contra un `main` que ya no era el `main`.

Consecuencia: **tres PRs figuran como MERGED en GitHub y su trabajo no está en `main`.**

| PR | Qué quedó atorado |
|---|---|
| #75 | Carrusel con bucle cerrado y cards dinámicas · migración `021_carousel_fallback_image.sql` · `CarouselCardResolver` |
| #76 | `AUDITORIA_DUPLICACION_PANEL.md` |
| #77 | Siembra del editor del Designer con lo publicado cuando no hay draft |

Son ~2 200 líneas. Y el daño no fue solo el retraso: produjo el fallo de compilación de §2.1, que es el modo de fallo peor posible — **verde en las dos ramas por separado, sin conflicto de git, rojo solo en la unión**.

**Por qué no lo cachó el CI.** El CI es un gate real y corre sobre el merge del PR. Pero un PR contra la base equivocada hace que el CI valide exactamente el merge equivocado, con toda la ceremonia intacta. El gate estaba verde y midiendo lo que no era.

### 7.2. Cómo se está devolviendo

| Acción | Estado |
|---|---|
| PR **#80** `fix/compose-env-file` → `main`: devuelve #75/#76/#77 + el arreglo de `FlowInterpreter` | Abierto, verificado 56 suites · 417/417 |
| PR **#78** (catálogo de reglas) reapuntado a `main` | Abierto, `MERGEABLE` |
| PR **#79** (bloques compuestos, F1-a) reapuntado a `main` | Abierto, `MERGEABLE` |
| Los tres integrados a la vez | Verificado: **58 suites · 456/456**, type-check y lint limpios |

**Orden de merge:** #80 primero (trae el motor y el arreglo), luego #78 (el catálogo de reglas que cita el código de bloques), luego #79.

### 7.3. La regla que faltaba

Ninguna de las 16 reglas del MAESTRO decía **contra qué rama se abre un PR**, porque parecía demasiado obvio para escribirse. Este episodio dice que no lo es. Propuesta de regla 17: *todo PR se abre contra `main`; si de verdad hace falta apilar sobre otra rama, se anota el porqué en la descripción y se reapunta a `main` en cuanto la base se mergee.*

### 7.4. Ramas sin podar

Sigue pendiente y sigue creciendo: **7 locales** y **21 remotas** ya mergeadas a `main`, más `feature/sprint-6-new-tenant` (abandonada por decisión, 145 archivos atrasada) y `test/local-validacion`. `docs/runbook-referencias-pendientes` (PR **#55**, abierto desde el 2026-08-21) está 49 commits atrás: rebasar o cerrar y rehacer.

---

## 8. Deuda abierta

Numeración heredada de la auditoría del 2026-08-26. Lo cerrado no se repite aquí; está en `git log` y en `AUDITORIA_2026-08-26_TRACKING.md`.

### Bloquea cobrar al primer cliente

| ID | Qué falta | Tipo |
|---|---|---|
| A-01 | Verificación Meta: cerrar los sub-pasos y confirmarlos uno por uno | Externo |
| A-02 | Destino de producción real: VPS + dominio + Cloudflare Access, o decidir formalmente que la LAN es suficiente para el piloto | Infra |
| A-04 | Inventario real sin cargar (mínimo 150 SKUs, DEC-10) | Operativo |
| E-03 | Sin CRUD de catálogo producto a producto en el panel — hoy solo import CSV | Frontend |

### Antes de meter a un tercero que paga

| ID | Qué falta | Tipo |
|---|---|---|
| A-05 | Observabilidad: Sentry + UptimeRobot (DEC-14 decidida, sin implementar) | Infra |
| A-06 | Backups verificados con restauración probada | Infra |
| DEC-08 | Delay artificial 600–1200 ms entre mensajes (decidido, sin implementar) | Código |
| C-07 | Sin marcar leído / "escribiendo" — bloqueado por A-01 | Código |

### Calidad del motor y del producto

| ID | Qué falta |
|---|---|
| DEC-02 | Carrito multi-producto: juntar varios artículos en UNA alerta estructurada al dueño (decidido, sin implementar) |
| C-01 | Motor sin aritmética. Pierde urgencia con DEC-01=A (el bot siempre escala), pero mejora la calidad de la alerta |
| C-02 | Sin branching por contexto |
| C-04 | `wait_input` no valida lo que captura |
| C-05 | Sin extracción de cantidades |
| C-08 | Escape words hardcodeadas |
| B-02 | Sin desambiguación cuando hay varios matches |
| — | 7 de los 14 tipos de nodo sin usar en ningún flow del repo |
| — | Espejo de tipos incompleto y **creciendo**: `frontend/.../designer/flow-types.ts` sigue sin los `TransitionCondition` de `service_directory_match` / `catalog_found` / `catalog_not_found`. El PR #80 le agregó `card_any` pero no cerró los otros tres, así que el espejo lleva dos rondas de código nuevo quedándose corto. No rompe nada hoy porque no hay UI que dependa de ellos |

### Higiene y proceso

| ID | Qué falta |
|---|---|
| E-01 | **Cero tests en frontend, sin runner instalado.** Alcance decidido (DEC-11): ValidationPanel + serialización + hooks de TanStack Query |
| D-03 | `/simulate` con `persist:true` no registra en audit log (cobertura 27/29) |
| — | 28 ramas mergeadas sin podar (§7.4), y el PR #55 lleva desde el 2026-08-21 abierto y 49 commits atrás |
| — | **Sin regla escrita sobre la rama base de un PR.** Es lo que permitió §7.1: cinco PRs contra una rama ya mergeada, con el CI verde validando el merge equivocado |
| — | Supabase CLI sin enlazar → cada migración mergeada puede quedar sin aplicar |
| — | `backend/.env` con finales de línea CRLF: rompe `source`/`export` desde shells POSIX. Convertir a LF |
| — | `docs/adr/` no existe; los 17 ADRs viven dentro del MAESTRO. Está bien, pero varios documentos lo referencian como carpeta |

---

## 9. Decisiones tomadas que siguen sin implementar

Estas ya se decidieron. No hay que volver a discutirlas, hay que ejecutarlas.

| # | Decisión | Estado |
|---|---|---|
| DEC-02 | Carrito multi-producto en V1: **sí** | Sin implementar |
| DEC-08 | Delay entre mensajes: **sí, 600–1200 ms** | Sin implementar, bloqueado por A-01 para probarse |
| DEC-11 | Tests frontend: **ValidationPanel + serialización + hooks** | Sin implementar |
| DEC-14 | Observabilidad: **UptimeRobot + Sentry, los dos** | Sin implementar |

## 10. Decisiones que siguen abiertas

| Tema | Qué hay que decidir |
|---|---|
| Destino de producción | ¿El piloto sale en el servidor de la LAN o se espera al VPS Hetzner con dominio? Define si A-02 bloquea o no al primer cliente |
| Desempate por precio | El ranking de `CatalogSearchService` no desempata por precio. ¿Se agrega precio ascendente como cuarto nivel? Cambio pequeño |
| Numeración | Sprints (MAESTRO histórico) vs Fases (operación real). Este corte adopta **Fases**; los Sprints quedan como alias histórico |

---

## 11. Bitácora

| Fecha | Cambio |
|---|---|
| 2026-09-09 | **Trabajo mergeado que no estaba en `main`, recuperado.** Los PRs #75, #76, #77, #78 y #79 se habían abierto contra `fix/compose-env-file` en vez de contra `main`; esa rama ya se había mergeado en el #74, así que quedó viva como rama de integración fantasma y los tres primeros figuraban como MERGED con su trabajo fuera de `main` — carrusel con bucle cerrado y cards dinámicas, migración 021, siembra del Designer y la auditoría de duplicación del panel, ~2 200 líneas. Al armar la integración real apareció un fallo que ninguna rama podía ver por separado: el #75 le añadió un sexto parámetro al constructor de `FlowInterpreter` y los dos tests que trajo el #73 dejaron de compilar (`TS2554`), **sin un solo conflicto de git**. Arreglado en `8b63c64` con el patrón que ya usaban los demás tests del interpreter. Abierto el PR #80 para devolver el trabajo, y reapuntados #78 y #79 a `main`. Verificado sobre el merge real de los tres: **58 suites · 456/456**, type-check y lint limpios en ambos workspaces. Reconciliado además `REGLAS_FLOW.md` con las reglas del carrusel (R-F35, R-F36 y `card_any` en la deduplicación de R-F14; de 34 reglas a 36), y commiteada esta consolidación documental, que llevaba un día entero sin commitear en el working tree. |
| 2026-09-08 | **Consolidación documental.** Nueve documentos con cuatro fuentes de verdad contradictorias reducidos a tres vivos (`MAESTRO` / `ESTADO` / `ROADMAP`) más un `CLAUDE.md` de entrada y cuatro documentos de referencia con encabezado de alcance. Verificación completa corrida en la máquina real: 47 suites / 344 tests / type-check y lint limpios en los dos workspaces. Correcciones de fondo: los tipos de nodo son **14** (los docs decían 7 y 13); el frontend y el Designer llevaban meses existiendo pese a describirse como pendientes; el CI no está roto; el servicio corre hoy en un servidor Ubuntu de la LAN en Docker, no en Hetzner. Auditadas 34 ramas: 28 mergeadas sin podar. Corregido en el mismo pase un comentario obsoleto en `domain/entities/flow.ts` que describía las transiciones como first-match-wins (contradecía a ADR-016 y al código real), y la referencia a `client_uuid` en ADR-010 y en el ROADMAP: la columna real es `pos_sales.client_id`. Migraciones **no reverificables** desde este entorno (egress bloquea `supabase.co`) — se conserva la última confirmación real del 2026-09-01 marcada como tal. |
| 2026-09-06 | `docker-compose.yml` arreglado: `env_file: ./backend/.env`. Antes omitía `ADMIN_JWT_SECRET` y el contenedor entraba en crash-loop en prod. Runbook actualizado con el Anexo A del despliegue real en LAN. |
| 2026-09-03 | `npm audit fix` desde la raíz: 4 vulnerabilidades resueltas sin bump mayor, 0 restantes, suite en verde. Revisados y aprobados los 2 postinstall del gate `allowScripts` (`msw`, `unrs-resolver`). Documentado el hallazgo de los dos catálogos paralelos (§5.1). |
| 2026-09-01 | Migración `019_bot_users_meta_compliance.sql` aplicada en Cloud por el owner y verificada por lectura REST. Cerraba un P0 real: `BotController` llamaba a `touchLastInbound()` contra columnas inexistentes y habría reventado con el primer mensaje real de Meta. |
| 2026-08-26 | Auditoría completa trabajada por olas: DEC-01/03/04/06/07/09/12 implementadas, higiene F-02/F-03/F-04. Suite de 292 → 344 tests. Detalle por hallazgo en `AUDITORIA_2026-08-26_TRACKING.md`. |
| 2026-08-25 | Stress test de "Papelería DEMO": 2 bugs de producto cerrados con TDD (ranking de búsqueda, directorio de servicios en el nodo `bienvenida`). Migración 020 aplicada. Nace `CONTRATOS_API_ADMIN.md`. |
| 2026-08-20 | Decisión: **pausar el plan de IA** y exprimir primero el motor determinista + cumplimiento Meta. Auditadas 3 ramas locales; `feature/sprint-6-new-tenant` abandonada por estar 145 archivos atrasada. Runbook de producción escrito. |
| ← anterior | Historial completo en `git log` y en las versiones 1.0–1.5 de este archivo (`git show`). |
