# SegurITech Bot Pro — ROADMAP

> **Qué es este documento.** Qué hacer y en qué orden. El `MAESTRO` dice qué es el proyecto y por qué; el `ESTADO` dice cómo está hoy; este dice hacia dónde se camina.
>
> **Convención:** `[ ]` pendiente · `[~]` parcial o por verificar · `[x]` cerrado y verificado.
> **Cómo se usa:** de arriba hacia abajo. No se salta de fase por antojo. Al cerrar una fase completa se corre el ritual de §7.5 del MAESTRO.
>
> **Numeración:** este proyecto usa **Fases**. Los "Sprints" del MAESTRO v2.0 quedan como alias histórico y no se usan más para planear.
>
> **Versión:** 2.0 (consolidación 2026-09-08) · Reemplaza al ROADMAP_OPERATIVO v1.0

---

## Por qué este orden

```
FASE 1    PRIMER CLIENTE QUE PAGA      sin esto no hay un solo peso
FASE 1.5  QUE NO SE CAIGA              antes de meter a un tercero
FASE 2    PROFUNDIZAR EL BOT           con clientes que lo justifiquen
FASE 3    POS                          después del bot, no en paralelo (DEC-09)
FASE 4    DIFERIDOS                    cada uno exige ADR antes de entrar

|| PARALELO   SECURITECH cámaras — negocio físico, no compite por horas de código
|| TRANSVERSAL proceso, higiene, infra — corre todo el tiempo
```

**El cuello de botella define el calendario.** La verificación de Meta está fuera de control del equipo. Todo lo demás de la Fase 1 se hace **mientras** Meta verifica, no después.

```
Meta (1A) ─────────┐
Producción (1B) ───┼──> Onboarding tenant cero (1D) ──> INGRESO
Datos (1C) ────────┘
```

---

## FASE 1 — Primer cliente que paga

**Objetivo único:** un negocio real recibiendo y respondiendo en su WhatsApp oficial, en producción, de forma estable.

**Estado del código:** cerrado. El backend está probado (344 tests), el frontend y el Designer existen, la base está completa y aplicada. **Lo que falta en esta fase no es código.**

### 1A — Meta (el cuello de botella)

- [x] Meta Business Account creada
- [x] Verificación de negocio iniciada (en curso desde 2026-08-20)
- [ ] App en Meta for Developers con producto WhatsApp — **sin confirmar uno por uno**
- [ ] System User con **token permanente**, no el temporal de 24 h
- [ ] Número de WhatsApp Business dado de alta y verificado
- [ ] Primer template enviado a aprobación
- [ ] Anotar `phone_number_id`, `waba_id`, `app_secret` para `tenant_meta_credentials`
- [ ] Levantar túnel `cloudflared` para probar end-to-end **mientras** Meta verifica

> Los sub-pasos marcados sin confirmar no están hechos solo porque el trámite general arrancó. Se confirman uno por uno contra el Business Manager, no contra este documento.

### 1B — Destino de producción

**Decisión pendiente antes de tocar nada aquí:** ¿el piloto sale en el servidor Ubuntu de la LAN donde ya corre en Docker, o se espera al VPS con dominio público? Un webhook de Meta necesita HTTPS público, así que la LAN sola no basta para tráfico real — pero un túnel sí podría cubrir el piloto. Decidirlo cambia el resto de esta sección.

- [x] Servicio corriendo en Docker en servidor Ubuntu de la LAN
- [x] `docker-compose.yml` leyendo `backend/.env` vía `env_file` (arreglado 2026-09-06)
- [ ] Provisionar VPS Hetzner CX22
- [ ] Hardening: usuario no-root, SSH por llave, `ufw` (22/80/443), `fail2ban`
- [ ] Node LTS 20 + PM2 + nginx como reverse proxy a `127.0.0.1:3001`
- [ ] Dominio + DNS en Cloudflare + TLS
- [ ] Cloudflare Access Zero Trust sobre el panel, whitelist de emails del equipo
- [ ] Generar **todos** los secretos en el servidor con `openssl` (regla 13)
- [ ] `NODE_ENV=production` y confirmar que `validateConfig()` rechaza secretos débiles
- [ ] PM2 con `pm2 startup` + `pm2 save`
- [ ] Webhook de Meta apuntando al dominio con HTTPS válido

