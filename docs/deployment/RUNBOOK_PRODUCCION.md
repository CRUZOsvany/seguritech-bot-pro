# Runbook de producción — SegurITech Bot Pro

> Reemplaza a [`docs/archive/DEPLOYMENT_STEPS_OBSOLETO.md`](../archive/DEPLOYMENT_STEPS_OBSOLETO.md).
> Escrito y verificado contra `main` el 2026-08-02. Todo comando, nombre de archivo
> o ruta citado aquí fue verificado leyendo el repo. Donde no se pudo verificar,
> queda marcado explícitamente **[PENDIENTE DE VERIFICAR]** en vez de inventado.
>
> Este runbook NO desbloquea al primer cliente por sí solo — lo que lo desbloquea
> es la verificación de Meta Business (§5) y tener las migraciones aplicadas en
> Supabase Cloud (§1). Esto solo deja el terreno operativo listo para ese momento.

---

## §0 — Precondiciones

Checklist de lo que debe existir **antes** de arrancar. Los tres primeros son
bloqueadores externos con tiempo de espera propio — no dependen de ti tecleando
comandos, dependen de terceros aprobando algo.

- [ ] **Cuenta Supabase Cloud** con un proyecto activo en la región **us-east-2 (Ohio)**.
      ⚠️ Ver alerta operativa vigente: al 2026-08-02 el proyecto histórico
      (`aakbliewttiuqhyfyqwn.supabase.co`) dejó de resolver por DNS (NXDOMAIN).
      Antes de seguir este runbook, confirma en el dashboard de Supabase si el
      proyecto sigue existiendo o si hay que crear uno nuevo y repetir §1 completo.
      *Bloqueador externo — depende del estado de tu cuenta Supabase, no de este repo.*
- [ ] **VPS Hetzner CX22** (o equivalente) en **Ashburn, US East** — no en Alemania.
      La región se elige para minimizar latencia contra Supabase Ohio, no por
      cercanía al equipo. *Bloqueador externo — aprovisionamiento manual en Hetzner.*
- [ ] **Dominio en Cloudflare** con la zona ya delegada (nameservers apuntando a Cloudflare).
- [ ] **Verificación de Meta Business APROBADA.** Sin esto, el número de WhatsApp
      de producción no puede recibir tráfico real aunque todo lo demás esté listo.
      *Bloqueador externo con cola de revisión de Meta — normalmente el paso más lento
      de toda la lista, arráncalo primero.*
- [ ] Acceso SSH ya configurado al VPS (clave, no password).
- [ ] `git clone` del repo disponible en el VPS (o vía CI/CD — este runbook asume deploy manual).

---

## §1 — Migraciones en Supabase Cloud

**Aplícalas por el SQL Editor del dashboard de Supabase, en orden estricto, una
por una, verificando cada una antes de pasar a la siguiente.** Los 17 archivos
viven en `backend/supabase/migrations/`, con estos nombres exactos:

```
001_full_schema.sql
002_bot_flows_engine.sql
003_backfill_current_node_id.sql
004_tenant_meta_credentials.sql
005_tenants_soft_delete.sql
006_state_machine_tenants.sql
007_admin_audit_log.sql
008_bot_flow_versions.sql
009_admin_sessions.sql
010_admin_users_2fa.sql
011_pos_module_bootstrap.sql
012_tenant_services.sql
013_bot_flows_channel.sql
014_backfill_services.sql
015_bot_flows_draft.sql
016_whatsapp_flows.sql
017_human_handoff_pause.sql
```

### ⚠️ Advertencias que van literales

- **`supabase db reset` está PROHIBIDO contra Cloud.** Es destructivo y sin
  undo — borra y recrea el schema completo. El script `supabase:reset:local`
  de `backend/package.json` existe únicamente para Supabase local con Docker;
  nunca lo corras apuntando a este proyecto Cloud.
- **`CREATE POLICY IF NOT EXISTS` no existe en PostgreSQL.** Si necesitas
  reaplicar una policy a mano en el SQL Editor (por ejemplo por un typo),
  el patrón correcto — el que ya usan las 17 migraciones — es:
  ```sql
  drop policy if exists nombre_policy on public.tabla;
  create policy nombre_policy on public.tabla ...;
  ```
- Copia y pega el contenido de cada archivo **tal cual está en el repo**. No
  los resumas ni los reescribas de memoria: varios tienen `drop trigger if
  exists` + `create trigger` antes del DDL principal, y el orden importa.

### Seeds — NO son migraciones numeradas

