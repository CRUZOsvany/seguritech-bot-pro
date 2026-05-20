# SegurITech Bot Pro

Plataforma de chatbots WhatsApp multi-tenant para negocios locales. Modelo **MSP / agencia privada**: el equipo interno de SegurITech opera el panel; los clientes finales nunca lo tocan.

[![Node.js](https://img.shields.io/badge/Node.js->=18.0.0-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9+-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## Arquitectura

**Backend-only monorepo.** El antiguo frontend Next.js fue eliminado en Sprint E. El panel admin y el simulador de WhatsApp son páginas HTML standalone (vanilla CSS+JS, sin frameworks, sin build) servidas por el mismo Express del backend desde `backend/public/`.

```
seguritech-bot-pro/
├── backend/
│   ├── src/
│   │   ├── domain/                     # Entities, Use Cases, Ports (hexagonal core)
│   │   │   ├── ports/                  # TenantRepository, MetaCredentialsRepository, MessagesRepository...
│   │   │   ├── use-cases/              # HandleMessage, Simulate, CreateTenant, AssignMolde...
│   │   │   ├── services/               # FlowInterpreter, VariableResolver, DynamicSectionResolver
│   │   │   ├── entities/               # flow, BotFlow, User, TenantConfig
│   │   │   └── validators/             # flowSchema (Zod)
│   │   ├── infrastructure/
│   │   │   ├── adapters/               # MetaWhatsAppAdapter, ConsoleNotificationAdapter, ReadlineAdapter
│   │   │   ├── repositories/           # Supabase*Repository (Tenant, BotFlow, Meta, Messages, User)
│   │   │   ├── services/               # TokenCrypto (AES-256-GCM), TenantConfig, MessageLog, ...
│   │   │   └── server/                 # ExpressServer, AdminRouter
│   │   ├── app/                        # ApplicationContainer (DI), BotController
│   │   ├── config/                     # env (Zod-validated), logger (pino)
│   │   ├── Bootstrap.ts
│   │   └── index.ts
│   ├── public/
│   │   ├── panel/                      # HTML del cuarto de mandos (index/new/tenant/messages)
│   │   └── simulator/                  # HTML del simulador WhatsApp (iPhone frame + chat)
│   ├── supabase/migrations/            # 001 → 005
│   └── package.json
├── docker-compose.yml                  # solo servicio `backend`
├── package.json                        # workspaces: ['backend']
└── README.md
```

### Stack

- **Node.js 18+** · TypeScript estricto (`module: node16`, CommonJS de facto)
- **Express 5** · helmet, cors, express-rate-limit
- **Supabase Postgres** · `service_role` key + RLS como defensa en profundidad
- **Pino** logging estructurado
- **Zod** validación de env vars, inputs HTTP, schemas de flow
- **AES-256-GCM** cifrado de tokens Meta vía `TokenCrypto`
- **Meta WhatsApp Cloud API v21** integración multi-tenant
- **Jest** unit + integration tests

---

## Arranque local

```bash
# 1. Variables de entorno
cp backend/.env.example backend/.env
# edita backend/.env con tus credenciales reales

# 2. Install desde la RAÍZ (no desde backend/)
npm install

# 3. Arrancar (bindea a 127.0.0.1:3001 en dev)
npm run dev
```

### URLs

| URL | Descripción |
|---|---|
| http://127.0.0.1:3001/panel/ | Panel admin (lista de clientes) |
| http://127.0.0.1:3001/panel/new.html | Crear cliente nuevo |
| http://127.0.0.1:3001/panel/tenant.html?id=&lt;uuid&gt; | Editar cliente |
| http://127.0.0.1:3001/simulator/&lt;uuid&gt; | Simulador WhatsApp del tenant |
| http://127.0.0.1:3001/health | Liveness check |
| http://127.0.0.1:3001/webhook | Webhook Meta (verify + receive) |
| http://127.0.0.1:3001/api/admin/* | API admin (15 rutas) |

---

## Autenticación del panel admin (Operación Búnker v2)

Tres caminos válidos (basta uno), por orden de preferencia:

1. **Cookie JWT HTTPOnly** — el camino principal del panel HTML. POST a `/api/auth/login` con `{email, password}` emite cookie `seguritech_session` (8h por defecto). Validada server-side con denylist (`admin_sessions_revoked`).
2. **`Cf-Access-Authenticated-User-Email: <user@<CLOUDFLARE_ALLOWED_DOMAIN>>`** — el panel en prod tras Cloudflare Access. Encadena con el JWT, no lo reemplaza.
3. **`x-api-key: <BACKEND_API_KEY>`** — para CLI, curl, scripts.

Si ninguno aplica → **401 Unauthorized**. El antiguo bypass loopback (`NODE_ENV=development` + 127.0.0.1) fue **REMOVIDO** en Sprint F.

### Bootstrap del primer admin user

1. Aplica las migrations 006–010 en Supabase SQL Editor (en orden).
2. Genera el hash bcrypt:
   ```bash
   npx ts-node backend/scripts/generate-admin-hash.ts 'TuPasswordAquí'
   ```
3. Pega el hash en `backend/supabase/migrations/seed_admin_user.sql` y ejecútalo una sola vez en Supabase SQL Editor.
4. Arranca el backend (`npm run dev`) y entra a http://127.0.0.1:3001/panel/login.html con el email seedeado y la password elegida.
5. El primer login pide cambiar contraseña (`must_change_password=true`) antes de emitir la cookie de sesión.

### RBAC

- **super_admin** — acceso total a todos los tenants, audit log, rotación de credenciales Meta.
- **admin_operator** — solo su tenant (`tenant_id`). No puede crear/eliminar tenants ni rotar credenciales.

Rotación de credenciales Meta exige cookie JWT (no x-api-key ni CF Access) — vea `requireCookieSession` en `AuthMiddleware.ts`.

### Bind del server

- **Dev (`NODE_ENV=development`)**: `127.0.0.1:3001` (loopback only)
- **Prod**: `0.0.0.0:3001` — exponer **únicamente** tras Cloudflare Access

---

## Crear un cliente nuevo (flujo manual)

1. `npm run dev` y abre http://127.0.0.1:3001/panel/
2. Click **"+ Nuevo"**
3. Llena nombre, giro, número WhatsApp asignado, mensaje bienvenida. Opcionalmente elige un template (molde).
4. **"Crear cliente"** → redirige al detalle.
5. En el detalle, sección **"Credenciales Meta WhatsApp"**: pega `phone_number_id`, `waba_id`, `display_phone_number`, `access_token`. El token se cifra con `TokenCrypto` (AES-256-GCM) antes de persistir y nunca se devuelve descifrado al panel.
6. **"Activar bot"** desde la sección "Acciones".
7. Click **"Abrir simulador"** para probar sin tocar Meta.
8. Cuando el simulador responde como esperas, configura el webhook en Meta apuntando a `https://tu-dominio/webhook` con el `META_VERIFY_TOKEN` que tienes en `.env`.

---

## Comandos disponibles

```bash
npm run dev              # arranca backend con ts-node
npm run build            # tsc → backend/dist
npm start                # node backend/dist/index.js
npm test                 # jest (unit + integration)
npm run test:coverage    # con coverage report
npm run test:multiTenant # solo multi-tenant suite
npm run lint             # eslint
```

---

## Variables de entorno críticas

Ver `backend/.env.example` para la lista completa. Las más importantes:

| Var | Required en | Comentario |
|---|---|---|
| `SUPABASE_URL` | prod | URL del proyecto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | prod | Bypasea RLS; NUNCA exponer al cliente |
| `META_VERIFY_TOKEN` | prod | Token del webhook Meta, ≥32 chars |
| `META_APP_SECRET` | prod | Para firma HMAC-SHA256 del webhook |
| `META_TOKEN_ENCRYPTION_KEY` | prod | Hex 64 chars (`openssl rand -hex 32`). Cifra access_tokens de tenants. |
| `BACKEND_API_KEY` | opt | Para auth de CLI/curl. Min 16 chars. |
| `CLOUDFLARE_ALLOWED_DOMAIN` | prod (si usas CF Access) | Dominio whitelist, ej. `seguritech.com` |
| `ADMIN_JWT_SECRET` | prod | ≥64 chars (`openssl rand -hex 64`). Firma cookies de sesión. |
| `ADMIN_JWT_TTL_SECONDS` | opt | TTL de cookie. Default 28800 (8h). |
| `ADMIN_COOKIE_NAME` | opt | Default `seguritech_session`. En prod usar `__Host-seguritech_session`. |
| `ADMIN_LOGIN_MAX_ATTEMPTS` | opt | Default 5 (lockout por cuenta o IP). |
| `ADMIN_LOGIN_LOCKOUT_MINUTES` | opt | Default 15. |
| `ADMIN_BCRYPT_COST` | opt | Default 12. |
| `NODE_ENV` | siempre | `development` (bind loopback) / `production` (bind 0.0.0.0) |

---

## Migrations

Las migrations viven en `backend/supabase/migrations/`. Se aplican via:

```bash
# Opción A: Supabase Dashboard → SQL Editor (recomendada para migrations puntuales)
# Opción B: supabase db query --linked -f supabase/migrations/<N>_*.sql --workdir backend
# Opción C: supabase db push --workdir backend  (requiere Docker)
```

Estado actual:
- `001_full_schema.sql` — tablas base (tenants, bot_configurations, messages, etc.)
- `002_bot_flows_engine.sql` — flow_templates + bot_flows (motor configurable)
- `003_backfill_current_node_id.sql` — backfill FSM legacy → flow interpreter
- `004_tenant_meta_credentials.sql` — credenciales Meta por tenant (cifradas)
- `005_tenants_soft_delete.sql` — `deleted_at` para borrado lógico
- `006_state_machine_tenants.sql` — FSM `draft/sandbox/live/paused/archived` (Sprint G)
- `007_admin_audit_log.sql` — append-only audit log de toda mutación del panel
- `008_bot_flow_versions.sql` — versionado de flows + rollback (Sprint H)
- `009_admin_sessions.sql` — denylist JWT + intentos de login (lockout)
- `010_admin_users_2fa.sql` — columnas 2FA TOTP + `must_change_password`
- `seed_admin_user.sql` — seed del primer super_admin (manual, ver bootstrap arriba)

---

## Seguridad

- **Tokens Meta cifrados en BD** con AES-256-GCM (`TokenCrypto`). Nunca en plaintext, nunca devueltos al panel.
- **Webhook con HMAC** SHA-256 verificación de firma Meta (`X-Hub-Signature-256`).
- **Sesiones admin con JWT HS256 + cookie HTTPOnly + SameSite=Strict** (Sprint F). Denylist server-side para logout (`admin_sessions_revoked`).
- **Bcrypt cost=12** para passwords admin. Login con timing-safe comparisons (incluso si el user no existe, gastamos `bcrypt.compare` con un hash dummy).
- **Lockout** 5 fallos por cuenta o IP en 15 min → 429. Doble capa: `express-rate-limit` + tabla `admin_login_attempts`.
- **Audit log append-only** (`admin_audit_log`) de todas las mutaciones del panel. Inmutable por diseño.
- **RBAC** super_admin vs admin_operator. Endpoints sensibles (rotar Meta token) exigen cookie JWT, no x-api-key.
- **CSP** con `script-src-attr 'none'` bloquea event handlers inline (defensa en profundidad contra XSS reflejado).
- **RLS** en todas las tablas como defensa en profundidad (el backend usa `service_role` que la bypasea, pero las políticas protegen contra exposición accidental de la `anon` key).
- **Rate limiting** global 100 req/min + 1000 req/min específico para `/webhook`.
- **Helmet** headers de seguridad por defecto.
- **Bind loopback** en dev evita exposición accidental en LAN.
- **Soft-delete** para tenants — no se rompe FKs en cascada, histórico recuperable.
- **Body limit 64kb** en JSON parser (mitiga DoS por payloads grandes).

### Smoke test post-deploy

```bash
# 1. DB
psql "$SUPABASE_DB_URL" -c "select count(*) from admin_users where role='super_admin'"
# Esperado: count >= 1

# 2. Login
curl -i -c /tmp/c.txt -X POST http://127.0.0.1:3001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"micho@seguritech.com","password":"TuPassword"}'
# Esperado: 200 + Set-Cookie: seguritech_session=...

# 3. Endpoint protegido CON cookie
curl -b /tmp/c.txt http://127.0.0.1:3001/api/admin/tenants
# Esperado: 200 {"tenants":[...]}

# 4. Endpoint protegido SIN cookie
curl http://127.0.0.1:3001/api/admin/tenants
# Esperado: 401

# 5. Brute force (6º intento debe responder 429)
for i in $(seq 1 6); do
  curl -s -o /dev/null -w '%{http_code}\n' -X POST http://127.0.0.1:3001/api/auth/login \
    -H 'Content-Type: application/json' \
    -d '{"email":"micho@seguritech.com","password":"wrong"}'
done

# 6. Audit log
curl -b /tmp/c.txt 'http://127.0.0.1:3001/api/admin/audit-log?limit=10'
```

---

## Tests

```bash
npm test                       # full suite
npm run test:multiTenant       # solo aislamiento multi-tenant
npm run test:coverage          # con coverage
```

Tests viven en `backend/src/tests/` (unit) y `backend/src/tests/integration/`.

---

## License

MIT
