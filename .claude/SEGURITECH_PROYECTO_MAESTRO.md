# SegurITech Bot Pro — Documento Maestro del Proyecto

> **Fuente única de verdad.** Este documento sustituye y consolida la información dispersa en docs/ (DELIVERY_FINAL, RESUMEN_EJECUTIVO_TESTING, etc.) y refleja el estado y rumbo decididos en mayo 2026.
>
> **Versión:** 2.0 (parcheada 2026-06-05) — Mayo 2026
> **Estado del documento:** Activo. Actualizar al final de cada sprint relevante. **Estado vivo del código en `.claude/SEGURITECH_ESTADO_ACTUAL.md`** (gana sobre este doc en lo que toca a ESTADO).
> **Audiencia:** El equipo interno de SegurITech (Cris + 3–5 personas). También sirve como contexto para sesiones de Claude/Claude Code.

---

## 0. Cómo usar este documento

Si eres **Cris**, este es tu plano del proyecto. Cuando te despiertes el lunes sin saber por dónde empezar, abre este archivo. Cuando dudes de una decisión técnica, busca en la sección 7 (ADRs). Cuando un sprint termine, actualiza la sección 3 y la 12.

Si eres **una sesión de Claude** sin contexto previo, lee secciones 1, 3, 5, 6 y 8 en ese orden y tendrás suficiente para responder cualquier pregunta sobre el proyecto sin alucinar el estado.

Si eres **un nuevo miembro del equipo**, lee de principio a fin. Toma 30 minutos. Es la onboarding más eficiente que vas a tener.

**Reglas del documento:**
- Nada de aspiracional sin marcar. Si una sección habla del futuro, lo dice explícitamente (sección 6, 9).
- Si una decisión se revierte, no se borra: se tacha y se anota la razón en la bitácora (sección 12).
- Markdown puro. Sin emojis innecesarios. Mayúsculas para énfasis crítico únicamente.

---

## 1. Identidad del proyecto

**Nombre comercial:** SegurITech Bot Pro (evolucionando a **SegurITech Suite** con la incorporación del módulo POS).

**Qué es:** Una agencia técnica que diseña, despliega y opera bots de WhatsApp y sistemas POS para negocios locales de Chilpancingo, Guerrero.

**Qué NO es:** No es un SaaS público de autoservicio. No es una plataforma donde los clientes finales abren cuentas, configuran sus propios bots, ni acceden a un panel. Si alguna vez la conversación deriva hacia "que el cliente edite su propio flow", esa conversación está en el lugar equivocado.

**Mercado:** Papelerías, ferreterías, cerrajerías, pizzerías y similares en Chilpancingo. Negocios con 1–10 empleados, sin departamento de IT, donde el dueño contesta WhatsApp con su celular personal.

**Diferenciadores:**
1. **Servicio gestionado (MSP)**: el cliente paga por un bot operando, no por software. Cero fricción técnica.
2. **Conocimiento local**: el equipo entiende el contexto de Chilpancingo, conoce a los dueños por nombre.
3. **Costos fijos bajísimos**: la arquitectura cabe en < 10 USD/mes en infraestructura para los primeros 20–30 clientes.
4. **Moldes de industria**: cada giro tiene un template pre-armado que reduce el tiempo de onboarding de un cliente nuevo de días a horas.

---

## 2. Modelo de negocio

**Pricing tentativo (validar con primer cliente):** suscripción mensual por bot activo, con descuento por anualidad. Cobro adicional por: configuración inicial (one-time), número de WhatsApp Business adicional, integraciones especiales (CFDI, pagos, etc.).

**Funnel de ventas:** referidos locales y visita directa puerta a puerta. NO marketing digital en V1. Chilpancingo es un mercado de confianza, no de funnels.

**Estructura del equipo (objetivo):**
- Cris: producto, arquitectura, desarrollo backend, decisiones técnicas.
- 1–2 desarrolladores: frontend y mantenimiento.
- 1 persona comercial / cuenta: visita clientes, configura bots simples desde el panel.
- 1 persona soporte: monitorea el panel, atiende incidencias.

**Métricas que importan (cuando empiece a haber clientes):**
- **MRR** (Monthly Recurring Revenue).
- **Tiempo de onboarding por cliente nuevo** — el más crítico. Si supera 6 horas, no se escala.
- **Churn mensual** — más allá del 5% mensual, hay problema serio.
- **Mensajes procesados por mes** — para ajustar plan de Meta y Supabase.
- **Tickets de soporte por cliente por mes** — meta: < 2.

---

## 3. Estado actual (Mayo 2026)

> **PARCHE 2026-06-05:** Esta sección está congelada en "Sprint 5.1a". El estado REAL del código (verificado contra el repo) vive en **`.claude/SEGURITECH_ESTADO_ACTUAL.md`** (documento de control vivo). En lo que toca a ESTADO, ese documento gana sobre esta sección. Cambios clave desde el corte: Fase 0 completa, ADR-012 cumplido, frontend ya existe (ver §4.2/§5.1), migraciones 012–015 aplicadas a Cloud.

### 3.1. Sprints completados (en `main`)

| Sprint | Descripción | Estado |
|---|---|---|
| 0 | Build estabilizado, Supabase schema base, HMAC Meta, bcrypt | Completo |
| 1 | Limpieza de código muerto (CLI legacy, Baileys, SQLite repos) | Completo |
| 1.5 | TypeScript interfaces alineadas con DB, ESLint v9 flat config | Completo |
| 2 | Meta adapter real, SupabaseUserRepository, idempotencia webhook | Completo |
| 3 | FlowInterpreter cableado, moldes de industria, API admin (16 endpoints) | Completo |
| 4 | Panel HTML standalone, BACKEND_API_KEY como gating | Completo |
| C | (no documentado en detalle aquí) | Completo |
| D | (no documentado en detalle aquí) | Completo |
| E | **Eliminación del frontend Next.js**. Panel migrado a HTML vanilla servido por Express | Completo |
| F | **Operación Búnker v2**: JWT HS256 + cookie HTTPOnly, RBAC, audit log, lockout, denylist | Completo |
| G | FSM de tenants (`draft → sandbox → live → paused → archived`) | Completo |
| H | Versionado de bot_flows + rollback (migration 008) | Completo |
| 5.1a | **POS Module Bootstrap (backend)**. 12 tablas pos_*, auth PIN, 6 endpoints catálogo | Completo en feature branch |
| Fase 0 | **Cimientos (post-corte).** Integración de ramas, `AdminRouter` modularizado en sub-routers, API A1 de flows (draft/publish/rollback), migraciones 012–015, branch protection en `main`, ADR-012 cumplido | Completo (2026-06-05) |