`backend/supabase/migrations/seed_admin_user.sql` y `seed_pos_papeleria_pilot.sql`
viven en la misma carpeta pero van **después** de las 17, por separado:

- `seed_admin_user.sql`: crea el primer `admin_users` con rol `super_admin` para
  poder entrar al panel por primera vez. Sin esto no hay forma de hacer login.
- `seed_pos_papeleria_pilot.sql`: siembra el tenant piloto del módulo POS
  (Sprint 5.1a). Solo necesario si vas a operar el piloto de papelería.

### Verificación post-migración

Después de correr las 17 + los 2 seeds, valida en el SQL Editor:

```sql
-- Confirma que 017 corrió: la columna debe existir.
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'bot_users'
  and column_name = 'human_paused_until';

-- Confirma que 012 corrió y el super_admin quedó sembrado.
select count(*) from public.tenant_services;
select email, role from public.admin_users where role = 'super_admin';

-- Confirma que 004 corrió (tabla de credenciales Meta por tenant).
select to_regclass('public.tenant_meta_credentials');
```

Si `to_regclass(...)` devuelve `NULL`, esa tabla no existe — la migración
correspondiente no corrió y hay que revisarla antes de avanzar. No confíes en
`supabase migration list --linked` para saber qué corrió: si las migraciones
se aplicaron a mano por el SQL Editor (como es el flujo de este runbook), esa
tabla de tracking no se actualiza — verifica siempre contra el schema real.

---

## §2 — Generación de secretos

Todas las longitudes salen del schema Zod de `backend/src/config/env.ts` — no
de memoria. **No pongas valores reales en ningún doc, log o commit.**

| Variable | Requisito (schema Zod) | Comando |
|---|---|---|
| `META_VERIFY_TOKEN` | `min(32)` caracteres | `openssl rand -hex 32` |
| `META_APP_SECRET` | `min(32)` caracteres | `openssl rand -hex 32` |
| `META_TOKEN_ENCRYPTION_KEY` | **exactamente** `length(64)` — 32 bytes en hex | `openssl rand -hex 32` |
| `ADMIN_JWT_SECRET` | `min(64)` caracteres | `openssl rand -hex 64` |
| `BACKEND_API_KEY` | `min(16)` caracteres | `openssl rand -hex 32` |

⚠️ **`META_TOKEN_ENCRYPTION_KEY` NO se rota nunca** una vez que hay
`access_token` de tenants cifrados en `tenant_meta_credentials`
(`backend/src/infrastructure/services/TokenCrypto.ts` usa AES-256-GCM con esta
clave — si la cambias, todo lo cifrado con la clave anterior queda
indescifrable y hay que re-vincular cada tenant a Meta desde cero). Genérala
una sola vez y guárdala en un password manager, no solo en el `.env` del VPS.

`ADMIN_JWT_TTL_SECONDS`, `ADMIN_LOGIN_MAX_ATTEMPTS`, `ADMIN_LOGIN_LOCKOUT_MINUTES`,
`ADMIN_BCRYPT_COST`, `HANDOFF_PAUSE_MINUTES` y `ADMIN_POS_COOKIE_NAME` tienen
default razonable en el schema — no son secretos, cópialos de
`backend/.env.example` tal cual salvo que quieras un valor distinto.

---

## §3 — Provisión del VPS

**Recomendado: PM2 sobre Node nativo, no Docker**, aunque `backend/Dockerfile`
es multi-stage y funcional (3 stages: `build-frontend` → `build-backend` →
`runtime`, todos en `node:20-alpine`, imagen final con `USER node` y healthcheck
sobre `/health`). La razón: PM2 + `ecosystem.config.js` ya está en el repo,
configurado con log rotation y restart automático, y es más simple de operar
para un VPS único sin orquestador — Docker aquí añadiría una capa de
indirección (red del contenedor, volúmenes para logs) sin un beneficio real
todavía. Si en el futuro se despliega en más de un VPS o con un orquestador,
Docker vuelve a ser la opción correcta.

### Ruta recomendada — PM2

```bash
# Usuario no-root
adduser seguritech
usermod -aG sudo seguritech
# (cambiar a ese usuario para todo lo siguiente)

# Firewall
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable

# Node 20 (coincide con CI y con node:20-alpine del Dockerfile)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Clonar y construir
git clone <url-del-repo> seguritech-bot-pro
cd seguritech-bot-pro
npm ci                          # SOLO desde la raíz, nunca dentro de backend/ o frontend/
npm run build                   # build:panel (frontend) + build (backend), en ese orden

# .env de producción en backend/.env (NUNCA en el repo)
# — completar con los secretos generados en §2 y las credenciales de Supabase de §0/§1

cd backend
mkdir -p logs                   # ecosystem.config.js escribe logs/err.log y logs/out.log
pm2 start ecosystem.config.js
pm2 install pm2-logrotate       # sin esto, logs/ crece sin límite
pm2 startup                     # imprime un comando sudo — ejecútalo tal cual lo muestra
pm2 save
```

