# SegurITech Bot Pro — MAESTRO

> **Qué es este documento.** Qué es el proyecto, por qué está construido así, y bajo qué reglas se trabaja. **No lleva estado ni fechas de progreso** — eso vive en `SEGURITECH_ESTADO_ACTUAL.md`, y el qué sigue en `SEGURITECH_ROADMAP_OPERATIVO.md`.
>
> **Regla de oro:** si esto contradice al código de `main`, gana el código. Si contradice al ESTADO en materia de estado, gana el ESTADO.
> **Cómo se cambia:** una decisión nueva se escribe como ADR en §5 o como regla en §6. Una decisión revertida no se borra: se tacha y se anota la razón.
>
> **Versión:** 3.0 (consolidación 2026-09-08) · Reemplaza al MAESTRO v2.0 y absorbe lo estructural de los planes anexos.

---

## 1. Identidad

**Nombre:** SegurITech Bot Pro, evolucionando a **SegurITech Suite** con el módulo POS.

**Qué es:** una agencia técnica (MSP) que diseña, despliega y **opera** bots de WhatsApp y sistemas de punto de venta para negocios locales de Chilpancingo, Guerrero.

**Qué NO es:** no es un SaaS público de autoservicio. Los clientes finales no abren cuentas, no configuran bots y no acceden a ningún panel. Si una conversación deriva hacia "que el cliente edite su propio flow", esa conversación está en el lugar equivocado.

**Mercado:** papelerías, ferreterías, cerrajerías, pizzerías y similares. Negocios de 1–10 empleados, sin IT propio, donde el dueño contesta WhatsApp desde su celular personal.

**Los cuatro diferenciadores:**

1. **Servicio gestionado.** El cliente paga por un bot operando, no por software. Cero fricción técnica.
2. **Conocimiento local.** El equipo conoce a los dueños por nombre.
3. **Costos fijos bajísimos.** La arquitectura cabe en menos de 10 USD/mes para los primeros 20–30 clientes.
4. **Moldes de industria.** Cada giro tiene un template pre-armado. El tiempo de onboarding es la métrica más crítica del negocio.

**Nombres de producto:** **ChatBot** es la V1 sin IA (lo que se vende hoy). **ChatBot Pro** sería la versión con IA — pausada por decisión, ver ADR-015.

---

## 2. Negocio

**Pricing:** suscripción mensual por bot activo, con descuento anual. Cobro adicional por configuración inicial, número de WhatsApp extra e integraciones especiales.

**Funnel:** referidos locales y visita directa. Nada de marketing digital en V1 — Chilpancingo es un mercado de confianza, no de funnels.

**Métricas que importan:**

- **Tiempo de onboarding por cliente nuevo** — la más crítica. Por encima de 6 horas, el modelo no escala.
- **MRR**, **churn mensual** (más de 5% es problema serio), **mensajes procesados/mes**, **tickets de soporte por cliente/mes** (meta: menos de 2).

---

## 3. Stack

### Backend

| Capa | Tecnología |
|---|---|
| Runtime | Node.js 22 en desarrollo, LTS 20 como objetivo de producción |
| Lenguaje | TypeScript 5.9 estricto, `module: node16` |
| HTTP | Express 5 + helmet + cors + express-rate-limit |
| Validación | Zod 3 — env vars, inputs HTTP, schemas de flow |
| Persistencia | Supabase (Postgres + RLS), `@supabase/supabase-js` 2 |
| Cifrado | AES-256-GCM (`TokenCrypto`) para access tokens de Meta |
| Auth | JWT HS256 + bcryptjs, cookie HTTPOnly con denylist server-side |
| Logging | Pino estructurado |
| Tests | Jest + Supertest |
| Proceso | PM2, o Docker Compose donde aplique |
| API Meta | WhatsApp Cloud API v23 multi-tenant vía `tenant_meta_credentials` |

### Frontend

Vite 8 · React 19 · TypeScript · TanStack Router + Query · Zustand 5 · shadcn/ui + Radix · Tailwind 4 · React Flow (`@xyflow/react`) para el Designer · Dexie.js para el POS offline (cuando llegue) · lucide-react · react-hook-form + Zod.

**Explícitamente descartados:** Next.js (ADR-005), Vercel (regla 10), Redux, Material-UI / Ant Design, CSS-in-JS.

### Infraestructura objetivo

Supabase Cloud (Free → Pro) · Hetzner CX22 en Ashburn (~5 USD/mes) · Cloudflare para DNS, TLS y Access Zero Trust · Backblaze B2 para backups · UptimeRobot + Sentry. Total por debajo de 6 USD/mes al inicio.

