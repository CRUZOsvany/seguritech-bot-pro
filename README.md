# SegurITech Bot Pro 🤖

**Una plataforma profesional de chatbot WhatsApp multi-tenant con arquitectura hexagonal**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js->=18.0.0-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9+-blue.svg)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-15.0+-black.svg)](https://nextjs.org/)

## 🎯 Descripción General

SegurITech Bot Pro es una solución empresarial de chatbot para WhatsApp con soporte completo para múltiples tenants (SaaS). Construida con **arquitectura hexagonal**, permite gestionar miles de conversaciones simultáneamente con una experiencia personalizable por tenant.

### ✨ Características Principales

- 🏢 **Multi-tenant SaaS**: Aislamiento completo entre tenants
- 💬 **Integración WhatsApp**: Webhook con WhatsApp Business API (Meta)
- 🏗️ **Arquitectura Hexagonal**: Clean Code, testeable, escalable
- 📊 **Base de datos**: Supabase (PostgreSQL)
- 🎨 **Panel de Control**: Next.js + React
- 🧪 **Tests completos**: Unit, Integration y E2E
- 🔒 **Seguridad**: Rate limiting, CORS, Helmet, autenticación JWT/sesión
- 📈 **Escalabilidad**: Diseño preparado para microservicios

## 📦 Estructura del Proyecto

```
seguritech-bot-pro/
├── backend/                    # Servidor Node.js + Express
│   ├── src/
│   │   ├── app/               # Capa de aplicación (Controllers, DI)
│   │   ├── domain/            # Lógica de negocio (Entities, Use Cases)
│   │   ├── infrastructure/    # Adaptadores, Repositorios, Servicios
│   │   ├── config/            # Configuración (env, logger)
│   │   ├── tests/             # Tests (unit, integration)
│   │   ├── Bootstrap.ts       # Punto de entrada, DI
│   │   └── index.ts           # Main
│   ├── package.json
│   ├── tsconfig.json
│   └── jest.config.js
│
├── frontend/                   # Aplicación Next.js
│   ├── app/                   # Rutas de App Router
│   ├── components/            # Componentes React
│   ├── hooks/                 # Custom hooks
│   ├── lib/                   # Utilidades, API client
│   ├── package.json
│   └── tsconfig.json
│
├── docs/                      # Documentación del proyecto
│   └── ARCHITECTURE.md        # Detalles técnicos
│
├── docker-compose.yml         # Orquestación de servicios
├── package.json               # Monorepo root
└── README.md                  # Este archivo
```

## 🚀 Inicio Rápido

### Prerequisitos

- Node.js >= 18.0.0
- npm >= 9.0.0
- Docker & Docker Compose (opcional, para Supabase local)
- Una cuenta en [Supabase](https://supabase.com)

### Instalación

```bash
# Clonar el repositorio
git clone <repo-url>
cd seguritech-bot-pro

# Instalar dependencias de todo el monorepo
npm install

# O instalar por módulo
npm install --workspace backend
npm install --workspace frontend
```

### Variables de Entorno

Copia `.env.example` a `.env` y configura:

```bash
# Backend
SUPABASE_URL=https://...supabase.co
SUPABASE_KEY=.....
META_PHONE_NUMBER_ID=.....
META_ACCESS_TOKEN=.....
META_VERIFY_TOKEN=tu_token_secreto

# Frontend
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_SUPABASE_URL=https://...supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=.....
```

### Desarrollo Local

```bash
# Inicia ambos servidores (backend en 3001, frontend en 3000)
npm run dev

# O por separado
npm run dev:backend    # Terminal 1
npm run dev:frontend   # Terminal 2
```

Accede a:
- Frontend: http://localhost:3000
- Backend API: http://localhost:3001
- Documentación: http://localhost:3000/docs

## 🔧 Comandos Disponibles

### Backend

```bash
npm run dev              # Desarrollo con ts-node
npm run build           # Compilar TypeScript
npm run start           # Ejecutar build
npm run lint            # Análisis estático
npm run type-check      # Verificar tipos
npm run test            # Ejecutar tests
npm run test:watch      # Tests en modo watch
npm run test:coverage   # Coverage
npm run test:integration # Solo tests de integración
npm run admin           # CLI interactiva (development)
```

### Frontend

```bash
npm run dev             # Desarrollo
npm run build          # Build producción
npm run start          # Ejecutar build
npm run lint           # ESLint
npm run type-check     # TypeScript check
```

### Monorepo

```bash
npm run dev            # Ambos
npm run build          # Ambos
npm run test           # Backend tests
```

## 🏗️ Arquitectura

La aplicación sigue el patrón **Hexagonal (Ports & Adapters)**:

```
┌─────────────────────────────────────────────────────────────┐
│                     Controladores (Express)                 │
├─────────────────────────────────────────────────────────────┤
│                  Use Cases (Lógica de Negocio)              │
├─────────────────────────────────────────────────────────────┤
│  Puertos                           Adaptadores              │
│  ├─ UserRepository      ←→    SupabaseUserRepository        │
│  ├─ NotificationPort    ←→    MetaWhatsAppAdapter          │
│  └─ TenantConfig        ←→    SupabaseTenantConfigService  │
└─────────────────────────────────────────────────────────────┘
```

### Capas

1. **Domain**: Lógica de negocio pura (sin dependencias)
   - Entities: Modelos del dominio
   - Use Cases: Acciones del sistema
   - Ports: Interfaces que el dominio requiere

2. **Application**: Orquestación (Controllers, DI Container)

3. **Infrastructure**: Implementaciones concretas
   - Repositorios (Supabase)
   - Adaptadores (WhatsApp Meta, Console)
   - Servicios (Config, Logging, Message Queue)

Ver [ARCHITECTURE.md](./docs/ARCHITECTURE.md) para más detalles.

## 🔐 Seguridad

- ✅ Rate limiting en endpoints
- ✅ CORS configurado
- ✅ Helmet para headers HTTP
- ✅ Validación con Zod
- ✅ Autenticación JWT o sesión
- ✅ Encriptación de contraseñas (bcrypt)
- ✅ Variables de entorno no versionadas

## 🧪 Testing

```bash
# Unit tests
npm run test

# Con cobertura
npm run test:coverage

# Integration tests
npm run test:integration

# Multi-tenant flow
npm run test:multiTenant

# Watch mode
npm run test:watch
```

### Cobertura Mínima

- Unit: 80%+
- Integration: 70%+
- Critical paths: 100%

## 📊 Base de Datos (Supabase)

La aplicación usa Supabase (PostgreSQL) para persistencia. Para generar tipos TypeScript:

```bash
npm run supabase:types
```

**Tablas principales:**
- `users`: Usuarios del bot
- `tenant_configs`: Configuración por tenant
- `message_log`: Registro de mensajes (idempotencia)
- `auth.users`: Gestión de usuarios del panel

## 🐳 Docker

Ejecutar en contenedores:

```bash
docker-compose up -d

# Backend en puerto 3001
# Frontend en puerto 3000
# Supabase (si está configurado)
```

## 📈 Deployment

### Producción

1. **Build**: `npm run build`
2. **Backend**: Docker/PM2/Railway/Heroku
3. **Frontend**: Vercel/Docker/Static hosting
4. **Base de datos**: Supabase managed

Ver [docs/DEPLOYMENT_STEPS.md](./docs/DEPLOYMENT_STEPS.md) para instrucciones detalladas.

## 🤝 Contribuir

1. Fork el repositorio
2. Crea una rama: `git checkout -b feature/mi-feature`
3. Commit: `git commit -am 'Add mi-feature'`
4. Push: `git push origin feature/mi-feature`
5. Pull Request

### Estándares

- TypeScript estricto
- ESLint + Prettier
- 80%+ cobertura de tests
- Documentación actualizada

## 📝 Licencia

MIT © 2024 SegurITech

## 🆘 Soporte

- 📧 Email: support@securitech.dev
- 💬 Discord: [Comunidad](https://discord.gg/securitech)
- 📚 Docs: https://docs.securitech.dev

---

**Última actualización**: Mayo 2026 | Versión: 1.0.0

