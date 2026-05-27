# SegurITech Bot Pro

SaaS multi-tenant de chatbots de WhatsApp para pequeños negocios. Backend Node.js + frontend Next.js.

---

## Stack

- **Backend**: Node.js 20+, TypeScript, Express 5, SQLite (`better-sqlite3`), arquitectura hexagonal, Pino, Zod, Helmet, Meta WhatsApp Cloud API.
- **Frontend**: Next.js 16, React 19, NextAuth v4, Supabase, Tailwind v4, bcryptjs.
- **Infra**: Monorepo npm workspaces, Docker multi-stage, GitHub Actions.

---

## Requisitos

- Node.js >= 20
- npm >= 9
- Docker y Docker Compose (opcional, recomendado)

---

## Quick start

### Con Docker (recomendado)

```bash
cp .env.example .env
cp frontend/.env.local frontend/.env.local
# editá ambos .env con tus credenciales
docker compose up
```

Backend en `http://localhost:3001`, frontend en `http://localhost:3000`.

### Sin Docker

```bash
npm run install:all
cp .env.example .env
cp frontend/.env.local frontend/.env.local
# editá ambos .env con tus credenciales
npm run dev
```

### Terminal administrativa (CommandRoom)

```bash
cd backend && npm run admin
```

---

## Tests

```bash
# Backend (unit + integration)
cd backend && npm test

# Smoke test end-to-end
bash scripts/smoke-test.sh

# Type-check
cd backend && npm run type-check
cd frontend && npm run type-check
```

---

## Estado actual

**Pre-alpha. NO apto para producción.** Ver `ROADMAP.md` para fases planeadas.

Lo que funciona hoy:
- Webhook Meta WhatsApp Cloud API con validación HMAC.
- Multi-tenancy a nivel de estado conversacional (mismo número en distintos tenants = usuarios independientes).
- CommandRoom CLI para gestión de tenants.
- Auth con bcrypt en frontend.

Lo que NO funciona aún:
- El bot está hardcodeado: todos los tenants reciben el mismo flujo. La personalización por tenant llega en Fase 1.
- Persistencia partida (SQLite local en backend + Supabase en frontend) — se unifica en Fase 1.
- Sin billing automático.

---

## Documentación

- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — arquitectura interna.
- [`ROADMAP.md`](./ROADMAP.md) — qué viene después.
- [`SECURITY.md`](./SECURITY.md) — política de seguridad y CVEs.
- [`CONTRIBUTING.md`](./CONTRIBUTING.md) — cómo contribuir.

---

## Licencia
