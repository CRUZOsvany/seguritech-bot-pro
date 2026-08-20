# SegurITech — Roadmap Operativo y Checklist Maestro

> **Qué es esto.** El plano de ejecución de aquí en adelante. El `SEGURITECH_PROYECTO_MAESTRO.md` dice QUÉ es el proyecto y POR QUÉ; este documento dice QUÉ HACER y EN QUÉ ORDEN para no olvidar nada.
>
> **Versión:** 1.0 — Junio 2026
> **Cómo usar:** se trabaja de arriba hacia abajo. No se salta de P0 a P2 por antojo. Al cerrar un camino completo, se actualiza la sección correspondiente del `SEGURITECH_PROYECTO_MAESTRO.md` y la bitácora.
> **Convención:** `[ ]` pendiente, `[x]` confirmado hecho en el código actual, `[~]` parcial / verificar.

---

## Mapa de prioridades (el porqué del orden)

El orden NO es por gusto, es por dependencias y por riesgo:

```
P0  DESBLOQUEAR INGRESO      → sin esto no hay un solo peso. Lo más urgente.
P1  QUE NO SE CAIGA          → antes de que viva data real de un cliente.
P2  PROFUNDIZAR PRODUCTO     → solo con clientes pagando que lo justifiquen.
P3  ESCALA Y DIFERIDOS       → no antes de tiempo. Disciplina.

|| LÍNEA PARALELA: cámaras (negocio físico, no compite por las mismas horas de código)
|| TRANSVERSAL: git, entorno, infra-as-you-go (corre todo el tiempo)
```

**Dependencia crítica que define el calendario:** la verificación de Meta es el cuello de botella (1–2 semanas, fuera de tu control). TODO lo demás de P0 se hace en paralelo MIENTRAS Meta verifica. Si no arrancas Meta hoy, todo P0 se atrasa esas 2 semanas al final.

```
Meta verification (Camino A) ──┐
Infra prod (Camino B) ─────────┼──> Onboarding 1er cliente (Camino E) ──> INGRESO
Supabase Cloud (Camino C) ─────┤
Hardening crítico (Camino D) ──┘
```

---

## P0 — DESBLOQUEAR EL PRIMER CLIENTE QUE PAGA

Objetivo único: una papelería (o SECURITECH como tenant cero) recibiendo y respondiendo en su WhatsApp **oficial**, en producción, de forma estable.

### Camino A — Verificación Meta (EL CUELLO DE BOTELLA — ARRANCA HOY)
- [ ] Crear/confirmar Meta Business Account del negocio
- [ ] Iniciar verificación de negocio (documentos fiscales del negocio que será tenant cero)
- [ ] Crear App en Meta for Developers, producto WhatsApp
- [ ] Generar System User con **token permanente** (no token temporal de 24h)
- [ ] Dar de alta el número de WhatsApp Business y verificarlo
- [ ] Enviar el **primer template** a aprobación (uno de saludo/aviso simple)
- [ ] Anotar `phone_number_id`, `waba_id`, `app_secret` para `tenant_meta_credentials`
- [ ] **Mientras Meta revisa, no te bloquees: avanza B, C, D en paralelo**

### Camino B — Infraestructura de producción
- [ ] Provisionar VPS Hetzner CX22 (Ashburn)
- [ ] Hardening base del VPS: usuario no-root, SSH por llave, `ufw` (solo 22/80/443), `fail2ban`
- [ ] Instalar Node LTS 20 + PM2 + nginx (reverse proxy a `127.0.0.1:3001`)
- [ ] Comprar/configurar dominio + DNS en Cloudflare
- [ ] Certificado TLS (Cloudflare proxied o certbot detrás de nginx)
- [ ] Cloudflare Access (Zero Trust) con whitelist de emails del equipo sobre el panel admin
- [ ] Webhook público de Meta apuntando al dominio (`/webhook`), HTTPS válido
- [ ] Generar TODOS los secretos en el VPS con `openssl` (nunca con LLM):
  - [ ] `ADMIN_JWT_SECRET` (`openssl rand -hex 64`)
  - [ ] `META_TOKEN_ENCRYPTION_KEY` (`openssl rand -hex 32` — **NO ROTAR jamás después**)
  - [ ] `META_VERIFY_TOKEN` (`openssl rand -hex 32`)
  - [ ] `BACKEND_API_KEY` (`openssl rand -hex 32`)