**Tests:** baseline histórico 36 passed / 3 skipped / 0 failed. Real al corte 2026-06-05: ~57 bloques `it/test` en 9 archivos (fijar el número exacto sobre `main` tras el merge de ADR-012). Ver `.claude/SEGURITECH_ESTADO_ACTUAL.md` §2.1.

### 3.2. Estado del código (lo bueno y lo feo)

**Lo sólido:**
- Arquitectura hexagonal respetada en `backend/src/{domain,application,infrastructure}/`
- `FlowInterpreter` (481 líneas): prioriza bot_flow del tenant. ~~fallback a `HandleMessageUseCase` legacy~~ — el fallback FSM fue **eliminado** (ADR-012 cumplido, 2026-06-05); sin flow → "bot en mantenimiento"
- `flowSchema.ts` con Zod valida límites Meta antes de persistir
- Seguridad nivel producción: AES-256-GCM para tokens Meta, HMAC-SHA256 webhook, JWT + cookie HTTPOnly + SameSite=Strict, bcrypt cost=12, lockout doble capa, audit log append-only, CSP estricta
- ~~11 migrations~~ **15 migrations (001–015)** + 2 seeds (admin + POS papeleria). 012–015 aplicadas a Cloud (tenant_services, `bot_flows.channel`, backfill de servicios, draft_json/draft_updated_at)
- Panel HTML funcional (login, lista tenants, detalle, mensajes, simulador)

**Deuda técnica conocida:**

> **PARCHE 2026-08-20:** esta lista está congelada desde Sprint 4 y nunca se
> revisó contra el código real. Se verificó item por item hoy — los 6 items
> abiertos (1, 2, 3, 5, 7, 8) YA ESTÁN RESUELTOS en `main`, marcados abajo.
> Ver `.claude/SEGURITECH_ESTADO_ACTUAL.md` §3 punto 11 para el detalle de
> la verificación.

1. ~~`tenants.status='paused'` NO bloquea el webhook todavía~~ **RESUELTO** (verificado 2026-08-20): hay test dedicado, `src/tests/integration/webhookStatusGating.test.ts`, cubriendo paused/archived/draft.
2. ~~`send_list` se serializa como texto plano, no como interactive list nativo de Meta~~ **RESUELTO** (verificado 2026-08-20): `MetaWhatsAppAdapter.sendList` ya arma `interactive.type: 'list'`, el formato nativo de Meta.
3. ~~N+1 query en `GET /api/admin/tenants`~~ **RESUELTO** (verificado 2026-08-20): `SupabaseTenantRepository.findAll()` ya hace `Promise.all` de 3 queries + join en memoria, con comentario explícito "Anti-N+1" en el código.
4. ~~`HandleMessageUseCase` (FSM hardcodeada de papelería) sigue como fallback peligroso.~~ **RESUELTO (ADR-012, 2026-06-05):** use-case eliminado. Pendiente: limpiar la referencia residual en `domain/entities/index.ts`.
5. ~~`ReadlineAdapter` se arranca incondicionalmente en `Bootstrap.run()`, también en producción~~ **RESUELTO** (verificado 2026-08-20): ya gateado tras `if (config.isDevelopment)` en `Bootstrap.ts`.
6. ~~`.github/workflows/ci.yml` referencia `cd frontend && npm ci` — la carpeta no existe, el CI está roto~~ **RESUELTO:** el workspace `frontend/` ya existe (Vite+React 19) y el type-check (`tsc -p tsconfig.app.json`) es gate real de CI. Ver §4.2/§5.1.
7. ~~`.env.example` en la raíz tiene variables muertas (NEXT_PUBLIC_*, NEXTAUTH_SECRET)~~ **RESUELTO** (verificado 2026-08-20): ese archivo ya no existe en la raíz.
8. ~~`backend/bin/www` es fósil del generador Express, requiere un módulo inexistente~~ **RESUELTO** (verificado 2026-08-20): ese archivo ya no existe.
9. `InMemoryUserRepository` solo lo usan tests, debería moverse a `tests/utils/`
10. `docs/` tiene > 30 archivos .md de distintas épocas, redundantes
11. `backend/supabase/seed.sql` suelto sin claridad si está vivo o legacy

### 3.3. Bloqueadores activos para el primer cliente

Estos son **independientes** del roadmap futuro y bloquean cobrar a un primer cliente HOY mismo:

1. ~~**Supabase Cloud vacío**: migrations 001–010 no aplicadas (la 011 puede esperar).~~ **Actualizado 2026-06-05:** migraciones 001–015 presentes, **012–015 aplicadas a Cloud**; `tenant_services` activa como fuente única de verdad. Confirmar admin users y env vars críticas para el primer tenant.
2. **Meta for Developers no configurado**: falta Business Account, System User permanent token, verificación de negocio, primer template aprobado, webhook URL pública.
3. **VPS Hetzner no provisionado**: el dominio no apunta a ningún servidor todavía.
4. **CI roto**: el próximo push a main va a fallar el workflow.

**El bloqueador más lento es Meta** (1–2 semanas por verificación). Hay que arrancar ese trámite YA, en paralelo con todo lo demás.

---

## 4. Stack técnico

### 4.1. Backend (estable, sin cambios planeados)

| Capa | Tecnología | Notas |
|---|---|---|
| Runtime | Node.js 18+ | LTS 20 recomendado para prod; **se ejecuta en 22** al corte 2026-06-05 |
| Lenguaje | TypeScript 5.9 estricto | `module: node16` en backend |
| Framework HTTP | Express 5 | Con helmet, cors, express-rate-limit |
| Validación | Zod 3.25 | Env vars, inputs HTTP, flow schemas |
| Persistencia | Supabase (Postgres + RLS) | service_role bypassea RLS server-side |
| Cifrado | AES-256-GCM (Node crypto) | `TokenCrypto` para Meta access_tokens |
| Auth | JWT HS256 + bcryptjs | Cookie HTTPOnly + denylist server-side |
| Logging | Pino + pino-pretty | Estructurado JSON en prod |
| Tests | Jest 30 + Supertest 7 | 36 passed baseline |
| Linting | ESLint 9 flat config + @typescript-eslint 8 | |
| Process manager | PM2 7 | En el VPS de prod |
| API Meta | WhatsApp Cloud API v21 | Multi-tenant via tenant_meta_credentials |