---

## 4. Arquitectura

### 4.1. Monorepo

```
seguritech-bot-pro/
├── backend/
│   ├── src/
│   │   ├── domain/          entities · ports · use-cases · services · validators · moulds
│   │   ├── application/     servicios de aplicación (PosAuthService…)
│   │   ├── infrastructure/  adapters · repositories Supabase · server Express · auth
│   │   ├── app/             ApplicationContainer (DI manual) · BotController
│   │   ├── config/          env (Zod) · logger (Pino)
│   │   └── Bootstrap.ts
│   ├── public/              panel HTML legacy · simulador · app/ (build de Vite)
│   ├── scripts/             seeds, generadores de hash, validador de flows
│   └── supabase/migrations/
├── frontend/                Vite + React; build va a backend/public/app/
├── docs/                    documentación técnica (ver docs/INDEX.md)
├── .claude/                 MAESTRO · ESTADO · ROADMAP + referencia
├── CLAUDE.md                punto de entrada para cualquier sesión
└── package.json             workspaces: ['backend', 'frontend']
```

`print-agent/` será un tercer workspace cuando llegue la impresión ESC/POS.

### 4.2. Capas hexagonales

```
DOMAIN            entities · ports · use-cases · services · validators
   ↑ implementa
APPLICATION       orquestación entre use-cases
   ↑ usa
INFRASTRUCTURE    adapters · repositories · auth · server
   ↑ inicializa
APP               ApplicationContainer (composition root) · BotController
   ↑ arranca
Bootstrap.run()
```

**Regla de oro:** `domain` no importa nada de `infrastructure` ni de `application`. Un `import` que apunte hacia afuera desde domain es un bug, no una excepción.

### 4.3. Core + Molde + Traje

Aplica igual al bot y al POS:

- **Core invariante (~90%)** — motor de flows, motor de ventas, inventario, auth.
- **Molde de industria (~8%)** — `domain/moulds/` y flows JSON por giro.
- **Traje del tenant (~2%)** — `bot_flows`, `pos_tenant_config`, `tenant_service_directory`.

Código específico de un cliente escrito directamente en el dominio es un disparo al pie. Va en el molde o en la config del tenant.

**Ojo con la ambigüedad de "molde":** hay dos cosas distintas con ese nombre. El **molde de POS** (`domain/moulds/*.config.ts`) siembra categorías y productos. El **flow de WhatsApp** (`bot_flows`, JSON por tenant) es la conversación. Un giro puede tener uno sin el otro.

### 4.4. Las tres experiencias

| Experiencia | Usuario | UI |
|---|---|---|
| Panel admin | Equipo SegurITech | CRUD y dashboards, React liviano |
| Bot Designer | Equipo SegurITech | Canvas React Flow + inspector |
| POS | Cajero del cliente | PWA offline-first en tablet |

Comparten backend, cookie de sesión y deploy. Cada una en su carpeta bajo `frontend/src/apps/`.

### 4.5. El motor de flows

`FlowInterpreter` ejecuta un grafo de nodos JSON por tenant, sin tocar código. **14 tipos de nodo** y **10 condiciones de transición** — la lista exacta y cuáles están realmente en uso está en `ESTADO` §3.1, porque cambia.

Dos propiedades del motor que conviene tener presentes al diseñar un flow:

- **Las transiciones se resuelven por especificidad, no por orden** (ADR-016). El orden del array solo desempata entre transiciones del mismo nivel; si empatan palabras clave a destinos distintos, el bot pregunta cuál (B-02, Fase 5 del Studio).
- **El estado conversacional persiste en la base** (`bot_users.current_node_id` y `context`), no en memoria. Sobrevive a reinicios del proceso.

---

## 5. ADRs

Decisiones que no se rediscuten cada sprint. Si alguien las cuestiona, primero lee por qué se tomaron.

**ADR-001 · Modelo MSP, no SaaS público.** Los clientes finales nunca acceden al panel. Simplifica auth a dos roles, elimina onboarding self-service y reduce superficie de ataque. Solo se revierte si el negocio cambia de modelo.

**ADR-002 · Supabase como única persistencia.** Sin Redis, sin Mongo, sin SQLite. El cache de `TenantConfig` es in-process con `node-cache`. Si algún día hace falta cache distribuido, se evalúa entonces y con ADR.

**ADR-003 · `service_role` + RLS como defensa en profundidad.** El backend bypassea RLS con `service_role`; el aislamiento multi-tenant real lo dan los `WHERE tenant_id = ?` en los repositorios. Las políticas RLS protegen si algún día se expone una `anon` key.

