# 🏗️ Arquitectura de SegurITech Bot Pro

**Documentación técnica detallada de la arquitectura hexagonal**

## 📋 Índice

1. [Visión General](#visión-general)
2. [Capas Arquitectónicas](#capas-arquitectónicas)
3. [Patrones de Diseño](#patrones-de-diseño)
4. [Flujo de Mensajes](#flujo-de-mensajes)
5. [Multi-tenancy](#multi-tenancy)
6. [Componentes Principales](#componentes-principales)
7. [Decisiones Arquitectónicas](#decisiones-arquitectónicas)

## Visión General

SegurITech Bot Pro implementa una **Arquitectura Hexagonal (Ports & Adapters)** que permite:

✅ **Independencia tecnológica**: Cambiar implementaciones sin afectar la lógica de negocio
✅ **Testabilidad**: Tests unitarios sin mocks complejos
✅ **Escalabilidad**: Fácil agregar nuevos adaptadores
✅ **Mantenibilidad**: Separación clara de responsabilidades

### Diagram de Alto Nivel

```
                          ┌─────────────────────┐
                          │   WhatsApp Meta     │
                          │    (External)       │
                          └──────────┬──────────┘
                                    │
                    ┌───────────────┴──────────────┐
                    │                              │
            ┌───────▼────────┐           ┌────────▼─────┐
            │   Express      │           │  Readline    │
            │ (Webhook)      │           │  (CLI Dev)   │
            └───────┬────────┘           └────────┬─────┘
                    │                              │
            ┌───────┴──────────────────────────────┴───────┐
            │      Controllers / Request Handlers          │
            └───────┬──────────────────────────────────────┘
                    │
      ┌─────────────┴──────────────┐
      │                            │
      │  CAPA DE APLICACIÓN        │
      │  ├─ ApplicationContainer   │
      │  └─ Controllers            │
      │                            │
      └──────────┬─────────────────┘
                 │
      ┌──────────┴───────────────────────────────┐
      │      CAPA DE DOMINIO (Negocio)           │
      │  ├─ HandleMessageUseCase                  │
      │  ├─ ProcessOrderUseCase                   │
      │  ├─ Entities (User, Order, Message)     │
      │  ├─ Ports (Interfaces)                   │
      │  └─ Value Objects                        │
      │                                          │
      └──────────┬───────────────────────────────┘
                 │
     ┌───────────┴──────────────┬──────────────┐
     │                          │              │
┌────▼────────────┐  ┌─────────▼──────┐  ┌────▼───────────┐
│ INFRAESTRUCTURA │  │   PUERTOS      │  │   ADAPTADORES  │
│                │  │                │  │                │
│RepositorioImpl │◄─┤ UserRepository │─►│ SupabaseUser   │
│                │  │                │  │                │
│ ServiceImpl     │◄─┤ Notification   │─►│ MetaWhatsApp   │
│                │  │                │  │ ConsoleNotif   │
│ FactoryImpl     │◄─┤ TenantConfig   │─►│ SupabaseConfig │
│                │  │                │  │                │
└────────────────┘  └────────────────┘  └────────────────┘
         │
    ┌────┴──────────────────────────┐
    │      Supabase (PostgreSQL)     │
    │  + Express Server              │
    │  + Pino Logger                 │
    │  + Zod Validator               │
    └────────────────────────────────┘
```

## Capas Arquitectónicas

### 1. Domain (Lógica de Negocio Pura)

**Ubicación**: `backend/src/domain/`

**Responsabilidad**: Reglas de negocio sin dependencias externas

```
domain/
├── entities/
│   ├── User.ts                # Usuario que interactúa con el bot
│   ├── BotTone.ts             # Enumeración de tonos (amigable, formal, etc.)
│   ├── UserState.ts           # Estados del usuario (MENU, VIEWING_CATALOG, etc.)
│   ├── Message.ts             # Mensaje de entrada
│   ├── TenantConfig.ts        # Configuración por tenant
│   └── Order.ts               # Pedido (si aplica)
│
├── use-cases/
│   ├── HandleMessageUseCase.ts     # Procesar mensaje entrante
│   ├── ProcessOrderUseCase.ts      # Procesar pedido
│   ├── GetCatalogUseCase.ts        # Obtener catálogo
│   └── ...otros casos de uso
│
├── ports/
│   ├── UserRepository.ts       # Puerto para persistencia de usuarios
│   ├── NotificationPort.ts     # Puerto para enviar notificaciones
│   └── TenantConfigPort.ts     # Puerto para config de tenant
│
└── interfaces/
    └── Types.ts                # Interfaces y tipos del dominio
```

**Características**:
- ✅ Sin dependencias externas
- ✅ 100% testeable con mocks simples
- ✅ Reglas de negocio centralizadas
- ✅ Independiente del framework

**Ejemplo - Use Case**:
```typescript
export class HandleMessageUseCase {
  constructor(private userRepository: UserRepository) {}

  async execute(message: Message, config: TenantConfig): Promise<MessageResponse> {
    const user = await this.userRepository.findByPhoneNumber(
      message.tenantId,
      message.from
    );
    
    // Lógica de negocio pura - procesar el mensaje
    const nextState = this.determineNextState(user, message);
    const response = this.generateResponse(nextState, config);
    
    // Persistir cambios a través del puerto
    await this.userRepository.save(user);
    
    return response;
  }
}
```

### 2. Application (Orquestación)

**Ubicación**: `backend/src/app/`

**Responsabilidad**: Orquestar use cases, inyectar dependencias

```
app/
├── ApplicationContainer.ts     # Dependency Injection Container
├── Controllers/
│   ├── BotController.ts        # Controlador principal del bot
│   └── AdminController.ts      # Funciones administrativas
└── CommandRoom.ts              # CLI para desarrollo
```

**Ejemplo - DI Container**:
```typescript
export class ApplicationContainer {
  constructor(
    private userRepository: UserRepository,
    private notificationPort: NotificationPort,
    private tenantConfigService: TenantConfigService,
    private logger: Logger
  ) {}

  getBotController(): BotController {
    const handleMessageUseCase = new HandleMessageUseCase(
      this.userRepository
    );
    return new BotController(
      handleMessageUseCase,
      this.tenantConfigService,
      this.logger
    );
  }
}
```

### 3. Infrastructure (Implementaciones)

**Ubicación**: `backend/src/infrastructure/`

**Responsabilidad**: Conectar el dominio con el mundo exterior

```
infrastructure/
├── repositories/
│   ├── SupabaseUserRepository.ts       # Implementa UserRepository
│   ├── InMemoryUserRepository.ts       # Para tests
│   └── ...otras implementaciones
│
├── adapters/
│   ├── MetaWhatsAppAdapter.ts          # Integración con WhatsApp Meta
│   ├── ConsoleNotificationAdapter.ts   # Output en consola (dev)
│   ├── ReadlineAdapter.ts              # Input por CLI
│   └── ...otros adaptadores
│
├── services/
│   ├── SupabaseTenantConfigService.ts  # Cargar config de Supabase
│   ├── MessageLogService.ts            # Idempotencia de webhooks
│   ├── SupabaseClientFactory.ts        # Factory del cliente
│   └── ...otros servicios
│
├── server/
│   └── ExpressServer.ts                # Configuración de Express
│
└── repositories/
    └── ...implementaciones de puertos
```

**Características**:
- 🔌 Implementan los puertos del dominio
- 📦 Inyectables en el contenedor
- 🧪 Pueden reemplazarse fácilmente
- 🔄 Datos fluyen hacia/desde la capa de dominio

**Ejemplo - Adapter**:
```typescript
export class MetaWhatsAppAdapter implements NotificationPort {
  async sendMessage(to: string, text: string): Promise<void> {
    const response = await this.httpClient.post('/messages', {
      messaging_product: 'whatsapp',
      to,
      text: { body: text }
    });
    return response.data;
  }
}
```

## Patrones de Diseño

### 1. **Hexagonal Architecture**
- Puertos (interfaces) en el dominio
- Adaptadores (implementaciones) en infraestructura
- Aislamiento total de la lógica de negocio

### 2. **Dependency Injection**
```typescript
// ❌ Acoplamiento fuerte
class BotController {
  private repo = new SupabaseUserRepository();
}

// ✅ Inyección de dependencias
class BotController {
  constructor(private repo: UserRepository) {}
}
```

### 3. **Repository Pattern**
```typescript
// Puerto (Dominio)
interface UserRepository {
  findByPhoneNumber(tenantId: string, phone: string): Promise<User>;
  save(user: User): Promise<void>;
}

// Adaptador (Infraestructura)
class SupabaseUserRepository implements UserRepository {
  async findByPhoneNumber(tenantId: string, phone: string): Promise<User> {
    return this.supabase
      .from('users')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('phone', phone)
      .single();
  }
}
```

### 4. **Service Locator (Opcional)**
```typescript
const container = new ApplicationContainer(...);
const botController = container.getBotController();
```

### 5. **Adapter Pattern**
Múltiples implementaciones del mismo puerto:
- `SupabaseUserRepository` (Producción)
- `InMemoryUserRepository` (Tests)
- `PostgresUserRepository` (Alternativa)

## Flujo de Mensajes

### 1️⃣ Entrada: Webhook de Meta

```
Meta WhatsApp → POST /webhook → ExpressServer → BotController
```

### 2️⃣ Procesamiento: Use Case

```
BotController
  ↓
HandleMessageUseCase.execute()
  ├─ Buscar usuario (UserRepository)
  ├─ Determinar próximo estado
  ├─ Generar respuesta
  └─ Guardar usuario (UserRepository)
```

### 3️⃣ Salida: Notificación

```
BotController
  ↓
NotificationPort.sendMessage()
  ↓
MetaWhatsAppAdapter → Meta WhatsApp API
```

### 4️⃣ CLI Interactiva (Dev)

```
ReadlineAdapter → BotController → procesamiento normal
```

## Multi-tenancy

### Aislamiento por Tenant

```
┌────────────────────────────────────────────┐
│           Tenant A                         │
│  ├─ Usuarios (phone, email, etc)          │
│  ├─ Configuración (tono, mensajes)        │
│  └─ Datos (pedidos, historial)            │
│                                          │
│  Completamente aislado                    │
└────────────────────────────────────────────┘

┌────────────────────────────────────────────┐
│           Tenant B                         │
│  ├─ Usuarios (independientes)              │
│  ├─ Configuración (propia)                 │
│  └─ Datos (separados de A)                 │
│                                          │
│  Completamente aislado                    │
└────────────────────────────────────────────┘
```

**Implementación**:

```typescript
// Todos los queries incluyen tenant_id
async findByPhoneNumber(tenantId: string, phone: string): Promise<User> {
  return this.supabase
    .from('users')
    .select('*')
    .eq('tenant_id', tenantId)  // ← CRÍTICO
    .eq('phone', phone)
    .single();
}

// Webhook recibe tenant_id en la URL o payload
POST /webhook/:tenantId/messages
```

## Componentes Principales

### ✅ UserRepository

**Propósito**: Persistencia de usuarios

**Métodos**:
```typescript
interface UserRepository {
  findByPhoneNumber(tenantId: string, phone: string): Promise<User | null>;
  save(user: User): Promise<void>;
  update(user: User): Promise<void>;
  delete(tenantId: string, phone: string): Promise<void>;
}
```

**Implementaciones**:
- `SupabaseUserRepository` ← Producción
- `InMemoryUserRepository` ← Tests

### ✅ NotificationPort

**Propósito**: Enviar mensajes a usuarios

**Métodos**:
```typescript
interface NotificationPort {
  sendMessage(to: string, text: string, metadata?: any): Promise<void>;
}
```

**Implementaciones**:
- `MetaWhatsAppAdapter` ← WhatsApp real
- `ConsoleNotificationAdapter` ← Desarrollo

### ✅ TenantConfigService

**Propósito**: Cargar configuración por tenant

```typescript
interface TenantConfigService {
  getConfig(tenantId: string): Promise<TenantConfig>;
}
```

**Implementaciones**:
- `SupabaseTenantConfigService` ← Con caché de 5 min

### ✅ BotController

**Propósito**: Orquestar la lógica de entrada

```typescript
class BotController {
  async processMessage(
    tenantId: string,
    phoneNumber: string,
    text: string,
    metaMessageId?: string
  ): Promise<void> {
    // 1. Cargar configuración del tenant
    // 2. Ejecutar use case
    // 3. Enviar respuesta
    // 4. Log
  }
}
```

## Decisiones Arquitectónicas

### ✅ Por qué Hexagonal?

| Beneficio | Impacto |
|-----------|---------|
| Independencia tecnológica | Cambiar BD sin tocar use cases |
| Testabilidad | 0 mocks complejos, 100% cobertura fácil |
| Mantenibilidad | Nuevos devs entienden rápido |
| Escalabilidad | Agregar nuevos adapters es trivial |

### ✅ Por qué Express (no NestJS/Fastify)?

- Ligereza: Menos overhead para webhook simple
- Control: Máximo control sobre el flujo
- Comunidad: Amplio ecosistema
- Aprendizaje: Más sencillo que NestJS

### ✅ Por qué TypeScript?

- Type safety: Menos bugs en tiempo de compilación
- Mantenibilidad: Documentación automática
- IDE support: Autocompletado excelente
- Productividad: Refactoring seguro

### ✅ Multi-tenancy a nivel aplicación (no DB)

**Ventajas**:
- 1 aplicación para todos los tenants
- Bajo costo operativo
- Escalabilidad horizontal simple

**Desventajas**:
- Riesgo de data leakage (mitigado con tests)
- Configuración centralizada

### ✅ Supabase como BaaS

**Ventajas**:
- PostgreSQL robusto
- Auth integrada
- RLS (Row Level Security) para tenant isolation
- API REST automática
- Realtime capabilities

**Desventajas**:
- Vendor lock-in
- Latencia de red

## 📊 Flujo Completo: Un Mensaje

```
1. Usuario envía "hola" por WhatsApp
   ↓
2. Meta webhook → POST /webhook/tenant-a?phone=521234567890&text=hola
   ↓
3. ExpressServer.handle()
   ├─ Valida con Zod
   └─ Llama BotController.processMessage()
   ↓
4. BotController.processMessage()
   ├─ Busca config de Tenant A (caché)
   └─ Ejecuta HandleMessageUseCase.execute()
   ↓
5. HandleMessageUseCase.execute()
   ├─ Busca Usuario (UserRepository)
   ├─ Determina estado: MENU
   ├─ Genera respuesta
   └─ Guarda usuario (UserRepository)
   ↓
6. Respuesta retorna a BotController
   ├─ Llama NotificationPort.sendMessage()
   └─ MetaWhatsAppAdapter envía a Meta
   ↓
7. Meta entrega a WhatsApp
   ↓
8. Usuario recibe "¡Hola! Soy TestBot..."
```

## 🔒 Seguridad en Arquitectura

```
┌─────────────────────────────────┐
│ Validación (Zod)                │
├─────────────────────────────────┤
│ Rate Limiting (Express)         │
├─────────────────────────────────┤
│ CORS / Helmet                   │
├─────────────────────────────────┤
│ Autenticación JWT               │
├─────────────────────────────────┤
│ Aislamiento Multi-tenant        │
├─────────────────────────────────┤
│ Encriptación (bcrypt)           │
├─────────────────────────────────┤
│ Logging y Auditoría             │
└─────────────────────────────────┘
```

---

**Última actualización**: Mayo 2026