### 4.2. Frontend (~~a construir — Sprint 6+~~ — **YA EXISTE, parcial**)

> **PARCHE 2026-08-19:** El frontend ya no es aspiracional. Workspace `frontend/` activo con Vite + React 19 + TanStack Router/Query + shadcn/ui + Zustand + Tailwind 4. App `panel` construida (config WhatsApp, dashboard con estado operativo, simulador embebido). Designer y POS siguen siendo líneas de evolución, no la base actual. Versiones reales pineadas abajo; type-check es gate real de CI. Ver `.claude/SEGURITECH_ESTADO_ACTUAL.md` §2.2.

| Capa | Tecnología | Real en repo (2026-06-05) |
|---|---|---|
| Build tool | **Vite 5+** | **Vite 8** |
| Framework | **React 18+** | **React 19.2** |
| Lenguaje | TypeScript estricto | TS ~5.9 (no 6: TanStack 1.170 no lo soporta) |
| Routing | **TanStack Router** | Activo (lazy-routes con IDs `/_authed/`-prefijados) |
| Server state | **TanStack Query** | Activo |
| Client state | **Zustand** | **Zustand 5** |
| UI components | **shadcn/ui** + Radix | Activo |
| Styling | **Tailwind CSS** | **Tailwind 4** |
| Canvas flow editor | **React Flow (@xyflow/react)** | Estándar de facto. Lo usan n8n, Typebot, Flowise |
| Offline storage (POS) | **Dexie.js** | Wrapper de IndexedDB con API decente |
| Iconos | **lucide-react** | Consistente con shadcn |
| Forms | **react-hook-form** + Zod | Validación compartida con backend |

**Lo que NO vamos a usar (explícito):**
- ~~Next.js~~ — eliminado en Sprint E, no se reintroduce. SSR no aporta nada a apps internas.
- ~~Vercel~~ — el frontend se sirve desde el mismo Express del VPS Hetzner.
- ~~Redux / Redux Toolkit~~ — overkill para nuestro tamaño.
- ~~Material-UI / Ant Design~~ — design systems pesados que atan.
- ~~CSS-in-JS (styled-components, emotion)~~ — runtime cost, Tailwind gana.

### 4.3. Print Agent (a construir — Sprint 12)

| Capa | Tecnología |
|---|---|
| Runtime | Node.js empaquetado con `pkg` o `nexe` |
| Librería ESC/POS | `node-thermal-printer` |
| Server | Express minimal en `127.0.0.1:9100` |
| Distribución | Ejecutable único `.exe` / binario Linux |

### 4.4. Infraestructura

| Recurso | Proveedor | Costo aprox |
|---|---|---|
| Base de datos | Supabase Cloud (Free → Pro cuando crezca) | 0 USD inicialmente, 25 USD/mes en Pro |
| Backend hosting | Hetzner Cloud CX22 (Ashburn, ~60ms a México) | ~5 USD/mes |
| DNS + CDN + Zero Trust | Cloudflare (Free + Access Free hasta 50 usuarios) | 0 USD |
| Backups | Backblaze B2 vía cron pg_dump | < 1 USD/mes |
| Monitoring | UptimeRobot (free) + Sentry (free tier) | 0 USD |
| Tunneling dev | ngrok (free) | 0 USD |
| **Total infra mes** | | **< 6 USD inicialmente** |

---

## 5. Arquitectura

### 5.1. Estructura del monorepo

> **PARCHE 2026-08-19:** El workspace `frontend/` ya existe; el árbol real es backend + frontend (app `panel`) presentes. Designer, pos y print-agent siguen siendo trabajo futuro. Ver `.claude/SEGURITECH_ESTADO_ACTUAL.md` §2.2/§5.1.

**Estado mayo 2026 (superado — backend como workspace único):**

```
seguritech-bot-pro/
├── backend/                ← workspace único hoy
│   ├── src/
│   │   ├── domain/         ← entities, ports, use-cases, services, validators
│   │   ├── application/    ← PosAuthService (más servicios de aplicación)
│   │   ├── infrastructure/ ← adapters, repositories Supabase, server Express, auth
│   │   ├── app/            ← ApplicationContainer (DI), BotController
│   │   ├── config/         ← env, logger
│   │   └── Bootstrap.ts    ← orquesta el arranque
│   ├── public/             ← HTML vanilla del panel + simulador
│   │   ├── panel/
│   │   └── simulator/
│   └── supabase/migrations/  ← 001 a 015 + seeds
├── docs/                   ← documentación (a depurar)
├── docker-compose.yml
└── package.json            ← workspaces: ['backend']
```

**Estado parcial real (2026-08-19):** `frontend/` ya añadido como workspace con la app `panel` (Vite+React 19); `designer/`, `pos/` y `print-agent/` siguen pendientes según el objetivo de abajo.

**Estado objetivo (post-Sprint 6):**

```
seguritech-suite/
├── backend/                ← sin cambios mayores
├── frontend/               ← NUEVO workspace
│   ├── src/
│   │   ├── apps/
│   │   │   ├── panel/       ← admin CRUD (migración del HTML actual a React)
│   │   │   ├── designer/    ← Bot Designer con React Flow
│   │   │   └── pos/         ← POS PWA con Dexie + service worker
│   │   ├── shared/
│   │   │   ├── ui/          ← componentes shadcn
│   │   │   ├── api/         ← hooks TanStack Query por endpoint
│   │   │   ├── auth/        ← cookie helpers, login redirect
│   │   │   └── types/       ← tipos compartidos con backend (zod schemas)
│   │   └── main.tsx         ← router top-level
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   └── package.json
├── print-agent/            ← NUEVO workspace (Sprint 12)
│   ├── src/
│   ├── pkg.config.json
│   └── package.json
├── backend/public/         ← destino del build estático de frontend/
├── docs/                   ← DEPURADO. Solo lo que sirve hoy
└── package.json            ← workspaces: ['backend','frontend','print-agent']
```

### 5.2. Capas y dependencias (hexagonal)