**ADR-004 · Cookie HTTPOnly con JWT, nunca `localStorage`.** HTTPOnly mitiga XSS, `SameSite=Strict` mitiga CSRF, la denylist server-side hace que el logout sea real.

**ADR-005 · Fuera Next.js.** SSR, SSG, edge y SEO no aportan nada a apps internas. Eliminado en Sprint E, no se reintroduce.

**ADR-006 · Frontend con Vite + React como SPA pura.** Bundle estático servido por el mismo Express. Una URL, una cookie, cero CORS.

**ADR-007 · React Flow como canvas del Designer.** Estándar de facto (n8n, Typebot, Flowise). Zoom, pan, minimap y undo nativos.

**ADR-008 · POS como PWA con Dexie.** No Electron (100 MB por caja), no React Native (el target no es móvil nativo). IndexedDB aguanta catálogos de hasta 10k productos.

**ADR-009 · Print agent local en Node empaquetado con `pkg`.** Imprimir ESC/POS desde el navegador es inviable y WebUSB tiene fricción extrema. Mini-servicio en `127.0.0.1:9100`.

**ADR-010 · Idempotencia del POS por identificador generado en cliente.** Sin esto, una sincronización con red intermitente duplica ventas. La columna real es `pos_sales.client_id`, con `unique(tenant_id, client_id)` server-side; un conflicto devuelve la venta existente, no un error.

**ADR-011 · CFDI vía PAC externo, nunca implementación propia.** El SAT regula y cambia el formato. Se integra Facturama o equivalente.

**ADR-012 · `HandleMessageUseCase` legacy eliminado. CUMPLIDO.** Sin flow asignado, el bot responde "en mantenimiento". Nunca hay fallback a la FSM hardcodeada.

**ADR-013 · Los test cases del designer son gate de publicación.** Cuando existan, no se activa una versión de `bot_flow` con casos en rojo. Es el CI/CD de los flows de negocio.

**ADR-014 · Aislamiento de la base de conocimiento por tenant.** `tenant_knowledge_chunks` existe reservada para la fase de IA. Cualquier consumo suyo exige `tenant_id` obligatorio y RLS, sin excepción.

**ADR-015 · La IA queda pausada; primero se exprime el motor determinista.** El plan de "secretaria digital" (`SEGURITECH_AI_SECRETARIA_PLAN.md`) está aprobado y en pausa deliberada. La razón: el motor de flows está subutilizado y el cumplimiento de Meta no está cerrado. Cuando se retome, los guardrails del plan son obligatorios — la IA nunca escribe SQL ni inventa precios, toda mutación pasa por un caso de uso validado, timeout corto con fallback a flow o humano, y feature flag apagado por default.

**ADR-016 · Las transiciones se resuelven por especificidad, no por orden de array.** `button` 100 · `list_item` 90 · `call_permission_*` 85 · `catalog_found` 80 · `service_directory_match` 70 · `list_item_any` 60 · `keyword` 50 · `catalog_not_found` 20 · `default` 0. El orden del array desempata solo dentro del mismo nivel, excepto palabras clave a destinos distintos: desde B-02 (Fase 5 del Studio) el bot pregunta cuál. El ranking se derivó para preservar comportamiento ya testeado, no se inventó.

**ADR-017 · El buscador de texto libre del bot lee `pos_products`, no `catalog_items`.** `pos_products` es el inventario real y completo. `catalog_items` se queda para las listas fijas cortas de `send_list`. No se migra ni se borra; simplemente `CatalogSearchService` no la usa como fuente.

---

## 6. Reglas operativas no negociables

Estas existen porque romperlas dolió.