Guía ejecutable: `docs/deployment/RUNBOOK_PRODUCCION.md`.

### 1C — Datos y catálogo

- [~] Migraciones 001–020 aplicadas en Supabase Cloud — última confirmación real el 2026-09-01; reverificar por lectura REST
- [x] Seed del primer `super_admin`
- [ ] **Enlazar el CLI de Supabase** (`npx supabase login` → `link --project-ref …`). Mientras no exista, cada migración mergeada puede quedar sin aplicar — ya pasó dos veces
- [ ] **Cargar el inventario real**: mínimo 150 SKUs (DEC-10). Hoy solo hay import por CSV, sin CRUD producto a producto
- [ ] Smoke test contra producción: login devuelve cookie, `/api/admin/tenants` responde 200, sin cookie responde 401

### 1D — Onboarding del tenant cero

- [ ] Elegir tenant cero. Recomendado: **SECURITECH cámaras como tenant propio** — se prueba en carne propia sin arriesgar a un tercero, y ya existe `securitech-flow.json`
- [ ] Crear el tenant, activar el servicio `whatsapp_bot`
- [ ] Cargar credenciales Meta de 1A (interactivo, nunca en un prompt)
- [ ] Publicar el flow y validarlo en el simulador embebido
- [ ] FSM: `draft → sandbox → live`
- [ ] Prueba end-to-end desde un celular externo contra el número oficial
- [ ] Confirmar que el aviso al dueño llega

### Criterio de salida de la Fase 1

Un mensaje real entra desde un celular ajeno, el bot responde correctamente, el dueño recibe su aviso, y todo ocurre en producción. Si falta cualquiera de las cuatro, la fase sigue abierta.

---

## FASE 1.5 — Que no se caiga

No se mete un tercero que paga sin cerrar esto. Es la diferencia entre un susto y una catástrofe de reputación en un mercado de referidos.

### Observabilidad (DEC-14 ya decidida)

- [ ] Sentry capturando errores del backend
- [ ] UptimeRobot sobre el dominio y `/health`
- [ ] Logs Pino en JSON en producción con rotación vía PM2 logrotate
- [ ] Alerta al equipo cuando el bot deje de responder

### Backups

- [ ] Cron de `pg_dump` diario a Backblaze B2 — Supabase Free no trae backups automáticos
- [ ] Cifrar el dump antes de subirlo
- [ ] **Probar una restauración real** a una base limpia. Un backup no probado no es un backup
- [ ] Documentar el restore en el runbook

### Runbook de incidentes

- [ ] "Qué hacer si el bot deja de responder": revisar PM2/Docker, webhook, token de Meta, Supabase
- [ ] Procedimiento de restore
- [ ] Procedimiento de rollback de flow (la API ya existe)
- [ ] Quién atiende y en qué horario

### Test cases como gate de publicación (ADR-013)

Es lo que convierte "diseñar mejor los bots" en algo verificable, y da más valor por menos trabajo que casi cualquier feature nueva.

- [ ] Tabla `bot_flow_test_cases`
- [ ] UI mínima en el Designer: `inputs[] → expected last_node + outputs contains`
- [ ] Runner contra `SimulateMessageUseCase`
- [ ] **Gate:** no se publica una versión con un caso en rojo
- [ ] 3–5 casos para el flow del tenant cero como primer ejemplo

### Cumplimiento Meta antes de escalar

- [x] Ventana de servicio de 24 h (`bot_users.last_inbound_at`)
- [x] Opt-out real (`bot_users.opted_out_at`)
- [ ] Monitoreo del quality rating vía webhook de `account_update`
- [ ] Marcar leído y "escribiendo" (bloqueado por 1A)
- [ ] Delay de 600–1200 ms entre mensajes (DEC-08 decidida, sin implementar)