```
┌─────────────────────────────────────────────────────────┐
│  DOMAIN  (puro, sin imports de infra)                   │
│  - entities/ flow, User, TenantConfig, PosProduct...    │
│  - ports/ TenantRepository, NotificationPort...         │
│  - use-cases/ HandleMessage, AssignMolde...             │
│  - services/ FlowInterpreter, VariableResolver          │
│  - validators/ flowSchema (Zod)                         │
└─────────────────────────────────────────────────────────┘
                          ↑ implementa
┌─────────────────────────────────────────────────────────┐
│  APPLICATION                                            │
│  - servicios de aplicación (PosAuthService, etc.)       │
│  - orquestación entre use-cases                         │
└─────────────────────────────────────────────────────────┘
                          ↑ usa
┌─────────────────────────────────────────────────────────┐
│  INFRASTRUCTURE                                         │
│  - adapters/ MetaWhatsAppAdapter, Console, Readline     │
│  - repositories/ Supabase*Repository                    │
│  - services/ TokenCrypto, MessageLog, TenantConfig      │
│  - auth/ JwtService, AuthMiddleware                     │
│  - server/ ExpressServer, AdminRouter, AuthRouter, Pos  │
└─────────────────────────────────────────────────────────┘
                          ↑ inicializa
┌─────────────────────────────────────────────────────────┐
│  APP (composition root)                                 │
│  - ApplicationContainer (DI manual, 7 args)             │
│  - controllers/ BotController                           │
└─────────────────────────────────────────────────────────┘
                          ↑ arranca
                    Bootstrap.run()
```

**Regla de oro:** `domain` no importa nada de `infrastructure` ni de `application`. Si alguna vez ves `import` desde domain hacia fuera, es bug, no feature.

### 5.3. Filosofía Core + Molde + Traje

Aplica tanto a bot como a POS:

```
┌─────────────────────────────────────────────────────────┐
│  CORE INVARIANTE (~90%)                                 │
│  Engine de flow / Engine de ventas / Inventario / Auth  │
├─────────────────────────────────────────────────────────┤
│  MOLDES DE INDUSTRIA (~8%)                              │
│  domain/moulds/papeleria, ferreteria, cerrajeria...     │
├─────────────────────────────────────────────────────────┤
│  TRAJE A LA MEDIDA POR TENANT (~2%)                     │
│  Customización vía pos_tenant_config, bot_flows         │
└─────────────────────────────────────────────────────────┘
```

Esto es CRÍTICO de respetar. Cada vez que escribas código específico de un cliente directamente en el dominio, te estás disparando al pie. Va en el molde o en la config del tenant.

---

## 6. Visión de producto

### 6.1. Las tres experiencias separadas

El proyecto tiene tres interfaces distintas con tres tipos de usuario:

| Experiencia | Usuario | Tipo de UI |
|---|---|---|
| **Panel admin** | Equipo SegurITech | CRUD, dashboards. React liviano |
| **Bot Designer** | Equipo SegurITech | Editor visual creativo. Canvas + inspector |
| **POS** | Cajero del cliente | PWA offline-first, tablet, rápida |

Estas tres comparten **el mismo backend, la misma cookie de sesión, el mismo deploy**, pero son experiencias separadas. Cada una en su carpeta dentro de `frontend/src/apps/`.

### 6.2. Bot Designer profesional — qué define "de primera"

El Bot Designer es la herramienta donde tu equipo va a pasar el 70% del tiempo. Tiene que ser ESPECTACULAR. Estos son los atributos no-negociables para considerarlo "profesional":

**Canvas drag-and-drop con React Flow.**
- Zoom, pan, minimap, multi-select, undo/redo (out of the box con React Flow).
- Conexiones tipadas: solo se permite conectar handles compatibles (un handle "button" no se conecta a "list_item").
- Auto-layout opcional (dagre o elk) para ordenar flows importados.

**Paleta de nodos visuales (mapeo 1:1 con `FlowNode`):**
- `send_text` (morado) — preview con `{{variables}}` resaltadas
- `send_buttons` (azul) — botones renderizados como en WhatsApp, cada uno es handle de salida
- `send_list` (verde) — sections + items, cada item handle
- `send_image`, `send_location`, `send_document` (gris) — preview media
- `wait_input` (naranja) — regla de captura (regex, tipo, save_to_context)
- `condition` (rombo) — expresión + handles true/false
- `escape_to_human` (rojo) — alerta al owner

**Inspector lateral con validación en vivo.**
- Al seleccionar un nodo, panel derecho con props editables.
- Validación Zod en tiempo real: "máx 3 botones", "título ≤20 chars", "next_node_id no existe", "ciclo detectado".
- Lista de transiciones drag-reorderable.
- Autocomplete de variables al escribir `{{`.

**Simulador embebido (split-screen inferior).**
- iframe con el simulador HTML actual apuntando a `/api/admin/simulate`.
- Cada save refresca el simulador automáticamente.
- Botón "Reset conversación" para empezar desde el start_node.

**Versionado con rollback.**
- Aprovecha `bot_flow_versions` (migration 008) ya existente.
- Dropdown de versiones con timestamps y autor.
- Diff visual entre dos versiones (al menos: nodos agregados/eliminados/modificados).
- Botón "Promover esta versión a activa".

**Test cases por flow.**
- Tab adicional en el designer.
- Cada caso es: `inputs: ['hola', '1', 'sí']` → `expected: last_node_id='confirmacion' AND outputs contains 'gracias'`.
- Persistencia en nueva tabla `bot_flow_test_cases`.
- Runner contra `SimulateMessageUseCase`.
- **Gate de publicación**: no se puede activar una nueva versión si hay test cases fallando.

**Variables tipadas por tenant.**
- Diccionario en `bot_flow_variables` (nueva tabla): `customer_name (string, required, source: user_input)`, `last_order_id (string|null, source: backend_lookup)`, etc.
- El inspector usa el diccionario para autocomplete.
- Schema explícito > magia oculta.

**Lo que NO va en V1 del designer:**
- A/B testing entre versiones
- Analytics granular por nodo (heatmap de drop-off)
- ~~GPT/AI dentro del flow (queda para V3)~~ — **SUPERADO 2026-08-19:** V3 ya tiene plan de implementación aprobado. Ver `.claude/SEGURITECH_AI_SECRETARIA_PLAN.md` y regla operativa 9 (§8) actualizada. La IA no se mete *dentro* del flow — se inserta como enrutador previo (§3.1 del plan); los flows existentes no cambian.
- Multi-idioma del bot
- Scheduling de mensajes salientes
- Webhooks de salida hacia sistemas externos

Resiste meter cualquiera de los anteriores hasta tener 5 clientes pagando.

### 6.3. POS profesional — qué define "de primera"

El cajero necesita ir RÁPIDO, no equivocarse, y que funcione cuando se va el internet. Atributos no-negociables:

