# Runbook de Producción — SegurITech Bot Pro

> **Qué es esto.** El CÓMO, con comandos reales para copiar y pegar. El QUÉ y EN QUÉ ORDEN vive en `.claude/SEGURITECH_ROADMAP_OPERATIVO.md` (Camino B, Camino C). Este documento expande esa checklist a pasos ejecutables — no la reemplaza, la complementa.
>
> **Versión:** 1.0 — 2026-08-20
> **Arquitectura decidida** (no inventada aquí, ya estaba en el roadmap): VPS Hetzner + nginx (reverse proxy) + PM2, **no** Docker/docker-compose en producción (ese `docker-compose.yml` del repo sirve para probar el build localmente, no es el camino de deploy elegido) y **no** Cloudflare Tunnel en producción (`cloudflared` es solo para el túnel de desarrollo mientras Meta verifica — ver Camino B, ítem "Webhook público... HTTPS válido").
> **Regla del proyecto:** los secretos se generan y se pegan interactivamente, **nunca** se le piden a un LLM ni se los pega uno en un prompt (regla operativa 3 del MAESTRO). Cada comando `openssl rand` de abajo corre tú mismo en el VPS.

---

## 0. Antes de empezar

Bloqueadores que deben estar resueltos (si no, para aquí y resuélvelos primero — ver `.claude/SEGURITECH_ESTADO_ACTUAL.md`):

- [ ] Supabase Cloud responde (alerta 0-bis resuelta, verificar con un `curl` rápido al proyecto).
- [ ] Tienes acceso de pago a Hetzner Cloud y a un registrador de dominios.
- [ ] Tienes (o vas a crear) una cuenta Cloudflare gratuita para el dominio.
- [ ] La verificación de Meta Business está en curso (Camino A) — no bloquea este runbook, corre en paralelo.

---

## 1. Provisionar el VPS

1. Crear un servidor **Hetzner Cloud CX22** en la región **Ashburn (US-East)** — la más cercana a México con buena latencia (~60ms), imagen **Ubuntu 24.04 LTS**.
2. Anota la IP pública asignada.
3. Conéctate por primera vez como root:
   ```bash
   ssh root@<IP_DEL_VPS>
   ```

---

## 2. Hardening base del VPS

```bash
# Actualizar el sistema
apt update && apt upgrade -y

# Crear usuario no-root con sudo
adduser seguritech
usermod -aG sudo seguritech

# Copiar tu llave SSH pública al nuevo usuario (desde tu máquina local, en otra terminal)
# ssh-copy-id seguritech@<IP_DEL_VPS>

# Deshabilitar login root por SSH y login por password (SOLO después de confirmar
# que puedes entrar como `seguritech` con tu llave)
sudo sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
sudo sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sudo systemctl restart sshd

# Firewall — SOLO 22 (SSH), 80 (HTTP, redirige a 443), 443 (HTTPS)
sudo apt install -y ufw
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
sudo ufw status verbose

# fail2ban contra fuerza bruta SSH
sudo apt install -y fail2ban
sudo systemctl enable --now fail2ban
```

A partir de aquí, todo lo demás corre como `seguritech` (no root):
```bash
ssh seguritech@<IP_DEL_VPS>
```

---

## 3. Node 20 LTS + PM2 + nginx

```bash
# Node 20 LTS (misma versión que usa el Dockerfile del repo — mantiene paridad)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v   # debe imprimir v20.x

# PM2 global
sudo npm install -g pm2

# nginx
sudo apt install -y nginx
sudo systemctl enable --now nginx

# git (para clonar el repo)
sudo apt install -y git
```

---

## 4. Clonar y compilar

```bash
cd /home/seguritech
git clone git@github.com:CRUZOsvany/seguritech-bot-pro.git
cd seguritech-bot-pro

# Regla de oro del proyecto: npm install SOLO desde la raíz del monorepo
npm install

# Build: frontend (Vite → backend/public/app/) + backend (tsc)
npm run build
```

Si el `git clone` por SSH falla (llave no configurada en el VPS todavía), usa HTTPS para el primer clone y cambia el remoto después:
```bash
git clone https://github.com/CRUZOsvany/seguritech-bot-pro.git
```

---

## 5. Generar secretos — EN EL VPS, interactivamente

**Nunca copies estos valores de un chat ni se los pidas a un LLM.** Corre cada comando tú mismo y guarda el resultado en un gestor de contraseñas antes de pegarlo en `.env`.