Verificación:

```bash
pm2 status                      # el proceso "seguritech-bot" debe estar "online"
pm2 logs seguritech-bot --lines 50
curl http://127.0.0.1:3001/health   # {"status":"ok",...}
```

### Alternativa — Docker

```bash
docker build -t seguritech-bot-pro -f backend/Dockerfile .
docker run -d --name seguritech-bot -p 3001:3001 --env-file backend/.env seguritech-bot-pro
```

El healthcheck del propio `Dockerfile` (`GET /health` cada 30s) ya queda activo
con este `docker run`. Usa esta ruta solo si ya tienes una razón operativa para
containerizar (más de un host, CI/CD con registry, etc.) — para un VPS único
hoy, PM2 es la ruta recomendada arriba.

---

## §4 — Cloudflare

1. DNS: registro `A` (o `CNAME` si usas un proxy intermedio) apuntando al VPS.
   Activa el proxy naranja de Cloudflare para el dominio del panel.
2. **Zero Trust Access** protegiendo `/app` (el panel admin). Configura la
   política de acceso con el dominio de email permitido — debe coincidir con
   `CLOUDFLARE_ALLOWED_DOMAIN` en `backend/.env` (ej. `seguritech.com`), que es
   lo que el backend valida vía el header `Cf-Access-Authenticated-User-Email`
   que Cloudflare inyecta tras el OAuth
   (`backend/src/config/env.ts` / `backend/src/infrastructure/auth/AuthMiddleware.ts`).
3. **En negritas y sin ambigüedad: el endpoint `/webhook` DEBE quedar público,
   fuera de la política de Zero Trust Access.** Si Access cubre `/webhook`,
   Meta no puede entregar mensajes entrantes (Meta no pasa por el OAuth de
   Cloudflare) y el bot queda muerto para todo tráfico real aunque el resto
   del sistema esté sano. Configura la política de Access con un path exception
   explícito para `/webhook` y `/webhook/*`.

---

## §5 — Meta / WhatsApp

1. En Meta App Dashboard → WhatsApp → Configuration: **Webhook URL** =
   `https://<tu-dominio>/webhook`, **Verify Token** = el valor de
   `META_VERIFY_TOKEN` (§2).
2. El handshake `GET /webhook` (`backend/src/infrastructure/server/ExpressServer.ts`,
   delega en `metaAdapter.verifyWebhook`) debe responder con el `hub.challenge`
   que Meta envía, o la suscripción del webhook falla en el dashboard de Meta.
3. Suscribe el evento `messages`.
4. **Las credenciales por tenant (`phone_number_id`, `waba_id`, `access_token`)
   viven cifradas en la tabla `tenant_meta_credentials` (migration 004), NO en
   el `.env` del backend.** El `.env` solo tiene los secretos globales de la
   App de Meta (`META_APP_SECRET`, `META_VERIFY_TOKEN`,
   `META_TOKEN_ENCRYPTION_KEY`) porque esos pertenecen a la App, no al tenant.
   Cargar credenciales de un tenant nuevo es un paso de datos (vía script o
   panel), no de configuración de entorno.

---

## §6 — Seed de los pilotos (CerraCruz + Cerrajería Tony)

Script: `backend/scripts/seed-cerrajerias.ts`.

- **Es idempotente y re-ejecutable.** Solo hace upserts/updates filtrados por
  `tenant_id`; correrlo dos veces no duplica nada.
- **NO crea tenants.** CerraCruz y Cerrajería Tony deben existir ya en el panel
  (creados a mano) antes de correr el script — si resuelve 0 tenants para el
  patrón `ilike` de alguno, ese tenant falla con error explícito y el script
  sigue con el resto (no aborta todo por uno).
- **4 env vars requeridas:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (las
  dos de siempre) + `CERRACRUZ_OWNER_WHATSAPP` y `TONY_OWNER_WHATSAPP` — el
  WhatsApp de cada dueño. Es PII: por eso va solo por variable de entorno,
  nunca hardcodeado en el script ni en un doc.

PowerShell (IntelliJ en Windows — el header del script trae sintaxis bash que
no corre tal cual en esta terminal):

