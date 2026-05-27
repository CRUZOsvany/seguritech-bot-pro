# 📂 Estructura del Proyecto

Una guía visual completa de dónde está cada cosa en SegurITech Bot Pro.

## 🌳 Árbol General del Proyecto

```
seguritech-bot-pro/
│
├── 📄 README.md                          ← INICIO AQUÍ
├── 📄 package.json                       ← Monorepo root
├── 📄 tsconfig.json                      ← Config TypeScript global
├── 📄 jest.config.js                     ← Config Jest global
│
├── 📁 backend/                           ← Servidor Node.js/Express
│   ├── src/
│   │   ├── Bootstrap.ts                  ← DI Container, punto de entrada
│   │   ├── index.ts                      ← main()
│   │   │
│   │   ├── 📁 app/
│   │   │   ├── ApplicationContainer.ts   ← Dependency Injection
│   │   │   ├── controllers/
│   │   │   │   └── BotController.ts      ← Entry point paraMessages
│   │   │   └── CommandRoom.ts            ← CLI interactiva
│   │   │
│   │   ├── 📁 domain/                    ← LÓGICA PURA (sin dependencias)
│   │   │   ├── entities/
│   │   │   │   ├── User.ts               ← Usuario que chatea con bot
│   │   │   │   ├── Message.ts            ← Mensaje entrante
│   │   │   │   ├── TenantConfig.ts       ← Config del tenant
│   │   │   │   ├── Order.ts              ← Pedido/Orden
│   │   │   │   ├── UserState.ts          ← Estados de user
│   │   │   │   └── BotTone.ts            ← Tono del bot
│   │   │   │
│   │   │   ├── use-cases/
│   │   │   │   ├── HandleMessageUseCase.ts    ← Procesar mensaje
│   │   │   │   ├── ProcessOrderUseCase.ts     ← Procesar pedido
│   │   │   │   ├── GetCatalogUseCase.ts       ← Obtener catálogo
│   │   │   │   └── ...otros
│   │   │   │
│   │   │   ├── ports/
│   │   │   │   ├── UserRepository.ts     ← Puerto: Persistencia usuarios
│   │   │   │   ├── NotificationPort.ts   ← Puerto: Enviar mensajes
│   │   │   │   ├── TenantConfigPort.ts   ← Puerto: Config por tenant
│   │   │   │   └── ...otros puertos
│   │   │   │
│   │   │   └── interfaces/
│   │   │       └── Types.ts              ← Tipos compartidos del dominio
│   │   │
│   │   ├── 📁 infrastructure/            ← ADAPTADORES & IMPLEMENTACIONES
│   │   │   ├── repositories/
│   │   │   │   ├── SupabaseUserRepository.ts      ← Implementa UserRepository
│   │   │   │   ├── InMemoryUserRepository.ts      ← Para tests
│   │   │   │   └── ...otras implementaciones
│   │   │   │
│   │   │   ├── adapters/
│   │   │   │   ├── MetaWhatsAppAdapter.ts         ← WhatsApp real
│   │   │   │   ├── ConsoleNotificationAdapter.ts  ← Desarrollo
│   │   │   │   ├── ReadlineAdapter.ts             ← CLI input
│   │   │   │   └── ...otros adapters
│   │   │   │
│   │   │   ├── services/
│   │   │   │   ├── SupabaseTenantConfigService.ts ← Cargar config
│   │   │   │   ├── MessageLogService.ts           ← Idempotencia webhook
│   │   │   │   ├── SupabaseClientFactory.ts       ← Factory cliente
│   │   │   │   └── ...otros servicios
│   │   │   │
│   │   │   ├── server/
│   │   │   │   └── ExpressServer.ts               ← Configuración Express
│   │   │   │
│   │   │   └── migrations/
│   │   │       └── ...scripts de BD
│   │   │
│   │   ├── 📁 config/
│   │   │   ├── env.ts                   ← Variables de entorno validadas
│   │   │   ├── logger.ts                ← Configuración de Pino logger
│   │   │   └── constants.ts             ← Constantes globales
│   │   │
│   │   └── 📁 tests/
│   │       ├── unit/
│   │       │   ├── HandleMessageUseCase.test.ts
│   │       │   ├── ProcessOrderUseCase.test.ts
│   │       │   └── ...más tests
│   │       │
│   │       └── integration/
│   │           ├── webhooks.test.ts
│   │           └── multi-tenant.test.ts
│   │
│   ├── 📄 package.json
│   ├── 📄 tsconfig.json
│   ├── 📄 tsconfig.runtime.json
│   ├── 📄 jest.config.js
│   ├── Dockerfile
│   └── .eslintrc.json
│
├── 📁 frontend/                          ← Aplicación Next.js
│   ├── app/
│   │   ├── layout.tsx                    ← Root layout
│   │   ├── page.tsx                      ← Home page
│   │   ├── providers.tsx                 ← Providers (Auth, etc)
│   │   │
│   │   ├── (auth)/
│   │   │   ├── login/                    ← Página de login
│   │   │   ├── signup/                   ← Registro
│   │   │   └── ...más auth routes
│   │   │
│   │   ├── (dashboard)/
│   │   │   ├── page.tsx                  ← Panel principal
│   │   │   ├── users/                    ← Gestión de usuarios
│   │   │   ├── config/                   ← Configuración
│   │   │   ├── messages/                 ← Ver mensajes
│   │   │   └── ...más rutas
│   │   │
│   │   ├── api/
│   │   │   ├── auth/                     ← API Auth endpoints
│   │   │   └── ...API routes
│   │   │
│   │   └── globals.css
│   │
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Header.tsx                ← Encabezado
│   │   │   ├── Sidebar.tsx               ← Barra lateral
│   │   │   └── Footer.tsx                ← Pie de página
│   │   │
│   │   └── ui/
│   │       ├── Button.tsx                ← Componente botón reutilizable
│   │       ├── Card.tsx                  ← Componente tarjeta
│   │       ├── Input.tsx                 ← Componente input
│   │       └── ...más UI components
│   │
│   ├── hooks/
│   │   ├── useAuth.ts                    ← Hook de autenticación
│   │   ├── useFetch.ts                   ← Hook para fetch API
│   │   └── ...más custom hooks
│   │
│   ├── lib/
│   │   ├── api-client.ts                 ← Axios wrapper para API
│   │   ├── auth.ts                       ← Lógica de autenticación
│   │   ├── supabase.ts                   ← Cliente Supabase
│   │   ├── types.ts                      ← Tipos de Frontend
│   │   └── validators.ts                 ← Schemas Zod
│   │
│   ├── public/
│   │   ├── logo.svg
│   │   ├── favicon.ico
│   │   └── ...assets
│   │
│   ├── 📄 package.json
│   ├── 📄 tsconfig.json
│   ├── 📄 next.config.ts
│   ├── 📄 tailwind.config.ts
│   ├── Dockerfile
│   └── .eslintrc.json
│
├── 📁 docs/                              ← Documentación
│   ├── INDEX.md                          ← Índice de docs (EMPIEZA AQUÍ)
│   ├── README.md                         ← Este es en root, arriba
│   ├── ARCHITECTURE.md                   ← Detalle técnico
│   ├── DEVELOPER_GUIDE.md                ← Guía para devs
│   ├── PROJECT_STRUCTURE.md              ← ← ESTE ARCHIVO
│   ├── DEPLOYMENT_STEPS.md               ← Cómo deployar
│   ├── TEST_SUITE_DOCUMENTATION.md      ← Testing
│   ├── META_WHATSAPP_ADAPTER_GUIDE.md   ← WhatsApp integration
│   ├── CHANGELOG_BUG_FIXES.md           ← Cambios/bugs
│   ├── DELIVERY_FINAL.md                ← Estado final
│   └── ...más documentación
│
├── 📁 scripts/                           ← Scripts útiles
│   ├── smoke-test.sh                     ← Test básico de salud
│   ├── hash-password.ts                  ← Utilidad para hashear passwords
│   └── ...otros scripts
│
├── 📁 public/                            ← Assets públicos
│   └── stylesheets/
│       └── style.sass
│
├── 📁 views/                             ← Templates EJS (legacy)
│   ├── index.ejs
│   └── error.ejs
│
├── 📁 supabase/                          ← Configuración local Supabase
│   ├── config.toml                       ← Config local
│   └── migrations/                       ← Migrations BD
│
├── 📁 .github/                           ← GitHub workflows
│   └── workflows/
│       ├── ci.yml                        ← CI/CD pipeline
│       └── deploy.yml
│
├── 📄 docker-compose.yml                 ← Orquestación local
├── 📄 .env.example                       ← Variables de entorno ejemplo
├── 📄 .gitignore                         ← Git ignore
├── 📄 .eslintrc.json                     ← ESLint global
└── 📄 .editorconfig                      ← Editor config
```