```bash
# ADMIN_JWT_SECRET — firma las cookies de sesión del panel. >= 64 chars.
openssl rand -hex 64

# META_TOKEN_ENCRYPTION_KEY — cifra los access_token de Meta en BD.
# ⚠️ NUNCA la rotes después de tener credenciales Meta guardadas — quedarían
# indescifrables. Generar UNA sola vez, para siempre.
openssl rand -hex 32

# META_VERIFY_TOKEN — token de verificación del webhook Meta.
openssl rand -hex 32

# BACKEND_API_KEY — para CLI/curl/scripts (opcional pero recomendado en prod).
openssl rand -hex 32
```

---

## 6. `backend/.env` de producción

```bash
cp backend/.env.example backend/.env
nano backend/.env
```

Llena, como mínimo, estas variables (ver `backend/.env.example` para la lista completa y comentarios de cada una):

| Variable | Valor en prod |
|---|---|
| `NODE_ENV` | `production` |
| `WEBHOOK_PORT` | `3001` |
| `META_VERIFY_TOKEN` | El generado en el paso 5 |
| `META_APP_SECRET` | Del panel de Meta for Developers (Camino A) |
| `META_TOKEN_ENCRYPTION_KEY` | El generado en el paso 5 — **una sola vez, para siempre** |
| `SUPABASE_URL` | `https://<tu-proyecto>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Del dashboard de Supabase → Project Settings → API |
| `ALLOWED_ORIGINS` | `https://tudominio.com` |
| `BACKEND_API_KEY` | El generado en el paso 5 |
| `CLOUDFLARE_ALLOWED_DOMAIN` | Tu dominio de email de equipo, ej. `seguritech.com` |
| `ADMIN_JWT_SECRET` | El generado en el paso 5 |
| `ADMIN_COOKIE_NAME` | `__Host-seguritech_session` (prefijo `__Host-` obligatorio en prod: fuerza `Secure` + `Path=/` + sin `Domain`) |

**Con `NODE_ENV=production`, `validateConfig()` (`backend/src/config/env.ts`) revienta el arranque si falta alguna variable crítica** — es la validación real, no solo esta tabla.

---

## 7. Migraciones y seed del primer admin (Supabase Cloud)

Ya deberían estar aplicadas si vienes siguiendo el Camino C del roadmap — si no:

1. Supabase Dashboard → SQL Editor → pegar y correr, **en orden**, cada archivo de `backend/supabase/migrations/001_*.sql` hasta el más alto (`018_tenant_knowledge_base.sql` al momento de escribir esto).
   - Truco si el editor te come el primer carácter al pegar: deja una línea en blanco antes del `SELECT`/`INSERT`/etc.
2. Generar el hash del primer super_admin **desde el VPS** (o cualquier máquina con el repo, nunca a mano):
   ```bash
   npx ts-node backend/scripts/generate-admin-hash.ts 'TuPasswordReal'
   ```
3. Pegar el hash en un `INSERT INTO public.admin_users (...)` en el SQL Editor (ver plantilla en `backend/supabase/migrations/seed_admin_user.sql`).
4. Verificar: `select count(*) from admin_users where role='super_admin';` → debe ser `>= 1`.

---

## 8. Dominio + Cloudflare DNS

1. Apunta el dominio a Cloudflare (cambia los nameservers en tu registrador).
2. Crea un registro `A` → IP del VPS, con el ícono de nube **naranja** (proxied) activado. Esto le da TLS gratis en el edge de Cloudflare sin tocar certbot.
3. Con el registro proxied, nginx en el VPS puede correr en HTTP plano (puerto 80) — Cloudflare termina el TLS del lado del cliente y reenvía por HTTPS o HTTP al origen según el modo SSL/TLS que elijas (**recomendado: "Full" o "Full (strict)"** en Cloudflare → SSL/TLS → Overview, para que el tramo Cloudflare↔VPS también vaya cifrado).