```powershell
$env:SUPABASE_URL = "https://tu-proyecto.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY = "tu-service-role-key"
$env:CERRACRUZ_OWNER_WHATSAPP = "+52..."
$env:TONY_OWNER_WHATSAPP = "+52..."
cd backend
npx ts-node -r tsconfig-paths/register scripts/seed-cerrajerias.ts
```

Alternativa bash / WSL2 (la que trae el header del script):

```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
CERRACRUZ_OWNER_WHATSAPP=... TONY_OWNER_WHATSAPP=... \
  npx ts-node -r tsconfig-paths/register scripts/seed-cerrajerias.ts
```

**Nota de diseño que hay que recordar:** `{{nombre_negocio}}` **no se
re-resuelve** dentro de los valores de `bot_configurations`. El
`VariableResolver` (`backend/src/domain/services/VariableResolver.ts`) hace
una sola pasada por texto: sustituye cada `{{token}}` una vez y no vuelve a
escanear el valor sustituido. Por eso `welcomeMessage`, `menuMessage`, etc. en
`seed-cerrajerias.ts` llevan el nombre del negocio escrito literal ("Bienvenido
a CerraCruz...") en vez de `{{nombre_negocio}}` — si se pusiera la variable
ahí, saldría literal `{{nombre_negocio}}` en el mensaje real. Los nodos del
flow JSON (`backend/scripts/cerrajeria-flow.json`) sí pueden usar
`{{nombre_negocio}}` porque ese texto lo resuelve el intérprete del flow en
runtime, no el seed.

---

## §7 — Smoke test post-deploy

Secuencia mínima, en orden:

```bash
curl https://<tu-dominio>/health
# {"status":"ok","timestamp":"..."}
```

Login admin + verificación del contrato `/api/admin/tenants` — usa
`scripts/nivel3-auth-smoke.ps1` (raíz del repo, PowerShell 7+). Pide la
password de forma segura (`Read-Host -AsSecureString`, no queda en el
historial), hace login → `/api/auth/me` → `/api/admin/tenants` → logout:

```powershell
pwsh scripts/nivel3-auth-smoke.ps1
```

Handshake del webhook (reemplaza `<token>` por `META_VERIFY_TOKEN` real, sin
pegarlo en ningún doc):

```bash
curl "https://<tu-dominio>/webhook?hub.mode=subscribe&hub.verify_token=<token>&hub.challenge=1234"
# Debe responder "1234"
```

QA manual: entra al simulador del panel (`/app`, sección simulador) y corre el
flow de cerrajería completo (bienvenida → menú → escape_to_human) contra un
tenant sembrado por §6.

⚠️ `scripts/smoke-test.sh` **existe en el repo pero está desactualizado** —
referencia un script npm `dev:backend` que no existe (el real es `dev`, ver
`package.json` raíz) y pega contra `/webhook/test-tenant`, un tenant que no
existe en ningún seed. **[PENDIENTE DE VERIFICAR / arreglar]** antes de
depender de él — no lo uses como smoke test hasta corregirlo.

---

## §8 — Rollback

- **Proceso caído o con bug:** `pm2 restart seguritech-bot`. Si el bug viene
  del último deploy de código, `git checkout <sha-anterior>`, `npm ci`,
  `npm run build`, `pm2 restart seguritech-bot` de nuevo.
- **Flow de un tenant roto tras una edición en el designer:** la tabla
  `bot_flow_versions` (migration 008) guarda un histórico con
  `version_number` monótono ascendente por `flow_id` — cada upsert sobre
  `bot_flows` crea una fila ahí (responsabilidad del repositorio, no de un
  trigger). **Ya existe un endpoint dedicado**, no hace falta tocar SQL a mano:
  ```
  POST /api/admin/tenants/:id/flows/:flowId/rollback
  Body: { "versionNumber": <int positivo> }
  ```
  (`backend/src/infrastructure/server/admin/flowsRouter.ts`, requiere rol
  `super_admin`, queda auditado en `audit.log` como `flow.rollback`). Lista
  las versiones disponibles primero con
  `GET /api/admin/tenants/:id/flows/:flowId/versions` para saber qué
  `versionNumber` restaurar.
- **Lo que NO se puede deshacer:** las migraciones ya aplicadas contra Cloud.
  No hay `down` migration en este repo — cualquier cambio de schema en
  producción es de ida. Si una migración nueva sale mal, la corrección es una
  migración siguiente que arregle el estado, no un revert del DDL ya corrido.