## 🎯 Flujos Comunes

### 📥 Cuando Llega un Mensaje

```
1. User sends message to WhatsApp
   ↓
2. Meta webhook → backend/src/infrastructure/server/ExpressServer.ts
   ├─ validates with Zod
   └─ routes to BotController
   ↓
3. backend/src/app/controllers/BotController.ts
   ├─ calls HandleMessageUseCase
   └─ returns response
   ↓
4. backend/src/domain/use-cases/HandleMessageUseCase.ts
   ├─ queries UserRepository (infrastructure/repositories/)
   ├─ applies business logic
   ├─ saves user state
   └─ returns MessageResponse
   ↓
5. Response sent to NotificationPort
   └─ MetaWhatsAppAdapter sends to WhatsApp
   ↓
6. User receives response
```

### 🧪 Cuando Escribes un Test

```
backend/src/tests/unit/
├── MyUseCase.test.ts
│   ├─ import UseCase from domain/use-cases
│   ├─ import Repository from infrastructure/repositories (InMemory version)
│   ├─ create test instances
│   ├─ test business logic
│   └─ no external dependencies
```

### 🔧 Cuando Agregas una Dependencia Externa

```
backend/src/infrastructure/
├─ adapters/
│   └─ MyNewAdapter.ts            ← Nueva clase
│
backend/src/domain/
├─ ports/
│   └─ MyNewPort.ts               ← Nueva interfaz
│
backend/src/app/
├─ ApplicationContainer.ts         ← Inyectar en container

// Dominio NO cambia, solo se usa la interfaz
```