**PWA instalable con service worker.**
- Manifest.json con icono, nombre, theme color.
- Service worker que cachea shell + catálogo en IndexedDB.
- Instalable como app standalone en Chrome/Edge.

**Offline-first real.**
- Dexie.js sobre IndexedDB para catálogo, ventas pendientes, configuración local.
- Ventas se persisten LOCAL primero con `client_uuid` generado en cliente.
- Sync queue en background: intenta enviar al backend cada N segundos cuando hay red.
- Idempotencia server-side por `client_uuid` (columna unique en `pos_sales`).
- Conflict resolution: si servidor responde con ajuste (ej. inventario), notificación no-bloqueante.

**Layout optimizado para velocidad.**
- Tres zonas: buscador/catálogo (izq), ticket en construcción (centro), cobro (der).
- Búsqueda por nombre, SKU, código de barras con autocomplete instantáneo.
- Categorías como tiles visuales (no menú).
- Hotkeys para operaciones frecuentes: F2 buscar, F4 descuento, F8 cobrar, F10 cancelar ticket.

**Lectura de código de barras.**
- V1: lector USB HID (modo teclado), input invisible siempre focuseado.
- V2: cámara con `@zxing/library` para tablets sin lector.

**Impresión ESC/POS vía print agent local.**
- Mini-servicio Node empaquetado con `pkg`, corre en cada caja.
- Escucha en `127.0.0.1:9100`.
- PWA hace `fetch('http://127.0.0.1:9100/print', ...)`.
- Soporta apertura de cajón de dinero (mismo cable RJ11 de la impresora).
- Instalador único, autostart al boot.

**Cobro con métodos básicos en V1:**
- Efectivo (con cálculo de cambio).
- Transferencia (registro manual con referencia).
- Terminal externa (registro del monto, el pago físico se hace en la terminal del banco aparte).
- V2: integración directa con Clip / Mercado Pago / Sr. Pago.

**Reportes esenciales.**
- Corte X (intermedio, no cierra).
- Corte Z (cierre del día, resetea contadores).
- Productos más vendidos por día/semana.
- Comparativo de caja física vs sistema.

**CFDI 4.0 — V2, NO V1.**
- Integración con PAC (Facturama recomendado en México).
- Botón "Facturar este ticket" en el detalle de venta.
- Backend llama al PAC, recibe PDF + XML, envía por email/WhatsApp.
- No implementar CFDI manualmente. Está regulado por SAT y cambia.

**Lo que NO va en V1 del POS:**
- Multi-caja con sincronización entre cajas en tiempo real
- Inventario multi-sucursal
- Reportes avanzados (ABC, márgenes por categoría)
- Programa de lealtad / puntos
- Promociones complejas (2x1, descuento por volumen, combos)
- Integración con contabilidad (CONTPAQi, Aspel COI)
- Pedidos a proveedores

---

## 7. Decisiones arquitectónicas clave (ADRs informales)

Estas son las decisiones que NO se discuten cada sprint. Si alguien las cuestiona, primero lee aquí por qué se tomaron.

### ADR-001: Modelo MSP, no SaaS público
Los clientes finales nunca acceden al panel. Esto simplifica auth (solo super_admin y admin_operator), elimina onboarding self-service, y reduce superficie de ataque. Validez: indefinida. Solo se revierte si el negocio cambia a un modelo de producto.

### ADR-002: Supabase como única persistencia
No hay BD local, no hay Redis, no hay Mongo. Toda persistencia en Postgres de Supabase. El cache de TenantConfig es in-process con `node-cache`. Si en algún momento se necesita cache distribuido, se evalúa Redis o Supabase Realtime.

### ADR-003: Service role bypass + RLS como defensa en profundidad
El backend usa `service_role` key que bypassea RLS. El aislamiento multi-tenant real lo dan los `WHERE tenant_id = ?` en repositorios. RLS está como defense-in-depth, no como gating principal. Si algún día se expone una `anon` key a frontend, las policies protegen.

### ADR-004: Cookie HTTPOnly JWT > Bearer token en localStorage
Las cookies HTTPOnly no son accesibles desde JS, lo que mitiga XSS. `SameSite=Strict` mitiga CSRF. La denylist server-side (`admin_sessions_revoked`) permite logout efectivo. localStorage queda descartado para tokens.

### ADR-005: Eliminación del frontend Next.js (Sprint E)
Next.js justifica su costo cuando hay SSR, SSG, edge functions, SEO. Ninguno aplica a apps internas. Sprint E lo eliminó. Sprint 6 reintroducirá un frontend pero con Vite + React (SPA pura), NO Next.js.

### ADR-006: Reintroducción de frontend con Vite (Sprint 6)
El panel HTML vanilla actual escala mal para herramientas creativas (designer, POS). Sprint 6 introduce `frontend/` con Vite + React + Tailwind + shadcn/ui. Tres apps internas (panel, designer, pos), bundle estático servido por el mismo Express. NO se deployea a Vercel.

### ADR-007: React Flow como canvas del Bot Designer
Estándar de facto para editores de flujo en React. Lo usa n8n, Typebot, Flowise. Maneja zoom/pan/minimap/undo nativo. Alternativas evaluadas: drawflow (más simple pero menos features), Cytoscape (más para grafos analíticos), construir desde cero (descartado por costo).

### ADR-008: PWA con Dexie para POS, NO Electron, NO React Native
PWA es la mínima fricción de distribución (URL, instalar app, listo). Electron es un binario de 100MB+ por caja. React Native no aplica (no es móvil nativo el target). Dexie sobre el IndexedDB del navegador es suficiente para catálogos hasta 10k productos.

### ADR-009: Print agent local en Node + pkg
La impresión ESC/POS desde navegador es inviable por permisos. WebUSB tiene fricción extrema. Print agent en Node empaquetado con `pkg` resuelve: 30MB de binario, autostart, comunicación HTTP en localhost. Alternativa Go evaluada (binario más chico ~10MB) pero el equipo es Node-first.

### ADR-010: Idempotencia POS por client_uuid generado en cliente
Las ventas POS pueden hacerse offline y sincronizarse después. Sin idempotencia, una sincronización con red intermitente duplica ventas. El cliente genera UUID v4 al crear la venta, el servidor usa unique constraint en `pos_sales.client_uuid`. Conflictos retornan la venta existente, no error.

### ADR-011: CFDI vía PAC externo, NO implementación propia
CFDI 4.0 está regulado por SAT y cambia frecuentemente. Implementarlo internamente es contraproducente. Se integra con Facturama (o equivalente) como servicio externo. Solo si el PAC nos limita en algo crítico se reconsidera.