### Alternativa (si no quieres depender de Cloudflare proxy para TLS)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d tudominio.com
```

---

## 9. nginx — reverse proxy a Express

```bash
sudo nano /etc/nginx/sites-available/seguritech
```

```nginx
server {
    listen 80;
    server_name tudominio.com;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/seguritech /etc/nginx/sites-enabled/
sudo nginx -t   # valida sintaxis antes de recargar
sudo systemctl reload nginx
```

Recuerda: **`NODE_ENV=production` hace que Express bindee a `0.0.0.0:3001`** (ver README §"Bind del server") — expuesto solo a `localhost` desde la perspectiva de internet porque nginx es lo único que escucha en 80/443 según el `ufw` del paso 2. No abras el 3001 en el firewall.

---

## 10. Cloudflare Access (Zero Trust) sobre el panel admin

1. Cloudflare Dashboard → Zero Trust → Access → Applications → **Add an application** → Self-hosted.
2. Dominio: `tudominio.com` (o una ruta específica como `tudominio.com/panel` si quieres dejar `/webhook` fuera de Access — el webhook de Meta no puede pasar por un login).
3. Policy: **Allow** → Include → Emails ending in → tu dominio de equipo (el mismo valor que pusiste en `CLOUDFLARE_ALLOWED_DOMAIN`).
4. El backend ya sabe leer el header `Cf-Access-Authenticated-User-Email` que Cloudflare inyecta tras el login (ver `AuthMiddleware.ts` — encadena con el JWT, no lo reemplaza, según README §"Autenticación del panel admin").
5. **Importante:** excluye `/webhook` de la policy de Access (Meta necesita pegarle sin pasar por el login de Cloudflare) y `/health` si vas a apuntar UptimeRobot ahí.

---

## 11. Deploy con PM2

El repo ya trae `backend/ecosystem.config.js` — no hay que escribirlo de cero.

```bash
cd /home/seguritech/seguritech-bot-pro/backend
pm2 start ecosystem.config.js
pm2 logs seguritech-bot --lines 50   # confirmar que arrancó limpio

# Autostart al reiniciar el VPS
pm2 startup systemd
# (correr el comando que imprime, con sudo)
pm2 save

# Log rotation (el ecosystem.config.js ya asume que esto está instalado)
pm2 install pm2-logrotate
```

---

## 12. Configurar el webhook en Meta

1. Meta for Developers → tu App → WhatsApp → Configuration.
2. Callback URL: `https://tudominio.com/webhook`
3. Verify token: el mismo `META_VERIFY_TOKEN` del paso 5/6.
4. Subscribe a los campos `messages`.
5. Meta hace un `GET` de verificación inmediatamente — si falla, revisa `pm2 logs seguritech-bot` primero.

---

## 13. Smoke test contra producción

```bash
ADMIN_EMAIL='tu-email@dominio.com' ADMIN_PASSWORD='tu-password' \
  BACKEND_URL='https://tudominio.com' bash scripts/smoke-test.sh
```

> **Nota:** el script actual (`scripts/smoke-test.sh`) arranca su propio backend local para probar — pensado para dev, no para pegarle a un servidor ya corriendo en prod. Contra un VPS ya desplegado, corre las mismas validaciones a mano con `curl` (ver README §"Smoke test post-deploy", que trae los comandos exactos: DB, login, endpoint protegido con/sin cookie, lockout, audit log) o adapta el script para que reciba `BACKEND_URL` en vez de arrancar su propio proceso — queda como mejora pendiente, no crítica para el primer deploy.

---

## 14. Checklist final (Camino E del roadmap)

- [ ] `pm2 status` muestra `seguritech-bot` como `online`, sin reinicios en loop.
- [ ] `https://tudominio.com/health` responde `200`.
- [ ] Login al panel funciona con Cloudflare Access + cookie.
- [ ] Webhook de Meta verificado (checkmark verde en el dashboard de Meta).
- [ ] Tenant cero (recomendado: SECURITECH, ya existe en la BD) con flow activo, transición `draft → sandbox → live`.
- [ ] Mensaje real desde un celular externo → el bot responde → el dueño recibe el aviso.

Con eso, el **P0 del roadmap operativo está cerrado** — ese es el hito real de "ya hay ingresos" del que partió esta conversación.

---

## Troubleshooting rápido

| Síntoma | Revisar primero |
|---|---|
| `pm2 logs` muestra `Configuración incompleta en PRODUCCIÓN` | Falta una env var crítica — ver tabla del paso 6 |
| Webhook de Meta no verifica | `META_VERIFY_TOKEN` no coincide, o nginx no está reenviando bien — probar `curl https://tudominio.com/health` primero |
| 502 Bad Gateway | El proceso de PM2 no está corriendo — `pm2 status` |
| Panel pide login en loop | Cookie `__Host-` requiere HTTPS real — confirmar que Cloudflare SSL/TLS está en "Full" o superior, no "Flexible" |
| `getaddrinfo ENOTFOUND` contra Supabase | Repetir el diagnóstico de la alerta 0-bis (`.claude/SEGURITECH_ESTADO_ACTUAL.md`) — puede ser el proyecto Free pausado por inactividad |

Un runbook de incidentes más completo (qué hacer con el bot ya en vivo y clientes reales dependiendo de él) es el Camino J del roadmap operativo — pendiente de escribir cuando haya un primer cliente real corriendo.