---

## FASE 2 — Profundizar el bot

Solo con Fase 1 y 1.5 cerradas. Idealmente con 1–3 clientes reales.

### Exprimir el motor que ya existe

El flow más maduro usa 6 de los 14 tipos de nodo. Esto es ganancia disponible sin escribir motor nuevo.

- [ ] Auditar cada flow vivo contra los 14 tipos y decidir dónde aportan carrusel, ubicación, CTA URL, reacciones y WhatsApp Flows nativos
- [ ] Carrito multi-producto (DEC-02): juntar varios artículos en **una** alerta estructurada al dueño. Con DEC-01=A el bot sigue escalando siempre, así que el valor está en la calidad del aviso, no en cerrar la venta
- [ ] Validación en `wait_input` (C-04)
- [ ] Extracción de cantidades (C-05)
- [ ] Desambiguación cuando hay varios matches (B-02)
- [ ] Escape words configurables por tenant en vez de hardcodeadas (C-08)
- [ ] Branching por contexto (C-02)

### Panel y catálogo

- [ ] CRUD de catálogo producto a producto (E-03). Hoy solo hay import CSV, y eso obliga a que un desarrollador intervenga en cada ajuste
- [ ] Tests del frontend (E-01, alcance DEC-11): ValidationPanel, serialización, hooks de TanStack Query. Hoy no hay ni runner instalado
- [ ] Completar el espejo de tipos en `designer/flow-types.ts` — le faltan `TransitionCondition` de `service_directory_match`, `catalog_found` y `catalog_not_found`
- [ ] Audit log en `/simulate` con `persist:true` (D-03)

### Moldes por industria

Cada flow bueno hecho a mano se gradúa a molde. Es lo que baja el onboarding de horas a minutos — la métrica más crítica del negocio.

- [x] Papelería (`papeleria.config.ts` + flow)
- [x] Cerrajería (flow, sembrado a dos tenants reales)
- [ ] Graduar `securitech-flow.json` (cámaras) de JSON suelto a molde reutilizable
- [ ] Ferretería
- [ ] Pizzería

---

## FASE 3 — POS

Diferido explícitamente hasta después del primer cliente pagando solo con el bot (DEC-09). Puede correr en paralelo si lo lleva otra persona.

- [x] Bootstrap backend: 12 tablas `pos_*`, auth por PIN, endpoints de lectura, import CSV
- [ ] Endpoints admin de escritura: catálogo, categorías, cajeros
- [ ] Sync de ventas idempotente por `pos_sales.client_id` + corte X/Z (ADR-010)
- [ ] Config del POS en el panel admin
- [ ] PWA del cajero online: tres zonas, búsqueda por nombre/SKU/código de barras, cobro efectivo/transferencia/terminal
- [ ] Offline real: service worker + Dexie + cola de sincronización + resolución de conflictos
- [ ] Print agent: workspace propio, ESC/POS, cajón de dinero, instalador con `pkg`
- [ ] Corte de caja en UI + reportes esenciales

---

## FASE 4 — Diferidos

Nada de esto entra sin ADR explícito.

- [ ] **CFDI 4.0** vía Facturama (ADR-011). Botón "facturar ticket" → PAC devuelve PDF y XML → se manda por WhatsApp o email
- [ ] **IA / ChatBot Pro** — plan aprobado y pausado (ADR-015). Se retoma cuando el motor determinista esté exprimido y Meta cerrado
- [ ] **Integración bot ↔ POS**: consulta de inventario y precio por WhatsApp
- [ ] **Canal Messenger**: `bot_flows.channel` ya existe y el `FlowInterpreter` es agnóstico de canal; solo cambia el adapter
- [ ] **Analytics del MSP**: clientes activos, MRR, mensajes/mes, churn, tickets por cliente
- [ ] Lector de cámara con `@zxing` · cobro integrado Clip / Mercado Pago · multi-caja · lealtad · promociones complejas

---

## PARALELO — SECURITECH cámaras