- [ ] `NODE_ENV=production` y validar que `config/env.ts` rechaza secretos débiles
- [ ] Deploy con PM2 + `pm2 startup` + `pm2 save` (autostart al reboot)
- [ ] Build del `frontend/` servido como estático por el mismo Express (una URL, una cookie, cero CORS)

### Camino C — Supabase Cloud + datos
- [~] Aplicar migrations en orden en el SQL Editor de Cloud — en repo existen **001–015** (todas, verificado 2026-06-03). Falta confirmar cuáles corrieron en Cloud (memoria: mig015 ya aplicada)
- [ ] Confirmar que **todas** las migrations corrieron sin error (las `CREATE POLICY` no son idempotentes — ojo)
- [ ] Seed del primer `super_admin` (hash bcrypt generado con el script, nunca password en claro)
- [ ] Verificar RLS activo como defensa en profundidad
- [ ] Smoke test: `select count(*) from admin_users where role='super_admin'` devuelve 1
- [ ] Login real contra prod devuelve cookie `seguritech_session` y `/api/admin/tenants` responde

### Camino D — Hardening crítico de código
- [x] `tenant_services` como única fuente de verdad (mergeado)
- [x] FSM de servicio con transiciones válidas forzadas (409 en inválida)
- [x] API de flows draft/publish/rollback (mergeado)
- [x] AdminRouter modularizado en sub-routers (mergeado)
- [x] `tenants.status='paused'` bloquea el webhook — `webhookStatusGating.test.ts` verde 2/2 (verificado 2026-06-03)
- [x] **Matar `HandleMessageUseCase` legacy** (ADR-012) — la lógica ya estaba: `BotController` responde "⚙️ en mantenimiento" para tenants sin flow, sin fallback FSM. Borrado el código muerto (use-case + test) en rama `chore/adr-012-remove-legacy-handlemessage` (commit 18e2a43), **PR pendiente de merge** (2026-06-03)
- [x] Gatear `ReadlineAdapter` a `if (config.isDevelopment)` — ya hecho (`Bootstrap.ts:260`)
- [~] CI verde: type-check exit 0, lint 0 errores (89 warnings preexistentes), suite verde. Falta confirmar el workflow .github contra front+carpetas muertas
- [x] Limpiar `.env.example` raíz — moot, **no existe** `.env.example` en la raíz (verificado 2026-06-03)
- [x] Borrar fósiles: `backend/bin/www` — moot, **ya no existe** (verificado 2026-06-03)

### Camino E — Onboarding del primer cliente real
- [ ] Elegir tenant cero (recomendado: **SECURITECH cámaras como tu propio tenant** — pruebas en carne propia sin arriesgar a un tercero; ya tienes `securitech-flow.json`)
- [ ] Crear tenant en el panel, asignar servicio `whatsapp_bot`
- [ ] Cargar credenciales Meta del Camino A (interactivo, nunca en prompt)
- [ ] Asignar molde / publicar el flow, validar en el simulador embebido
- [ ] Transición FSM: `draft → sandbox → live`
- [ ] Prueba end-to-end real desde un celular externo contra el número oficial
- [ ] Verificar que el aviso al dueño llega (ese camino ya funciona en código)
- [ ] **MÉTRICA DE ÉXITO P0:** mensaje real entra, bot responde correcto, dueño notificado, todo en prod

---

## P1 — QUE NO SE CAIGA Y QUE PUEDAS DORMIR

No metas un cliente que paga (un tercero) sin cerrar esto. Es la diferencia entre un susto y una catástrofe de reputación en un mercado de referidos.

### Camino F — Observabilidad
- [ ] Sentry (free tier) capturando errores del backend
- [ ] UptimeRobot pingueando el dominio + un endpoint `/health`
- [ ] Confirmar logs Pino estructurados (JSON) en prod, rotación con PM2 logrotate
- [ ] Alerta (email/WhatsApp a ti) cuando el bot deje de responder