1. **`npm install` solo desde la raíz del monorepo.** Desde un subdirectorio se desincroniza el lockfile.
2. **Nunca `supabase db reset` contra Cloud.** Es destructivo y no hay undo.
3. **Las credenciales se piden interactivamente.** Nunca embebidas en prompts, nunca en logs. Aplica igual a escribir prompts para un agente que a código de producción.
4. **`BACKEND_API_KEY` nunca llega al browser.**
5. **`ADMIN_JWT_SECRET` en producción es obligatorio y de 64 caracteres o más** (`openssl rand -hex 64`). En dev se permite efímero, en prod nunca.
6. **`META_TOKEN_ENCRYPTION_KEY` no se rota jamás** una vez que hay tokens cifrados en la base. Rotarla exige descifrar todo, cambiar la llave y recifrar.
7. **El cliente no toca el panel.** Si alguien lo pide, se refiere a ADR-001.
8. **No se publican flows sin pasar sus test cases** (desde que ADR-013 esté implementado).
9. **No se introduce un proveedor externo nuevo sin ADR explícito** en §5.
10. **El frontend nunca se deployea a Vercel.**
11. **`process.env.NODE_ENV` no se lee desde el dominio.** Solo desde `config/env.ts`; el resto consume `config.isProduction` / `config.isDevelopment`.
12. **Todo endpoint nuevo bajo `/api/admin/*` registra sus mutaciones en el audit log.** Append-only, sin updates ni deletes.
13. **Los secretos de producción se generan en el servidor con `openssl`, nunca con un LLM.**
14. **`curl` desde Git Bash en Windows contra endpoints con acentos: `--data-binary @archivo.json`, nunca `-d '...'` inline.** El inline corrompe UTF-8 en esa capa de shell y ensucia datos reales en Supabase.
15. **`tenantId` siempre, como primer argumento.** Sin excepción. Cualquier tabla nueva sin `tenant_id` y sin RLS no se mergea.
16. **Toda migración mergeada se aplica el mismo día.** Mientras el CLI de Supabase no esté enlazado, se pega a mano en el SQL Editor y se verifica con una lectura REST. Esta regla existe porque ya pasó dos veces que una migración quedara en `main` sin aplicar, una de ellas con un P0 latente.

---

## 7. Flujo de trabajo

### 7.1. Una sola fuente por tipo de información

| Pregunta | Documento |
|---|---|
| ¿Qué es y por qué está así? | `MAESTRO` (este) |
| ¿Cómo está hoy? | `ESTADO` |
| ¿Qué sigue y en qué orden? | `ROADMAP` |
| ¿Cuál es el shape real de un endpoint admin? | `CONTRATOS_API_ADMIN.md`, y el router si hay duda |
| ¿Cómo se despliega? | `docs/deployment/RUNBOOK_PRODUCCION.md` |
| ¿Cómo se diseña un flow? | `docs/whatsapp/DISENO_DE_CHATBOTS.md` |

Un dato vive en **un** documento. Los demás lo enlazan, no lo copian. Cuando dos documentos afirman lo mismo con distintas palabras, uno de los dos se va a quedar atrás — y no se sabrá cuál.

### 7.2. Rama, commit, PR

- **Una tarea, una rama corta, un PR pequeño.** Prefijos: `feat/`, `fix/`, `chore/`, `docs/`.
- Conventional commits.
- Ramas siempre nacen de `main` actualizado. Una rama con más de una semana de vida se rebasa o se abandona: `feature/sprint-6-new-tenant` llegó a estar 145 archivos atrasada y mergearla habría revertido meses.
- **Al mergear un PR, se borra la rama** — local y remota. Sin excepción; así no se acumulan 28 ramas muertas.
- `main` está protegida: PR obligatorio, CI en verde, sin force push.

### 7.3. Gates de CI

El workflow corre, en orden: install → lint backend (no bloqueante) → **type-check backend** → **tests backend** → **build backend** → lint frontend (no bloqueante) → **type-check frontend** → **build frontend** → coverage.

Los pasos en negrita bloquean el merge. Lint es advertencia a propósito: hay warnings preexistentes y convertirlos en error de golpe pararía el trabajo.

### 7.4. Definición de terminado

Un cambio está terminado cuando cumple **todas**:

1. Tests nuevos en el mismo commit que el código nuevo. Una pieza de dominio sin test unitario no se marca hecha.
2. Type-check y tests en verde localmente antes de abrir el PR.
3. Si tocó la base: migración aplicada y **verificada** el mismo día (regla 15).
4. Si cambió una decisión o una regla: ADR o regla actualizada en este documento.
5. Si cambió el estado del proyecto: entrada en la bitácora del `ESTADO`.
6. Rama borrada tras el merge.

### 7.5. El ritual de fin de trabajo

Al cerrar una fase completa, no un PR suelto:

1. Marcar lo cerrado en el `ROADMAP`.
2. Actualizar las secciones afectadas del `ESTADO` **con verificación real**, no con lo que se recuerda haber hecho.
3. Escribir la entrada en la bitácora del `ESTADO`: qué cambió y por qué.
4. Una decisión revertida se tacha y se explica; no se borra.

### 7.6. Trabajar con agentes de codificación

`CLAUDE.md` en la raíz es el punto de entrada. Toda sesión nueva lo lee primero.