## 📊 Dónde Buscar Cosas

| Necesito | Ubic | Archivo |
|----------|------|---------|
| Procesar mensajes | App | `backend/src/app/controllers/BotController.ts` |
| Lógica de mensaje | Domain | `backend/src/domain/use-cases/HandleMessageUseCase.ts` |
| Guardar usuario | Infra | `backend/src/infrastructure/repositories/SupabaseUserRepository.ts` |
| Enviar WhatsApp | Infra | `backend/src/infrastructure/adapters/MetaWhatsAppAdapter.ts` |
| Config del bot | Domain | `backend/src/domain/entities/TenantConfig.ts` |
| Tests | Tests | `backend/src/tests/unit/HandleMessageUseCase.test.ts` |
| Login | Frontend | `frontend/app/(auth)/login/page.tsx` |
| UI Components | Frontend | `frontend/components/ui/Button.tsx` |
| API calls | Frontend | `frontend/lib/api-client.ts` |
| Estilos | Frontend | `frontend/app/globals.css` |

## 🔑 Archivos Importantes

### Configuración
- `backend/package.json` - dependencias del backend
- `frontend/package.json` - dependencias del frontend
- `.env` - variables de entorno (no versionado)
- `.env.example` - plantilla de .env

### Tipado & Linting
- `tsconfig.json` (root) - configuración TypeScript global
- `backend/tsconfig.json` - TS backend específico
- `frontend/tsconfig.json` - TS frontend específico
- `.eslintrc.json` - ESLint base

### Testing
- `jest.config.js` (root) - Jest global
- `backend/jest.config.js` - Jest backend

### Docker
- `docker-compose.yml` - orquestación de servicios
- `backend/Dockerfile` - imagen Docker backend
- `frontend/Dockerfile` - imagen Docker frontend

### Documentación
- `README.md` - HOME, empieza aquí
- `docs/INDEX.md` - índice de toda la documentación
- `docs/ARCHITECTURE.md` - arquitectura técnica
- `docs/DEVELOPER_GUIDE.md` - guía de desarrollo

## 📌 Tips de Navegación

### CLI Rápida para la Estructura

```bash
# Ver estructura con tree
tree -L 3 -I 'node_modules|dist' backend/src

# Ver archivos TS
find backend/src -name "*.ts" | head -20

# Buscar en todo el código
grep -r "HandleMessageUseCase" --include="*.ts" backend/

# Watch para cambios
npm run test:watch
```

### VS Code - Buscar Rápido

- `Ctrl+P` - Ir a archivo
- `Ctrl+Shift+F` - Buscar en todo el código
- `Ctrl+F` - Buscar en archivo actual

### Abrir Rápido en Terminal

```bash
# Backend
cd backend
npm run dev

# Frontend  
cd frontend
npm run dev

# Ambos (desde root)
npm run dev
```

---

**Última actualización**: Mayo 2026

**¿Preguntas sobre ubicación?** Consulta [DEVELOPER_GUIDE.md](./DEVELOPER_GUIDE.md)