### ADR-012: HandleMessageUseCase legacy se elimina ~~en Sprint 7~~ — **CUMPLIDO**
La FSM hardcodeada en `HandleMessageUseCase` es código muerto peligroso. Una vez todos los tenants tengan bot_flow asignado, el use-case se elimina del BotController. Si un tenant queda sin flow, se devuelve "bot en mantenimiento", no se cae a la FSM.

**Estado (2026-06-05): CUMPLIDO** — antes de lo previsto. El use-case fue eliminado en la rama `chore/adr-012-remove-legacy-handlemessage` (commit `18e2a43`), pendiente de merge a `main`. Limpieza residual pendiente: referencia a `HandleMessageUseCase` aún nombrada en `domain/entities/index.ts`. Ver `.claude/SEGURITECH_ESTADO_ACTUAL.md` §2.1 y §3.

### ADR-013: Test cases del designer son gate de publicación
Una vez implementado el sistema de test cases (Sprint 9), no se puede activar una nueva versión de `bot_flow` si hay test cases fallando. Esto es el equivalente a CI/CD para flows de negocio.

---

## 8. Reglas operativas no-negociables

Estas son las reglas que han causado dolor cuando se rompieron. Tatuárselas.

1. **Nunca correr `npm install` desde un subdirectorio del monorepo.** Solo desde la raíz. Romper esto desincroniza el lockfile.

2. **Nunca `supabase db reset` contra Cloud.** Solo local. Es destructivo, no hay undo.

3. **Credenciales se piden interactivamente, NUNCA se embeben en prompts ni se loguean.** Esto aplica a Cris escribiendo prompts para Claude Code igual que a logs de producción.

4. **`BACKEND_API_KEY` debe ser idéntica en ambos entornos** (backend y, cuando llegue, frontend proxy). Y NUNCA debe llegar al browser.

5. **El secret JWT (`ADMIN_JWT_SECRET`) en producción es OBLIGATORIO y >= 64 chars.** Generar con `openssl rand -hex 64`. En dev se permite ephemeral, en prod nunca.

6. **`META_TOKEN_ENCRYPTION_KEY` no se rota nunca después de tener tokens cifrados en BD.** Si se necesita rotar, hay que descifrar todos, cambiar key, recifrar. No es trivial.

7. **El cliente NO toca el panel.** Si alguien pide "que el cliente edite su propio bot", aclarar que el modelo es MSP y referir a este documento.

8. **No se publican flows sin pasar test cases** (desde Sprint 9 en adelante).

9. ~~**No se mete IA / LLM en el flow del bot.** Está deferido a V3. Cualquier propuesta de "GPT en producción" se rechaza por default.~~ **SUPERADA 2026-08-19:** la evolución a "secretaria digital semi-autónoma" está aprobada y planeada en `.claude/SEGURITECH_AI_SECRETARIA_PLAN.md`. La regla no desaparece, se reemplaza por sus guardrails ejecutables (plan §4 y §0): la IA nunca escribe SQL directo ni inventa precios/datos, toda mutación pasa por un caso de uso validado server-side, aislamiento por `tenant_id` obligatorio, timeout corto con fallback a flow/humano, y feature flag `agentEnabled` apagado por default en producción hasta el piloto (plan Fase 1). Cualquier propuesta que se salte estos guardrails sí se rechaza por default.

10. **No se introduce un nuevo servicio externo** (ej. otro PAC, otra impresora, otro proveedor de SMS) **sin un ADR explícito en sección 7.**

11. ~~**`HandleMessageUseCase` muere en Sprint 7.**~~ **CUMPLIDO (ADR-012, 2026-06-05):** eliminado en rama `chore/adr-012-remove-legacy-handlemessage`. La regla se mantiene como principio: sin flow → "bot en mantenimiento", nunca fallback a FSM.

12. **El frontend nunca se deployea a Vercel.** Bundle estático en el VPS Hetzner. Una sola URL, una sola cookie, cero CORS.

13. **`process.env.NODE_ENV` no se lee directamente desde dominio.** Solo desde `config/env.ts`. El resto del código consume `config.isProduction`, `config.isDevelopment`.

14. **Cada nuevo endpoint en `/api/admin/*` debe registrar en audit log toda mutación.** Inmutable, append-only. No hay updates ni deletes en `admin_audit_log`.

15. **`curl` desde Git Bash en Windows contra endpoints que crean/editan datos con acentos: usar `--data-binary @archivo.json`, nunca `-d '...'` inline.** Confirmado en la sesión del stress test de "Papelería DEMO" (2026-08-25): `-d '{"nombre_negocio":"Papelería DEMO",...}'` inline corrompió los acentos UTF-8 en la fila real de Supabase (`"Papeler�a DEMO"`) — el bug es de la capa de shell/`curl` en ese entorno, no del backend. Escribir el JSON a un archivo (UTF-8) y pasarlo con `--data-binary @archivo.json` lo evita por completo. Ver `.claude/CONTRATOS_API_ADMIN.md` para los contratos reales de la API admin descubiertos en la misma sesión.

---

## 9. Roadmap por sprints

> **PARCHE 2026-06-05 — Sprints ↔ Fases:** La operación real numera por **Fases (0/1/2)**, no por Sprints. Mapeo: **Fase 0** (cimientos: integración, modularización AdminRouter, API flows, migraciones 012–015, branch protection) ≈ cubre y rebasa Sprints 5.5/6 — **completa**. **Fase 1** = WhatsApp en producción ≈ Sprints 5.6 + 7–9 (designer). **Fase 2** = POS ≈ Sprints 10–13. Pendiente decidir una sola numeración y migrar la otra a alias (ver `.claude/SEGURITECH_ESTADO_ACTUAL.md` §5). Hasta entonces, para QUÉ HACER y EN QUÉ ORDEN manda el `SEGURITECH_ROADMAP_OPERATIVO.md`.

> **PARCHE 2026-08-19:** La siguiente evolución del bot ya no se piensa solo en flows. El plan base para secretaria digital semi-autónoma está en `.claude/SEGURITECH_AI_SECRETARIA_PLAN.md`. Ese documento define la ruta híbrida: flows como esqueleto, IA como cerebro, herramientas como manos.

**Cadencia asumida:** ~4–6 horas/día efectivas. Sprints de 1–4 semanas según alcance.