- **Verificar antes de afirmar.** Este proyecto ya pagó el costo de reportes que describían ramas y hallazgos sin abrirlos: una descripción incorrecta casi provoca un merge que habría revertido meses de trabajo. Un hallazgo sin evidencia se marca como no verificado.
- **Nunca inventar una firma de puerto o entidad.** Antes de usar un repositorio o una entidad, abrir el archivo. Si el método no está, es tarea nueva a diseñar, no un método que "seguro existe en otro lado".
- **Un caso de uso, un archivo, un test.**

---

## 8. Glosario

| Término | Definición |
|---|---|
| **MSP** | Managed Service Provider. SegurITech opera los bots y POS por cuenta del cliente |
| **Tenant** | El negocio cliente. Papelería, ferretería, cerrajería… |
| **Bot flow** | Grafo dirigido de nodos que define la conversación. JSON en `bot_flows` |
| **Molde** | Template pre-armado por industria. Ojo con la doble acepción, ver §4.3 |
| **Traje** | La customización del tenant sobre el molde |
| **Cuarto de mandos** | El panel admin |
| **Operación Búnker v2** | El endurecimiento de la auth admin: JWT, RBAC, audit log, lockout, denylist |
| **FlowInterpreter** | El servicio de dominio que ejecuta un flow contra un mensaje entrante |
| **PAC** | Proveedor Autorizado de Certificación de CFDI. En México: Facturama, SW, Solución Factible |
| **ESC/POS** | Protocolo Epson de comandos para impresoras térmicas |
| **Corte X / Z** | Reportes de caja. X intermedio sin cerrar; Z cierre del día que resetea contadores |
| **DEC-nn** | Decisión de producto de la auditoría 2026-08-26. Registro en `AUDITORIA_2026-08-26_TRACKING.md` |

---

## 9. Apéndice — comandos

```bash
# Desarrollo (siempre desde la raíz)
npm install
npm run dev                                   # backend en 127.0.0.1:3001
npm test                                      # suite completa
npm run test:multiTenant                      # solo aislamiento multi-tenant
npm run type-check --workspace backend
npm run type-check --workspace frontend
npm run build                                 # frontend build:panel + backend build

# Secretos (en el servidor, nunca con un LLM)
openssl rand -hex 32                          # verify token, encryption key, api key
openssl rand -hex 64                          # ADMIN_JWT_SECRET

# Hashes
npx ts-node backend/scripts/generate-admin-hash.ts 'password'
npx ts-node backend/scripts/generate-pos-pin-hash.ts '1234'

# Flows
npx ts-node backend/scripts/validate-flow.ts <archivo.json>
npx ts-node backend/scripts/persist-flow.ts

# Higiene de ramas
git branch --merged main | grep -v '^\*\|main' | xargs -r git branch -d
git fetch --prune
```

## 10. Apéndice — variables de entorno críticas

| Variable | Requerida en | Cómo se genera | Notas |
|---|---|---|---|
| `SUPABASE_URL` | prod | Dashboard | |
| `SUPABASE_SERVICE_ROLE_KEY` | prod | Dashboard | Bypassea RLS. Nunca al cliente |
| `META_VERIFY_TOKEN` | prod | `openssl rand -hex 32` | ≥32 chars |
| `META_APP_SECRET` | prod | Meta dashboard | Firma HMAC del webhook |
| `META_TOKEN_ENCRYPTION_KEY` | prod | `openssl rand -hex 32` | Hex de 64. **No rotar** (regla 6) |
| `ADMIN_JWT_SECRET` | prod | `openssl rand -hex 64` | ≥64 chars |
| `BACKEND_API_KEY` | opcional | `openssl rand -hex 32` | ≥32 chars. Solo CLI y scripts |
| `CLOUDFLARE_ALLOWED_DOMAIN` | prod con CF Access | — | Dominio en whitelist |
| `ADMIN_JWT_TTL_SECONDS` | opcional | — | Default 28800 (8 h) |
| `ADMIN_COOKIE_NAME` | opcional | — | En prod: `__Host-seguritech_session` |
| `ADMIN_LOGIN_MAX_ATTEMPTS` | opcional | — | Default 5 |
| `ADMIN_LOGIN_LOCKOUT_MINUTES` | opcional | — | Default 15 |
| `ADMIN_BCRYPT_COST` | opcional | — | Default 12 |
| `HANDOFF_PAUSE_MINUTES` | opcional | — | Pausa del bot tras handoff humano |
| `NODE_ENV` | siempre | — | Gobierna el bind y la validación de secretos |

---

**Si algo de este documento contradice al código de `main`, gana el código.** Abre un PR para sincronizarlo.