Negocio físico. No compite por las mismas horas de desarrollo.

- [ ] Plantilla de cotización de 1–2 páginas en lenguaje de beneficio, no de specs
- [ ] Lógica de precio: costo + instalación → markup 30–50%
- [ ] Banco de fotos de instalaciones reales
- [ ] Costos fijos reales y punto de equilibrio entre los planes
- [ ] Régimen fiscal correcto para persona física (probablemente RESICO — confirmar con contador)

---

## TRANSVERSAL — proceso continuo

### Primero: devolver a `main` lo que nunca llegó (2026-09-09)

Esto va antes que cualquier otra cosa de esta sección. Ver `ESTADO` §7 para el detalle de cómo pasó.

- [ ] Mergear el PR **#80** (`fix/compose-env-file` → `main`): devuelve #75, #76 y #77 —carrusel con bucle cerrado, cards dinámicas, migración 021, siembra del Designer, auditoría de duplicación— más el arreglo de `FlowInterpreter` que la base equivocada destapó
- [ ] **Aplicar y verificar la migración 021 el mismo día** que entre el #80 (regla 8). Hoy no está en Cloud ni en `main`
- [ ] Mergear el PR **#78** (catálogo de reglas del motor). Va antes que el #79: el código de bloques lo cita
- [ ] Mergear el PR **#79** (bloques compuestos, F1-a)
- [ ] Borrar `fix/compose-env-file` al mergear. Ahora sí: dejarla viva después del #74 es lo que causó todo esto
- [ ] Mergear la consolidación documental **al final**: su `CLAUDE.md` enlaza `REGLAS_FLOW.md` y `BLOQUES_COMPUESTOS.md`, que llegan con el #78 y el #79

### Higiene inmediata (una tarde de trabajo, alto retorno)

- [ ] Podar **7 ramas locales** y **21 remotas** ya mergeadas
- [ ] Resolver las ramas remotas vivas: PR o borrar. `docs/runbook-referencias-pendientes` (PR **#55**, abierto desde el 2026-08-21) está 49 commits atrás — rebasar o cerrar y rehacer
- [ ] Borrar `feature/sprint-6-new-tenant` (abandonada por decisión) y `test/local-validacion`
- [ ] Convertir `backend/.env` a finales de línea LF

### Proceso

- [x] `main` protegida: PR obligatorio, CI en verde, sin force push
- [x] Conventional commits
- [ ] **Escribir la regla que faltaba: todo PR se abre contra `main`.** Si de verdad hace falta apilar sobre otra rama, se anota el porqué en la descripción y se reapunta a `main` en cuanto la base se mergee. Sin esta regla el CI queda verde validando el merge equivocado, que es exactamente lo que pasó con #75…#79
- [ ] Exigir 1 approval explícito en `main`
- [ ] GitHub Projects: `Backlog → To Do → In Progress → In Review → Done`
- [ ] Borrar la rama en cada merge, sin excepción (§7.2 del MAESTRO)

### Entorno

- [ ] Validar que el entorno de desarrollo espeja el servidor (versión de Node, cliente de Postgres)
- [ ] Instalar `psql` y enlazar el CLI de Supabase
- [ ] Supabase Free → Pro cuando haya datos de clientes reales (Pro trae backups)

---

## Orden de ataque sugerido

1. **Devolver a `main` el trabajo huérfano** (#80 → #78 → #79) y aplicar la migración 021. Es lo único que hoy hace que `main` no sea lo que el equipo cree que es.
2. **Higiene transversal** — una tarde, desatasca todo lo demás.
3. **Decidir 1B**: LAN con túnel o VPS con dominio. Bloquea el resto de la fase.
4. **1A en paralelo, todos los días** — es lo único que no acelera con más horas de código.
5. **1C**: enlazar el CLI y cargar el inventario real.
6. **1D**: tenant cero end-to-end.
7. **Fase 1.5 completa** antes de que el primer cliente sea alguien que no seas tú.

---

**FIN DEL ROADMAP**