### Sprint 5.5 — Hardening crítico + Meta verification (1 semana)
**Objetivo:** Desbloquear el primer cliente.
- Arreglar CI (quitar referencias a `frontend/`).
- Borrar `backend/bin/www`, `.env.example` raíz.
- Gatear `ReadlineAdapter` a `if (config.isDevelopment)`.
- Mover `InMemoryUserRepository` a `tests/utils/`.
- Resolver deuda crítica: `tenants.status='paused'` debe bloquear webhook.
- **Iniciar verificación Meta Business** (esto sigue corriendo en background varios sprints).
- Aplicar migrations 001–010 a Supabase Cloud (NO 011 todavía).
- Seed del primer super_admin.

### Sprint 5.6 — Primer cliente piloto en producción (2 semanas)
**Objetivo:** Una papelería real respondiendo en su WhatsApp oficial.
- Provisionar VPS Hetzner CX22 con UFW + nginx + PM2 + Cloudflare.
- Configurar dominio y DNS.
- Generar todas las env vars críticas con `openssl`.
- Configurar Cloudflare Access Zero Trust con whitelist de emails.
- Configurar Sentry + UptimeRobot.
- Onboarding del primer cliente (papelería identificada).
- Una vez Meta verifique: configurar webhook real, primer template aprobado.
- **Métrica de éxito:** una papelería real recibiendo y respondiendo mensajes.

### Sprint 6 — Reintroducción de frontend (2–3 semanas)
**Objetivo:** Foundation para designer y POS.
- Crear workspace `frontend/` con Vite + React + TS + Tailwind + shadcn.
- Setup de TanStack Router y TanStack Query.
- Configurar build a `backend/public/` (Express sirve).
- Migrar el panel HTML actual a React (CRUD): login, lista tenants, detalle, mensajes.
- Endpoints nuevos: `POST /api/admin/flows/:tenantId/draft`, `POST /api/admin/flows/:tenantId/publish`, `POST /api/admin/flows/:tenantId/test`.
- Eliminar `HandleMessageUseCase`. Tenants sin flow responden "bot en mantenimiento".

### Sprint 7 — Bot Designer V1 (3–4 semanas)
**Objetivo:** Editor visual usable.
- Setup React Flow con canvas básico.
- 7 tipos de nodo custom con sus components React.
- Inspector lateral con validación Zod en vivo.
- Toolbar (agregar nodo, validar, guardar, deshacer).
- Save/load contra backend en formato JSON validado por `flowSchema`.
- Drag-and-drop desde paleta hacia canvas.
- **Sin simulador embebido todavía.**

### Sprint 8 — Bot Designer V2: simulador + versionado (2 semanas)
- Simulador embebido (split-screen inferior).
- Dropdown de versiones con `bot_flow_versions`.
- Diff visual entre versiones (al menos: nodos add/del/mod).
- Botón "Promover a activa".
- **Sin test cases todavía.**

### Sprint 9 — Test cases del designer (1–2 semanas)
- Nueva tabla `bot_flow_test_cases`.
- UI de gestión de casos en el designer.
- Runner contra `SimulateMessageUseCase`.
- Gate de publicación.
- Variables tipadas (`bot_flow_variables`).

### Sprint 10 — POS PWA V1 online (3–4 semanas)
- App `frontend/src/apps/pos` con React.
- Layout tres zonas (catálogo, ticket, cobro).
- Búsqueda por nombre/SKU/barcode (lector USB HID).
- Login PIN del cajero contra `/api/auth/pos-login` (ya existe).
- Persistencia local con Dexie.
- Cobro efectivo + transferencia + terminal externa.
- **Sin offline real, sin impresión.**

### Sprint 11 — POS PWA V2: offline + sync (2 semanas)
- Service worker con cache del shell.
- Sync queue de ventas con idempotencia.
- Conflict resolution no-bloqueante.
- Indicador visual de estado de sync.

### Sprint 12 — Print agent + impresión + cajón (2 semanas)
- Workspace `print-agent/` con Node + Express minimal.
- Empaquetado con `pkg`.
- Comandos ESC/POS via `node-thermal-printer`.
- Apertura de cajón (RJ11 desde impresora).
- Instalador para Windows (.exe) y Linux (binario + .desktop).
- Integración desde PWA.

### Sprint 13 — Reportes POS + corte de caja (1–2 semanas)
- Corte X y Z.
- Productos más vendidos.
- Comparativo caja física vs sistema.
- Vista imprimible.

### Sprint 14+ — Pendientes diferidos
- CFDI 4.0 con Facturama (V2 del POS).
- Integración bot ↔ POS (consulta inventario por WhatsApp).
- Más moldes: ferretería, cerrajería, pizzería.
- Dashboard de analytics del MSP (clientes activos, mensajes/mes, churn).

**Tiempo total Sprint 5.5 → 13:** 16–21 semanas full-time, 6–8 meses part-time.

---

## 10. Glosario

| Término | Definición |
|---|---|
| **MSP** | Managed Service Provider. Modelo donde SegurITech opera los bots/POS por cuenta del cliente. |
| **Tenant** | Cliente final del MSP. Un negocio (papelería, ferretería, etc.). |
| **Bot flow / flow** | Grafo dirigido de nodos que define la conversación del bot. Persistido como JSON en `bot_flows`. |
| **Molde** | Template pre-armado de bot_flow + bot_configuration + (en POS) categorías y productos. Por industria. |
| **Traje** | Customización específica del tenant sobre el molde base. |
| **Cuarto de mandos** | El panel admin. El lugar donde el equipo SegurITech opera. |
| **Operación Búnker v2** | Sprint F. Endurecimiento de autenticación admin. |
| **FlowInterpreter** | El servicio de dominio que ejecuta un bot_flow contra un mensaje entrante. |
| **PAC** | Proveedor Autorizado de Certificación (CFDI 4.0). En México: Facturama, SW, Solución Factible. |
| **CFDI** | Comprobante Fiscal Digital por Internet. Factura electrónica regulada por SAT. |
| **ESC/POS** | Protocolo Epson de comandos para impresoras térmicas de punto de venta. |
| **Print agent** | Mini-servicio local en cada caja que recibe HTTP y manda ESC/POS a la impresora. |
| **Corte X / Z** | Reportes de caja. X = intermedio, no cierra. Z = cierre del día, resetea. |
| **Sandbox / Live / Paused** | Estados del FSM de tenants (migration 006). |

---

## 11. Recursos y referencias externas