### Camino G — Backups verificados
- [ ] Cron `pg_dump` diario a Backblaze B2 (Supabase Free NO tiene backups automáticos)
- [ ] Cifrar el dump antes de subir
- [ ] **PROBAR una restauración real** a una DB limpia (un backup no probado no es un backup)
- [ ] Documentar el procedimiento de restore en el runbook (Camino J)

### Camino H — Test cases como gate de publicación (ADR-013) ← el "diseñar mejor los bots"
- [ ] Tabla `bot_flow_test_cases`
- [ ] UI mínima en el panel para crear casos (`inputs[] → expected last_node + outputs contains`)
- [ ] Runner contra `SimulateMessageUseCase`
- [ ] **Gate:** no se puede activar una versión de flow si hay un caso en rojo
- [ ] Escribir 3–5 casos para el flow de cámaras como primer ejemplo
- [ ] (Opcional) `bot_flow_variables` para autocomplete de `{{variables}}`

### Camino I — Saldar deuda técnica conocida
- [ ] `send_list` como interactive list nativo de Meta (hoy se serializa como texto plano)
- [ ] Resolver N+1 query en `GET /api/admin/tenants`
- [x] Mover `InMemoryUserRepository` a `tests/utils/` — ya está ahí (`backend/src/tests/utils/InMemoryUserRepository.ts`, verificado 2026-06-03)
- [ ] Depurar `docs/` (>30 .md de distintas épocas → solo lo vivo)
- [ ] Aclarar/borrar `backend/supabase/seed.sql` si es legacy

### Camino J — Runbook de soporte / incidentes
- [ ] Documento corto: "qué hacer si el bot deja de responder" (revisar PM2, webhook, token Meta, Supabase)
- [ ] Procedimiento de restore de backup (del Camino G)
- [ ] Procedimiento de rollback de flow (ya tienes la API)
- [ ] Contacto/escalación: quién atiende y en qué horario (meta del doc: <2 tickets/cliente/mes)

---

## P2 — PROFUNDIZAR PRODUCTO

Solo cuando P0+P1 estén cerrados y tengas al menos el tenant cero estable. Idealmente con 1–3 clientes reales.

### Camino K — Moldes por industria
- [x] Papelería (`papeleria.config.ts`)
- [ ] Graduar `securitech-flow.json` (cámaras) de JSON suelto → molde reutilizable
- [ ] Ferretería
- [ ] Cerrajería
- [ ] Pizzería
- [ ] **Principio:** cada flow bueno hecho a mano se gradúa a molde. Baja el onboarding de horas a minutos (tu métrica más crítica)

### Camino L — Bot Designer visual (React Flow) — **SOLO tras 3–5 clientes pagando**
> Tu propio doc lo dice: "Resiste meter esto hasta tener 5 clientes pagando." El gate de test cases (Camino H) da más valor con menos trabajo. NO construyas el canvas antes.
- [ ] Sprint 7: React Flow, 7 nodos custom, inspector con validación Zod en vivo
- [ ] Sprint 8: simulador embebido split-screen + versionado + diff visual
- [ ] (Test cases ya hechos en Camino H sirven aquí como gate)

### Camino M — POS (segunda fase de entrega — puede correr en paralelo por otra persona)
- [x] Bootstrap backend POS (12 tablas `pos_*`, auth PIN, endpoints catálogo)
- [ ] F2-1 Endpoints admin CRUD (catálogo / categorías / cajeros)
- [ ] F2-2 Endpoint sync de ventas idempotente por `client_uuid` + corte X/Z (ADR-010)
- [ ] F2-3 Frontend: config admin del POS
- [ ] F2-4 PWA cajero online (layout 3 zonas, búsqueda nombre/SKU/barcode, cobro efectivo/transfer/terminal)
- [ ] F2-5 Offline-first (service worker + Dexie + sync queue + conflict resolution)
- [ ] F2-6 Print agent (workspace `print-agent/` ESC/POS + cajón + instalador `pkg`)
- [ ] F2-7 Corte de caja en UI + reportes esenciales

