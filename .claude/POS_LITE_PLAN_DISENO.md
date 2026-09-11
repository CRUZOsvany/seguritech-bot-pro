# SEGURITECH — POS Lite: Plan de diseño

> Documento de planeación conversacional (sesión de diseño del 2026-09-10). Complementa `.claude/SEGURITECH_ROADMAP_OPERATIVO.md` (Fase 3 — POS) y `.claude/SEGURITECH_ESTADO_ACTUAL.md`. No los sustituye — aterriza las decisiones tomadas en esta sesión para que se puedan convertir en tickets de trabajo.
>
> Plan de ejecución por tickets: `.claude/POS_LITE_PLAN_IMPLEMENTACION.md`.

---

## 1. Marco del producto

- **El bot de WhatsApp es la palanca de adquisición**: consigue y atiende clientes.
- **El POS es el banco de datos real del negocio**: inventario correcto, ventas registradas, caja controlada. Ambos comparten la misma base — el bot solo *lee* lo que el POS mantiene actualizado (`pos_products.stock_qty`).
- La IA (Secretaria Digital, ADR-015) se retoma después de facturar con el primer cliente — no antes. No es parte de este documento.

---

## 2. Decisiones de esta sesión

| Decisión | Elegido |
|---|---|
| Dispositivo del cajero | Computadora/laptop en el mostrador (no celular) |
| Conectividad | Se cae seguido — diseñar todo asumiendo fallas de internet |
| Alcance v1 "lite" | Vender + inventario (solo lectura) + control de caja con resumen |
| Apertura/cierre de caja sin internet | **Sí** — debe funcionar offline igual que las ventas (ver §4) |
| Cajeros simultáneos | Varía por negocio — el diseño ya lo soporta sin cambios (ver §4) |
| Resumen al cerrar caja | Sí: total vendido, número de ventas, desglose por método de pago |
| Fuera de alcance v1 | Clientes / fiado, reportes avanzados, impresión de ticket, proveedores / compras |

---

## 3. Pantallas

### 3.1 Login
Campo único: nombre + PIN. No se elige rol — el backend ya distingue `pos_cashier` de `pos_manager` por el usuario que inicia sesión (`PosAuthService`, ya construido y probado: timing-safe, bloqueo por intentos fallidos).

### 3.2 Pantalla principal de venta (una sola pantalla)
- **Catálogo general** — pestañas *Todo / Productos / Servicios* + buscador, para "ver qué hay". Los servicios (impresión, engargolado) no muestran stock porque no lo descuentan (`trackStock: false`, ya existe en `PosProduct`).
- **Agregar rápido** — campo separado, dentro del panel de "venta actual", para escanear o teclear código/nombre y añadir con Enter. Flujo de cajero rápido (lector de código de barras USB o teclado), independiente del catálogo general.
- **Carrito** — cantidades editables, total, selector de método de pago (efectivo / tarjeta / transferencia), botón de cobro.
- **Barra superior** — identidad del cajero, estado de caja (abierta/cerrada + monto), estado de sincronización (en línea / N pendientes por sincronizar).
- **Regla de negocio**: no se puede vender sin caja abierta.

### 3.3 Cerrar caja (pendiente de maquetar)
- Conteo de efectivo físico (arqueo) — ya modelado en `pos_cash_sessions` (`closing_amount`, `expected_amount`, `difference`).
- Resumen antes de confirmar: total vendido, número de ventas, desglose por método de pago — se calcula agregando `pos_sales` por `cash_session_id`. No requiere tablas nuevas.

---

## 4. Cambios de esquema necesarios

**Sin cambios necesarios para:**
- Ventas offline-first (`pos_sales.client_id` ya existe)
- Descuento de stock al vender (trigger `pos_decrement_stock_on_sale_item` ya existe)
- Bitácora de movimientos de inventario (`pos_inventory_movements` ya existe)
- Resumen de cierre de caja (agregación sobre datos ya existentes)
- Cajeros simultáneos (cada sesión de caja ya está ligada a `cashier_id`, así que varios cajeros pueden tener su propia caja abierta al mismo tiempo en el mismo tenant sin conflicto)

**Cambio necesario:**
- Agregar `client_id text not null` y `synced_at timestamptz` a `pos_cash_sessions`, con `unique(tenant_id, client_id)` — mismo patrón que `pos_sales`, para que abrir/cerrar caja también sea seguro sin internet. *(Hecho en `022_pos_lite_offline.sql`, que además agrega `needs_review`/`review_reason` a `pos_sales` — ver plan de implementación §3.)*

**Decisión futura, no bloqueante:** si dos empleados comparten literalmente un solo cajón de dinero (no cada quien el suyo), lo más simple es que compartan un mismo usuario/PIN de caja en vez de construir lógica de "entrega de turno" entre sesiones — evita complejidad que v1 no necesita.

---

## 5. Arquitectura offline (cliente)

- PWA instalable sobre el mismo stack ya usado (React + Vite) — se abre como programa aparte, sin salir del ecosistema actual del proyecto.
- Cada acción (abrir caja, cada venta, cerrar caja) se guarda primero en el navegador (IndexedDB, vía Dexie — hoy no instalado, diferido como DEC-09) con un `client_id` generado ahí mismo, antes de tocar internet.
- Sincronización en segundo plano cuando regresa la conexión; el backend deduplica automáticamente por `unique(tenant_id, client_id)`.
- Los triggers de Postgres ya existentes se disparan solos en cuanto la venta llega al servidor — no requieren cambios.

---

## 6. Reutilizado vs. nuevo

**Ya construido — se reutiliza tal cual:**
- Autenticación de cajero por PIN (`PosAuthService`)
- Esquema completo de catálogo, ventas, movimientos de inventario y sesiones de caja
- Triggers de descuento de stock y bitácora de movimientos

**Nuevo — falta construir:**
- Interfaz del POS (las 3 pantallas de §3)
- Cliente offline-first (almacenamiento local + cola de sincronización) — Dexie no está instalado
- Migración: `client_id` / `synced_at` en `pos_cash_sessions`
- Endpoint de resumen de cierre de caja (agregación de ventas por sesión)

---

## 7. Relación con el roadmap existente

Esto es la **Fase 3 (POS)** de `SEGURITECH_ROADMAP_OPERATIVO.md`, hoy planeada después del bot (DEC-09). No depende de Meta ni del VPS — puede avanzar **en paralelo** a la Fase 1 (verificación Meta) y a la Fase 2 (motor de flows), igual que el propio roadmap ya establece: todo lo que no depende de Meta se hace mientras Meta verifica, no después.

---

## 8. Pendiente de decidir (no bloquea empezar)

- ¿El cliente necesita un ticket — impreso, o no hace falta en v1?
- ¿El resumen de cierre se queda solo en pantalla, o también se le manda al dueño por WhatsApp (reutilizando el canal del bot)?
