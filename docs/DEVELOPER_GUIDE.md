# 📖 Guía de Desarrollo

**Estándares, flujos de trabajo y mejores prácticas para SegurITech Bot Pro**

## 📋 Índice

1. [Setup del Entorno](#setup-del-entorno)
2. [Estructura de Proyectos](#estructura-de-proyectos)
3. [Estándares de Código](#estándares-de-código)
4. [Testing](#testing)
5. [Git Workflow](#git-workflow)
6. [Debugging](#debugging)
7. [Performance](#performance)
8. [Troubleshooting](#troubleshooting)

## Setup del Entorno

### Requisitos

```bash
# Node.js
node --version  # >= 18.0.0

# npm
npm --version   # >= 9.0.0

# Optional: Docker
docker --version
docker-compose --version
```

### Instalación Inicial

```bash
# 1. Clonar
git clone <repo-url>
cd seguritech-bot-pro

# 2. Instalar dependencias globales del monorepo
npm install

# 3. Instalar dependencias de cada workspace
npm install --workspace backend
npm install --workspace frontend

# 4. Copiar archivo .env
cp .env.example .env
# Editar .env con tus credenciales Supabase y Meta

# 5. (Opcional) Iniciar Supabase local
docker-compose up -d

# 6. Verificar setup
npm run type-check  # Sin errores de tipos
npm run test        # Tests pasan
```

### Variables de Entorno Necesarias

**`.env` (Backend)**:
```env
# Supabase
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_KEY=eyJhbGc...

# Meta WhatsApp
META_PHONE_NUMBER_ID=102010...
META_ACCESS_TOKEN=EAA...
META_VERIFY_TOKEN=mi_token_secreto

# Aplicación
NODE_ENV=development
PORT=3001
LOG_LEVEL=debug
```

**`.env.local` (Frontend)**:
```env
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
```

## Estructura de Proyectos

### Backend - Flujo de Archivos

```
backend/src/

1. Entrada: index.ts
   └─ Bootstrap.ts (DI Container)
   
2. Controlador: app/controllers/BotController.ts
   ├─ Valida request
   └─ Orquesta use cases

3. Lógica: domain/use-cases/HandleMessageUseCase.ts
   ├─ Procesa el mensaje
   ├─ Consulta repositorio
   └─ Retorna respuesta

4. Persistencia: infrastructure/repositories/SupabaseUserRepository.ts
   ├─ Implementa puerto UserRepository
   └─ Interactúa con DB

5. Notificación: infrastructure/adapters/MetaWhatsAppAdapter.ts
   ├─ Implementa puerto NotificationPort
   └─ Envía a Meta/WhatsApp
```

### Frontend - Estructura Next.js

```
frontend/

app/                    # App Router
├── (auth)/            # Rutas protegidas
│   └── dashboard/     # Panel principal
├── (public)/          # Rutas públicas
│   └── login/         # Login
└── api/               # API routes

components/
├── layout/            # Componentes de layout
└── ui/                # UI reutilizable

hooks/
└── useAuth.ts         # Custom hook para auth

lib/
├── api-client.ts      # API client (axios wrapper)
├── auth.ts            # Lógica de autenticación
├── supabase.ts        # Cliente Supabase
├── types.ts           # Tipos compartidos
└── validators.ts      # Schemas Zod
```

## Estándares de Código

### 1. TypeScript Strict

```typescript
// ✅ Buen código
interface UserRepository {
  findByPhoneNumber(tenantId: string, phone: string): Promise<User | null>;
}

class HandleMessageUseCase {
  constructor(private userRepository: UserRepository) {}
  
  async execute(message: Message): Promise<MessageResponse> {
    const user = await this.userRepository.findByPhoneNumber(
      message.tenantId,
      message.from
    );
    if (!user) {
      throw new Error('User not found');
    }
    return { /* ... */ };
  }
}

// ❌ Evita
interface UserRepository {
  findByPhoneNumber(tenantId: any, phone: any): Promise<any>;
}
```

### 2. Nombramiento

```typescript
// ✅ Clases: PascalCase
class HandleMessageUseCase { }
class UserRepository { }
class MetaWhatsAppAdapter { }

// ✅ Funciones/métodos: camelCase
function processMessage() { }
async fetchUserFromDb() { }

// ✅ Constantes: UPPER_SNAKE_CASE
const MAX_RETRIES = 3;
const DEFAULT_TIMEOUT = 5000;

// ✅ Variables: camelCase
let currentUser: User;
const phoneNumber = '521234567890';

// ✅ Interfaces: PascalCase (sin "I")
interface UserRepository { }
interface NotificationPort { }

// ✅ Enums: PascalCase
enum UserState {
  MENU = 'MENU',
  VIEWING_CATALOG = 'VIEWING_CATALOG'
}
```

### 3. Imports Organizados

```typescript
// 1. Node.js built-ins
import * as fs from 'fs';
import * as path from 'path';

// 2. Dependencias externas  
import express from 'express';
import { createClient } from '@supabase/supabase-js';

// 3. Path aliases
import { UserRepository } from '@/domain/ports';
import { SupabaseUserRepository } from '@/infrastructure/repositories';

// 4. Relativos
import { logger } from './logger';
```

### 4. Comments y JSDoc

```typescript
/**
 * Procesa un mensaje entrante y genera una respuesta.
 * 
 * @param message - Mensaje del usuario
 * @param config - Configuración del tenant
 * @returns Respuesta generada
 * 
 * @example
 * const response = await useCase.execute(message, config);
 * console.log(response.message); // "¿Qué necesitas?"
 * 
 * @throws {UserNotFoundError} Si el usuario no existe
 */
async execute(message: Message, config: TenantConfig): Promise<MessageResponse> {
  // Buscar usuario...
  const user = await this.userRepository.findByPhoneNumber(
    message.tenantId,
    message.from
  );
  
  // Si no existe, crear nuevo
  if (!user) {
    // ... crear usuario
  }
  
  return response;
}
```

### 5. Manejo de Errores

```typescript
// ✅ Usa errores específicos
class UserNotFoundError extends Error {
  constructor(tenantId: string, phone: string) {
    super(`User ${phone} not found in tenant ${tenantId}`);
    this.name = 'UserNotFoundError';
  }
}

// ✅ Validación temprana
async execute(request: unknown): Promise<void> {
  const validated = RequestSchema.parse(request);
  // Ahora validated es tipado y validado
}

// ❌ Evita swallow errors
try {
  await something();
} catch (e) {
  // Nunca lo hagas
}

// ✅ Re-throw con contexto
try {
  await database.save(user);
} catch (error) {
  logger.error({ userId: user.id, err: error }, 'Failed to save user');
  throw new PersistenceError('Could not save user', error);
}
```

## Testing

### Test Structure

```typescript
// ✅ Buen test
describe('HandleMessageUseCase', () => {
  let repo: InMemoryUserRepository;
  let useCase: HandleMessageUseCase;

  beforeEach(() => {
    repo = new InMemoryUserRepository();
    useCase = new HandleMessageUseCase(repo);
  });

  it('should show welcome message for new users', async () => {
    // Arrange
    const message = makeMessage('hola');
    const config = makeTenantConfig();
    
    // Act
    const result = await useCase.execute(message, config);
    
    // Assert
    expect(result.message).toContain('¡Hola!');
    expect(result.nextState).toBe(UserState.MENU);
  });

  it('should isolate users by tenant', async () => {
    // Arrange
    const msgA = makeMessage('hola', 'tenant-a');
    const msgB = makeMessage('hola', 'tenant-b');
    
    // Act
    await useCase.execute(msgA, configA);
    await useCase.execute(msgB, configB);
    
    // Assert
    const usersA = await repo.findAll('tenant-a');
    const usersB = await repo.findAll('tenant-b');
    expect(usersA.length).toBe(1);
    expect(usersB.length).toBe(1);
  });
});
```

### Corriendo Tests

```bash
# Todos los tests
npm run test

# Watch mode (rerun on file change)
npm run test:watch

# Con cobertura
npm run test:coverage

# Solo integration tests
npm run test:integration

# Solo un archivo
npm run test -- HandleMessageUseCase.test.ts

# Solo tests que matcheen un patrón
npm run test -- --testNamePattern="should isolate"
```

### Cobertura Esperada

- **Global**: 80%+
- **Domain**: 100% (es crítico)
- **Controllers**: 90%
- **Infrastructure**: 70%

```bash
npm run test:coverage

# Genera reporte HTML en coverage/
open coverage/lcov-report/index.html
```

## Git Workflow

### Ramas

```
main
├── production-ready code
├── tagged con versiones (v1.0.0)
└── solo hot-fixes urgentes

develop
├── rama de integración
├── feature branches se mergean aquí
└── base para releases

hotfix/bug-name
├── para fixes urgentes en prod
└── se mergea a main y develop

feature/feature-name
├── se crea desde develop
└── se mergea a develop via PR
```

### Crear Feature

```bash
# 1. Actualizar develop
git checkout develop
git pull origin develop

# 2. Crear rama
git checkout -b feature/my-feature

# 3. Hacer cambios y commits
git add .
git commit -m "feat: add user validation"

# 4. Push
git push origin feature/my-feature

# 5. Abrir PR en GitHub
```

### Commit Messages

```
// ✅ Buen formato
feat: add multi-tenant support
fix: prevent data leakage between tenants
docs: update architecture guide
test: add tests for HandleMessageUseCase
refactor: extract TenantConfigService
style: format code with prettier
chore: update dependencies

// ❌ Evita
fixed something
update code
asdf
Update README.md
```

### Merge a Develop

```bash
# 1. Asegúrate que está al día
git checkout develop
git pull origin develop

# 2. Mergea tu rama
git merge feature/my-feature

# 3. Push
git push origin develop

# 4. Delete rama local y remota
git branch -d feature/my-feature
git push origin --delete feature/my-feature
```

## Debugging

### Logs en Backend

```typescript
import pino from 'pino';

const logger = pino();

// Nivel DEBUG
logger.debug({ userId: user.id }, 'User found');

// Nivel INFO
logger.info('App started on port 3001');

// Nivel WARN
logger.warn('Config not found, using defaults');

// Nivel ERROR
logger.error({ err: error }, 'Failed to save user');

// Con contexto
logger.child({ tenantId, userId }).info('Processing message');
```

**Ver logs**:
```bash
# Terminal 1: Backend
npm run dev       # Logs en tiempo real

# Terminal 2: Inspecionar
tail -f logs/app.log  # Si usas archivo
```

### Debugging en VS Code

**.vscode/launch.json**:
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Launch Backend",
      "program": "${workspaceFolder}/backend/src/index.ts",
      "outFiles": [
        "${workspaceFolder}/backend/dist/**/*.js"
      ],
      "console": "integratedTerminal"
    }
  ]
}
```

### Debugging Tests

```bash
# Run tests con debugger
node --inspect-brk node_modules/.bin/jest --runInBand

# Luego abre chrome://inspect en navegador
```

## Performance

### Benchmarking

```bash
# Medir tiempo de startup
time npm run dev

# Medir cobertura
npm run test:coverage

# Analizar bundle size
npm run build
size-limit  # Si lo tienes instalado
```

### Optimizaciones Comunes

1. **Caché de TenantConfig**
   ```typescript
   // Ya está en SupabaseTenantConfigService
   // 5 minutos de TTL
   ```

2. **Batch queries**
   ```typescript
   // ❌ Lento: loop de queries
   for (const user of users) {
     await userRepository.findByPhone(user.phone);
   }
   
   // ✅ Rápido: batch
   const allUsers = await userRepository.findByPhones(phones);
   ```

3. **Índices en DB**
   ```sql
   CREATE INDEX idx_users_tenant_phone 
   ON users(tenant_id, phone);
   ```

## Troubleshooting

### Error: "Cannot find module '@/domain/ports'"

```bash
# ✅ Solución
# Verificar tsconfig.json tiene:
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  }
}

# Reconstruir
npm run build
```

### Tests fallan con "Cannot find module"

```bash
# ✅ Solución
npm run type-check
npm install --workspace backend
npm run test:watch
```

### "Port 3001 already in use"

```bash
# ✅ Solución Windows
netstat -ano | findstr :3001
taskkill /PID <PID> /F

# ✅ Solución Unix
lsof -i :3001
kill -9 <PID>
```

### Supabase connection timeout

```bash
# ✅ Verificar variables de entorno
cat .env | grep SUPABASE

# ✅ Verificar conectividad
curl https://<your-project>.supabase.co/rest/v1/tables \
  -H "Authorization: Bearer $SUPABASE_KEY"

# ✅ Ver logs de Supabase en dashboard
```

### "Type 'User' not found" pero el archivo existe

```bash
# ✅ Solución
# a) Verificar path alias
grep -r "from '@/domain" src/

# b) Verificar export
# En domain/entities/User.ts debe tener:
export type User = { ... }
// o
export class User { ... }

# c) Re-instalar
rm -rf node_modules
npm install --workspace backend
```

---

**Última actualización**: Mayo 2026

**¿Preguntas?** Abre un issue o discute en Discord.

