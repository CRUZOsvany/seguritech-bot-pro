# Módulo POS (Punto de Venta)

> SegurITech Bot Pro → SegurITech Suite (Bot + POS). Sprint 5.1a — bootstrap backend.

## Estado actual (Sprint 5.1a)

✅ **Backend operativo** en `feature/sprint-5-1a-pos-backend`:

- Dominio hexagonal: entidades, ports, Molde Papelería.
- Migración SQL 011 con 12 tablas `pos_*` + RLS defense-in-depth + triggers atómicos de inventario.
- Seed manual del tenant piloto "Papelería Piloto Chilpancingo" con 8 categorías + 31 productos.
- Auth POS con cookie JWT propia (scope=`'pos'`), separada de admin.
- 6 endpoints REST de catálogo bajo `/api/pos/*`.
- Lockout on-row para cajeros (sin contaminar `login_attempts` admin).
- Audit log en `admin_audit_log` con `adminId: null` + `metadata.posUserId`.

🚧 **Fuera de alcance (próximos sprints):**

- Sprint 5.1b — PWA Next.js 15 con login PIN, dashboard, proxy routes.
- Sprint 5.2 — CRUD productos/categorías + importación CSV.
- Sprint 5.3 — Venta + cobro + ticket ESC/POS (vía print-agent local).
- Sprint 5.4 — Apertura/cierre de caja + reportes + offline-first.
- Sprint 5.5 — Integración bot↔POS (consulta inventario por WhatsApp).
- Sprint 5.6 — Hardening + despliegue piloto + capacitación.

## Filosofía Core + Molde + Traje

```
┌────────────────────────────────────────────────────────────┐
│  CORE INVARIANTE (~90%)                                     │
│  Ventas · Inventario · Caja · Usuarios · Sync offline       │
├────────────────────────────────────────────────────────────┤
│  MOLDES DE INDUSTRIA (~8%)                                  │
│  domain/moulds/papeleria.config.ts                          │
│  domain/moulds/{ferreteria,tienda,cerrajeria}.config.ts ←   │
│                                            (en backlog)     │
├────────────────────────────────────────────────────────────┤
│  TRAJE A LA MEDIDA POR TENANT (~2%)                         │
│  Customización tipo `pos_tenant_config.*` por tenant        │
└────────────────────────────────────────────────────────────┘
```

El **Molde Papelería V1** (`backend/src/domain/moulds/papeleria.config.ts`) define:

- 8 categorías base: Escritura, Cuadernos y libretas, Útiles escolares, Papel y hojas, Oficina, Arte y manualidades, Tecnología, Servicios.
- ~30 SKUs de muestra cubriendo cada categoría.
- `features`: `sellsServices=true`, `wholesalePricing=true`, `seasonalSpikes=['agosto','septiembre','enero']`.
- Unidades por defecto: piece, package, box, service.

## Documentos hermanos

- [`schema.md`](./schema.md) — descripción de las 12 tablas `pos_*` (migración 011).
- [`api.md`](./api.md) — lista de endpoints REST.
- [`security.md`](./security.md) — modelo de seguridad POS (RLS vs service role, scopes JWT, lockout, audit log).
- [`DISENO_POS_PAPELERIA_V1.md`](../DISENO_POS_PAPELERIA_V1.md) (raíz) — diseño técnico-arquitectónico completo.