### Camino N — Canal Messenger (tercer canal)
- [ ] Confirmar columna `channel` en `bot_flows` (flujos separados por canal)
- [ ] Adapter Messenger (el `FlowInterpreter` ya es agnóstico de canal — solo el adapter cambia)
- [ ] Verificación Meta del canal Messenger
- [ ] Molde/flow Messenger del tenant cero

---

## P3 — ESCALA Y DIFERIDOS

No antes de tiempo. Disciplina: cada uno requiere ADR explícito antes de meterlo.

### Camino O — CFDI 4.0 (V2 del POS)
- [ ] Integración con Facturama (PAC externo, NUNCA implementación propia — ADR-011)
- [ ] Botón "Facturar ticket" → PAC devuelve PDF+XML → envío por WhatsApp/email

### Camino P — Integración bot ↔ POS
- [ ] Consulta de inventario/precio por WhatsApp leyendo el catálogo del POS

### Camino Q — Analytics del MSP
- [ ] Dashboard: clientes activos, MRR, mensajes/mes, churn, tickets/cliente

### Camino R — Más
- [ ] Lector cámara `@zxing` para tablets sin lector USB
- [ ] Cobro integrado (Clip / Mercado Pago)
- [ ] Multi-caja, multi-sucursal, lealtad, promociones complejas (todo diferido)

---

## LÍNEA PARALELA — SECURITECH Cámaras (negocio físico)

Independiente del software. No compite por las mismas horas de desarrollo; corre en su propio carril.

### Camino S — Cotizaciones
- [ ] Plantilla de cotización 1–2 páginas, lenguaje de beneficio (no specs técnicos)
- [ ] Lógica de precio: costo cámara + instalación → markup 30–50% → precio cliente
- [ ] Banco de fotos de instalaciones reales para credibilidad

### Camino T — Modelo financiero corregido
- [ ] Costos fijos reales (no subestimados)
- [ ] Punto de equilibrio mezclado entre los 3 planes
- [ ] Proyección de crecimiento realista
- [ ] Régimen fiscal correcto para persona física nueva (RESICO probablemente — confirmar con contador)
- [ ] Hojas de inversión inicial y flujo de caja

---

## TRANSVERSAL — proceso continuo (no es una fase)

### Git / proceso
- [x] `main` protegida: PR obligatorio + CI verde (`test (20.x)`) + sin force push — VERIFICADO 2026-06-03 (push directo rechazado con GH013). Falta: exigir 1 approval explícito.
- [ ] 1 tarea = 1 rama corta (`feat/`, `fix/`, `chore/`) = 1 PR pequeño
- [ ] GitHub Projects: `Backlog → To Do → In Progress → In Review → Done`
- [ ] Cada Issue: objetivo + archivos que toca + criterios de aceptación + el prompt usado
- [x] Conventional commits (ya en uso)

### Entorno
- [x] Migración a Linux — **YA estás en Fedora 41** (el doc maestro dice "Windows→Linux planned": ACTUALÍZALO, ya pasó)
- [ ] Validar que tu entorno Fedora espeja el VPS Ubuntu (versión Node, postgres client, etc.)
- [ ] `npm install` SOLO desde la raíz del monorepo (regla de oro)
- [ ] Nunca `supabase db reset` contra Cloud

### Crecimiento de infra
- [ ] Supabase Free → Pro cuando: empieces a tener data de clientes reales o te acerques a límites (timing TBD; Pro = backups + más recursos)

---

## Regla para "no olvidar nada"

Al cerrar **cada camino completo**:
1. Marca los `[x]` aquí.
2. Actualiza la sección correspondiente del `SEGURITECH_PROYECTO_MAESTRO.md`.
3. Anota en la bitácora del doc maestro qué cambió y por qué.
4. Si revertiste una decisión, no la borres: táchala y anota la razón.

**Orden de ataque sugerido para esta semana:** Camino A (HOY, en paralelo) → Camino B + C → Camino D → Camino E. Eso es el ingreso. P1 inmediatamente después, antes del primer cliente que NO seas tú.

---

**FIN DEL ROADMAP OPERATIVO**