### Para Bot Designer (inspiración y aprendizaje)
- **Voiceflow** (voiceflow.com) — la referencia visual indiscutible. Cuenta gratuita.
- **Typebot** (typebot.io + github.com/baptisteArno/typebot.io) — open source, construido con React Flow. **Repo obligatorio de estudiar antes del Sprint 7.**
- **BotPress** (botpress.com) — open source con AI. Estudiar su modelo de blocks anidados.
- **Twilio Studio** — solución empresarial pulida. Buena para patrones de UX de validación.
- **n8n** (n8n.io) — workflows generales, canvas excelente. También usa React Flow.
- **ManyChat** y **Chatfuel** — líderes de mercado del bot WhatsApp/Messenger.
- **Take Blip**, **Yalo** — referencias latam, especializadas en retail México.

### Para POS profesional
- **Square** (squareup.com) — referencia de UX en POS moderno.
- **Loyverse** (loyverse.com) — POS gratuito muy usado en LatAm. **Descargar app y probar.**
- **Odoo POS** — open source. Sus reportes y módulo de inventario son referencia.
- **Floreant POS**, **Chromis POS** — open source, código viejo pero útil para data modeling.
- **Bind ERP** (bind.com.mx) — POS mexicano. Ver integración CFDI.
- **Alegra POS** (alegra.com) — colombiano popular en México. Su API es referencia.
- **Sciumi**, **Aspel SAE** — los tradicionales en papelerías mexicanas. YouTube tiene demos.

### Documentación técnica
- **React Flow docs** (reactflow.dev) — leer completo antes de Sprint 7.
- **MDN PWA section** (developer.mozilla.org) — antes de Sprint 11.
- **node-thermal-printer GitHub** — antes de Sprint 12.
- **Especificación ESC/POS de Epson** (epson-biz.com) — referencia técnica.
- **SAT Anexo 20** (sat.gob.mx) — solo si llegas a V2 con CFDI.
- **Facturama API** (api.facturama.mx) — PAC recomendado.

### Diseño visual general
- **Mobbin** (mobbin.com) — archivo de UI patterns.
- **Refactoring UI** (refactoringui.com) — libro de los creadores de Tailwind. 100 USD una vez, vale el dinero.
- **shadcn/ui docs** (ui.shadcn.com) — referencia obligatoria de componentes.
- **Tailwind docs** (tailwindcss.com) — referencia diaria.

### Comunidades
- **r/SaaS** (Reddit) — para preguntas de modelo de negocio.
- **Indie Hackers** (indiehackers.com) — historias de gente que construyó SaaS solos.
- **Hacker News** — para mantenerse al día de stack y tendencias.
- **/r/webdev** y **/r/reactjs** — para preguntas técnicas.
- **Discord de shadcn/ui y de React Flow** — preguntas específicas con respuestas rápidas.

---

## 12. Bitácora de cambios de este documento

| Fecha | Versión | Cambio | Autor |
|---|---|---|---|
| 2026-05-21 | 2.0 | Documento maestro creado consolidando estado real del código (Sprints 0–5.1a), decidiendo reintroducción de frontend con Vite, definiendo roadmap completo hasta Sprint 13, y formalizando 13 ADRs y 14 reglas operativas. | Cris + Claude |
| 2026-08-19 | 2.0-p2 | Sincronización documental con `main`: README, estado vivo y MAESTRO alineados al monorepo real backend + frontend; el panel React queda registrado como workspace activo y se elimina la narrativa backend-only. | Cris + Claude |

---

## Apéndice A — Cheatsheet de comandos

```bash
# Desarrollo local
npm run dev                          # arranca backend en 127.0.0.1:3001
npm test                             # full suite Jest
npm run test:multiTenant             # solo aislamiento multi-tenant
npm run test:coverage                # con coverage report
npm run lint                         # eslint
npm run build                        # tsc → backend/dist

# Supabase
# Aplicar migrations en SQL Editor del dashboard, en orden
# NO usar `supabase db reset` contra Cloud

# Generar secretos
openssl rand -hex 32                 # tokens de 32 bytes (verify, encryption, api key)
openssl rand -hex 64                 # JWT secret (64 bytes)
openssl rand -base64 32              # cualquier secret base64

# Generar hash bcrypt para admin
npx ts-node backend/scripts/generate-admin-hash.ts 'TuPassword'

# Generar hash bcrypt para PIN de cajero POS
npx ts-node backend/scripts/generate-pos-pin-hash.ts '1234'

# Smoke test post-deploy
psql "$SUPABASE_DB_URL" -c "select count(*) from admin_users where role='super_admin'"
curl -i -c /tmp/c.txt -X POST http://127.0.0.1:3001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"...","password":"..."}'
curl -b /tmp/c.txt http://127.0.0.1:3001/api/admin/tenants
```

---

## Apéndice B — Variables de entorno críticas

| Variable | Requerida en | Cómo generar | Notas |
|---|---|---|---|
| `SUPABASE_URL` | prod | dashboard Supabase | |
| `SUPABASE_SERVICE_ROLE_KEY` | prod | dashboard Supabase | NUNCA al cliente |
| `META_VERIFY_TOKEN` | prod | `openssl rand -hex 32` | ≥32 chars |
| `META_APP_SECRET` | prod | Meta dashboard | Para HMAC webhook |
| `META_TOKEN_ENCRYPTION_KEY` | prod | `openssl rand -hex 32` | Hex 64 chars. NO ROTAR |
| `ADMIN_JWT_SECRET` | prod | `openssl rand -hex 64` | ≥64 chars |
| `BACKEND_API_KEY` | opt | `openssl rand -hex 32` | Para CLI/curl |
| `CLOUDFLARE_ALLOWED_DOMAIN` | prod | tu dominio | ej. `seguritech.com` |
| `ADMIN_JWT_TTL_SECONDS` | opt | número | default 28800 (8h) |
| `ADMIN_COOKIE_NAME` | opt | string | prod: `__Host-seguritech_session` |
| `ADMIN_LOGIN_MAX_ATTEMPTS` | opt | número | default 5 |
| `ADMIN_LOGIN_LOCKOUT_MINUTES` | opt | número | default 15 |
| `ADMIN_BCRYPT_COST` | opt | número | default 12 |
| `NODE_ENV` | siempre | `development`/`production` | gobierna bind y validación |

---

**FIN DEL DOCUMENTO MAESTRO**

Si algo de este documento contradice lo que dice el código de `main`, el código gana. Abrir un issue para sincronizar el doc.
