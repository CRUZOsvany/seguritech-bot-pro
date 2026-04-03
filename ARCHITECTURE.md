# Documentación de Arquitectura

## Visión General

Este documento describe la arquitectura del **SegurITech Bot Pro** y cómo se organiza el código para maximizar mantenibilidad, escalabilidad y testabilidad.

---

## 1. Principios Arquitectónicos

### 1.1 Arquitectura Hexagonal (Ports & Adapters)

El proyecto implementa arquitectura hexagonal para desacoplar la lógica de negocio de los detalles de implementación.

**Beneficios:**
- ✅ Dominio independiente de frameworks
- ✅ Fácil cambio de tecnologías
- ✅ Testeable sin dependencias externas
- ✅ Escalable a múltiples adaptadores

### 1.2 Clean Code

Seguimos principios de Robert Martin (Uncle Bob):
- Nombres significativos
- Funciones pequeñas y enfocadas
- DRY (Don't Repeat Yourself)
- SOLID Principles

### 1.3 SOLID Principles

| Principio | Implementación |
|-----------|---|
| **S**ingle Responsibility | Cada clase tiene una razón para cambiar |
| **O**pen/Closed | Abierto para extensión (nuevos adaptadores), cerrado para modificación |
| **L**iskov Substitution | Adaptadores intercambiables |
| **I**nterface Segregation | Puertos específicos (NotificationPort, UserRepository) |
| **D**ependency Inversion | Inyectamos interfaces, no implementaciones |

---

## 2. Estructura en Capas

```
┌─────────────────────────────────────────┐
│         INFRAESTRUCTURA (Adapters)      │
│  WhatsApp │ Database │ Email │ Console  │
└──────────────┬──────────────────────────┘
               │ Implementa Puertos
               ↓
┌──────────────────────────────────────────┐
│         APLICACIÓN (Controllers)         │
│     BotController, Contenedor DI        │
└──────────────┬──────────────────────────┘
               │ Usa Casos de Uso
               ↓
┌──────────────────────────────────────────┐
│         DOMINIO (Lógica Pura)           │
│  UseCase │ Entities │ Puertos │ Reglas   │
└──────────────────────────────────────────┘
```

---

## 3. Componentes Detallados

### 3.1 Capa de Dominio

#### Entidades (`domain/entities/`)
Representan conceptos del negocio:
- `Message`: Mensaje recibido
- `User`: Usuario del bot con estado
- `Product`: Producto disponible
- `Order`: Pedido del cliente
- `UserState`: Estados de conversación
- `BotResponse`: Respuesta del bot

```typescript
export interface User {
  id: string;
  phoneNumber: string;
  currentState: UserState; // Mantiene contexto conversacional
  createdAt: Date;
  updatedAt: Date;
}
```

#### Puertos (`domain/ports/`)
Definen contratos que adaptadores deben cumplir:
- `UserRepository`: Persistencia de usuarios
- `ProductRepository`: Persistencia de productos
- `OrderRepository`: Persistencia de órdenes
- `NotificationPort`: Envío de mensajes

```typescript
export interface NotificationPort {
  sendMessage(phoneNumber: string, message: string): Promise<void>;
  sendButtons(phoneNumber: string, message: string, buttons: string[]): Promise<void>;
}
```

#### Casos de Uso (`domain/use-cases/`)
Orquestan la lógica de negocio:
- `HandleMessageUseCase`: Procesa mensaje → genera respuesta

```typescript
export class HandleMessageUseCase {
  async execute(message: Message): Promise<BotResponse> {
    // 1. Obtener/crear usuario
    // 2. Determinar estado actual
    // 3. Procesar según estado
    // 4. Actualizar estado si cambia
    // 5. Retornar respuesta
  }
}
```

### 3.2 Capa de Aplicación

#### BotController (`app/controllers/BotController.ts`)
Orquesta la entrada/salida:
```typescript
async processMessage(from: string, content: string): Promise<void> {
  const message = new Message(from, content);
  const response = await this.useCase.execute(message);
  await this.notificationPort.send(response);
}
```

#### ApplicationContainer (`app/ApplicationContainer.ts`)
Inyección de dependencias centralizada:
```typescript
const userRepository = new InMemoryUserRepository();
const notificationPort = new ConsoleNotificationAdapter();
const container = new ApplicationContainer(
  userRepository,
  notificationPort,
  logger,
);
```

### 3.3 Capa de Infraestructura

#### Adaptadores (`infrastructure/adapters/`)

**ConsoleNotificationAdapter**
- Imprime mensajes en consola
- Útil para desarrollo y testing

**BaileysWhatsAppAdapter** (Futuro)
- Implementa NotificationPort
- Se conecta a WhatsApp a través de Baileys
- Maneja QR, reconexiones, sesiones

**Patrón de Adaptador:**
```typescript
export class BaileysWhatsAppAdapter implements NotificationPort {
  async sendMessage(phoneNumber: string, message: string): Promise<void> {
    // Código específico de Baileys
  }
}
```

#### Repositorios (`infrastructure/repositories/`)

**InMemoryUserRepository**
- Implementa UserRepository
- Almacena usuarios en memoria (desarrollo)
- En producción: MongoDB, PostgreSQL, etc.

```typescript
export class InMemoryUserRepository implements UserRepository {
  private users: Map<string, User> = new Map();

  async save(user: User): Promise<void> {
    this.users.set(user.id, user);
  }
}
```

---

## 4. Flujo de Ejecución

### Cuando llega un mensaje:

```
1. ENTRADA
   WhatsApp (o adaptador) → mensaje recibido
   
2. ADAPTACIÓN
   BaileysWhatsAppAdapter convierte evento → Message
   
3. APLICACIÓN
   BotController.processMessage(from, content)
   
4. DOMINIO
   HandleMessageUseCase.execute(message)
   - Obtener usuario
   - Determinar estado
   - Generar respuesta
   
5. PERSISTENCIA
   UserRepository.update(user)
   
6. SALIDA
   NotificationPort.sendMessage(response)
   - ConsoleNotificationAdapter (dev)
   - BaileysWhatsAppAdapter (prod)
   
7. RESPUESTA
   Usuario recibe mensaje en WhatsApp
```

---

## 5. Gestión de Estado

El bot mantiene el estado de cada usuario:

```typescript
enum UserState {
  INITIAL,        // Primer mensaje
  MENU,           // Mostrando menú
  VIEWING_PRODUCTS,
  MAKING_ORDER,
  CONFIRMING_ORDER,
}

User {
  id: string
  phoneNumber: string
  currentState: UserState  // ← Contexto de conversación
}
```

Cuando llega un mensaje, se procesa diferente según `currentState`:

```typescript
switch (user.currentState) {
  case UserState.INITIAL:
    // Responder a saludo inicial
    response = this.handleInitialState(message);
    break;
    
  case UserState.MENU:
    // Procesar selección de menú
    response = this.handleMenuState(message);
    break;
    
  case UserState.MAKING_ORDER:
    // Procesar selección de producto
    response = this.handleMakingOrderState(message);
    break;
}
```

---

## 6. Inyección de Dependencias

### Problema: Acoplamiento Directo
```typescript
// ❌ MAL: Acoplado a implementación específica
export class BotController {
  constructor() {
    this.repo = new MongoUserRepository(); // Acoplado
  }
}
```

### Solución: Inyectar Interfaces
```typescript
// ✅ BIEN: Desacoplado, inyectamos puerto
export class BotController {
  constructor(
    private userRepository: UserRepository,  // Interface
  ) {}
}

// En ApplicationContainer:
const container = new ApplicationContainer(
  new MongoUserRepository(),  // Intercambiable
);
```

**Ventajas:**
- Fácil cambiar implementación
- Testeable sin dependencias reales
- Código más limpio

---

## 7. Extensión del Sistema

### Caso 1: Agregar Nuevo Adaptador de Notificación

**Objetivo:** Enviar notificaciones por email además de WhatsApp

**Pasos:**

1. Crear adaptador:
```typescript
// src/infrastructure/adapters/EmailNotificationAdapter.ts
export class EmailNotificationAdapter implements NotificationPort {
  async sendMessage(email: string, message: string): Promise<void> {
    // Usar nodemailer, SendGrid, etc.
  }
}
```

2. Registrar en configuración:
```typescript
const emailAdapter = new EmailNotificationAdapter();
const container = new ApplicationContainer(
  userRepository,
  emailAdapter,
);
```

**Sin cambiar nada en dominio.** ¡Eso es la magia de la arquitectura!

### Caso 2: Agregar Nuevo Caso de Uso

**Objetivo:** Permitir usuarios obtener historial de pedidos

1. Crear caso de uso:
```typescript
export class GetOrderHistoryUseCase {
  constructor(private orderRepository: OrderRepository) {}

  async execute(userId: string): Promise<Order[]> {
    return await this.orderRepository.findByUserId(userId);
  }
}
```

2. Agregar a controlador:
```typescript
export class BotController {
  private getOrderHistoryUseCase: GetOrderHistoryUseCase;

  async handleOrderHistory(userId: string): Promise<void> {
    const orders = await this.getOrderHistoryUseCase.execute(userId);
    // Mostrar al usuario
  }
}
```

---

## 8. Testing (Futuro)

Con esta arquitectura, testing es simple:

```typescript
// Mock del repositorio
class MockUserRepository implements UserRepository {
  async save(user: User): Promise<void> {}
  async findByPhoneNumber(phone: string): Promise<User | null> {
    return { phoneNumber: phone, currentState: UserState.INITIAL };
  }
}

// Test del caso de uso
describe('HandleMessageUseCase', () => {
  it('should respond to greeting', async () => {
    const mockRepo = new MockUserRepository();
    const mockPort = new MockNotificationPort();
    const useCase = new HandleMessageUseCase(mockRepo, mockPort);

    const message = { from: '+34123', content: 'hola' };
    const response = await useCase.execute(message);

    expect(response.message).toContain('Bienvenido');
  });
});
```

---

## 9. Configuración y Entorno

### Variables Críticas (`.env`)
```env
NODE_ENV=development
BOT_NAME=SegurITech Bot
WHATSAPP_PHONE_NUMBER=+34123456789
```

### Validación Centralizada
```typescript
export function validateConfig(): void {
  const required = ['WHATSAPP_PHONE_NUMBER'];
  const missing = required.filter(k => !process.env[k]);
  if (missing.length) throw new Error(`Missing: ${missing}`);
}
```

---

## 10. Escalabilidad Futura

### Base de Datos
```typescript
// Reemplazar InMemoryUserRepository
const userRepository = new MongoUserRepository(mongoClient);
// o
const userRepository = new PostgreSQLUserRepository(pgPool);
```

### API Externa
```typescript
// Nuevo puerto
export interface ProductAPI {
  getProducts(): Promise<Product[]>;
  getPrice(id: string): Promise<number>;
}

// Usar en caso de uso
class GetProductsUseCase {
  constructor(private productAPI: ProductAPI) {}
}
```

### Multi-Tenancy
```typescript
interface User {
  id: string;
  businessId: string;  // ← Para multi-negocio
  phoneNumber: string;
  currentState: UserState;
}

// Repositorio filtra por business
userRepository.findByPhone(phone, businessId);
```

---

## 11. Checklist de Calidad

- [ ] TypeScript compila sin errores
- [ ] ESLint pasa sin warnings
- [ ] Sin `any` types
- [ ] Todas las funciones tipadas
- [ ] Nombres claros y descriptivos
- [ ] Sin código duplicado (DRY)
- [ ] Funciones pequeñas (< 20 líneas)
- [ ] Comentarios en lógica compleja
- [ ] Logger en lugar de console.log
- [ ] Manejo de errores apropiado
- [ ] Validación de entrada
- [ ] Separación de capas respetada

---

## 12. Diagrama de Dependencias

```
index.ts
  ↓
Bootstrap
  ├→ createLogger()
  ├→ validateConfig()
  └→ ApplicationContainer
      ├→ InMemoryUserRepository
      ├→ ConsoleNotificationAdapter
      └→ BotController
          └→ HandleMessageUseCase
              ├→ UserRepository (interface)
              └→ NotificationPort (interface)
```

**Dirección de dependencias:** Hacia arriba (hacia interfaces, nunca hacia abajo)

---

**Conclusión:** Esta arquitectura permite que el sistema crezca de manera ordenada, escalable y mantenible.
