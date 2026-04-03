# SegurITech Bot Pro 🤖

**ChatBot Profesional de WhatsApp con Arquitectura Hexagonal**

Un sistema robusto, escalable y mantenible para automatizar conversaciones en WhatsApp, diseñado siguiendo principios de arquitectura hexagonal, Clean Code y buenas prácticas de ingeniería de software.

---

## 📋 Tabla de Contenidos

- [Características](#características)
- [Stack Tecnológico](#stack-tecnológico)
- [Estructura del Proyecto](#estructura-del-proyecto)
- [Arquitectura](#arquitectura)
- [Instalación](#instalación)
- [Uso](#uso)
- [Extensibilidad](#extensibilidad)
- [Mejores Prácticas](#mejores-prácticas)

---

## ✨ Características

✅ **Respuesta Automática**: El bot responde automáticamente a mensajes  
✅ **Menú Interactivo**: Sistema de menú con opciones numeradas  
✅ **Gestión de Estado**: Manejo de estados de usuario (conversación con contexto)  
✅ **Procesamiento de Pedidos**: Lógica para recibir y procesar pedidos  
✅ **TypeScript Estricto**: Tipado completo para seguridad de tipos  
✅ **Arquitectura Hexagonal**: Separación clara de capas (dominio, aplicación, infraestructura)  
✅ **Fácil Extensión**: Agregar nuevos adaptadores sin cambiar lógica de negocio  
✅ **PM2 Ready**: Configuración lista para producción con PM2  
✅ **Logging Profesional**: Logs estructurados con Pino  
✅ **Configuración Centralizada**: Variables de entorno validadas  

---

## 🏗️ Stack Tecnológico

| Categoría | Tecnología | Versión | Propósito |
|-----------|-----------|---------|----------|
| **Runtime** | Node.js | >=18.0.0 | Entorno de ejecución |
| **Lenguaje** | TypeScript | ^5.3.2 | Tipado estático |
| **WhatsApp** | Baileys | ^0.0.1-beta.6 | Cliente de WhatsApp Web |
| **Logger** | Pino | ^8.17.0 | Logging de alto rendimiento |
| **Config** | dotenv | ^16.3.1 | Gestión de variables de entorno |
| **PM2** | PM2 | ^5.3.0 | Gestor de procesos |
| **Linting** | ESLint | ^8.54.0 | Análisis de código |
| **Type Check** | TypeScript | ^5.3.2 | Validación de tipos |

---

## 📁 Estructura del Proyecto

```
seguritech-bot-pro/
├── src/
│   ├── domain/                          # CAPA DE DOMINIO (Lógica de negocio pura)
│   │   ├── entities/                    # Entidades y tipos
│   │   │   └── index.ts                # Message, User, UserState, Product, Order, etc.
│   │   ├── ports/                       # Puertos (interfaces, contratos)
│   │   │   └── index.ts                # UserRepository, NotificationPort, etc.
│   │   ├── use-cases/                   # Casos de uso
│   │   │   └── HandleMessageUseCase.ts # Caso de uso: procesar mensaje
│   │   └── interfaces/
│   │       └── UseCase.ts              # Interfaz base para casos de uso
│   │
│   ├── app/                             # CAPA DE APLICACIÓN (Orquestación)
│   │   ├── controllers/
│   │   │   └── BotController.ts        # Controlador principal del bot
│   │   └── ApplicationContainer.ts      # Inyección de dependencias
│   │
│   ├── infrastructure/                  # CAPA DE INFRAESTRUCTURA (Adaptadores)
│   │   ├── adapters/
│   │   │   ├── BaileysWhatsAppAdapter.ts    # Adaptador Baileys (WhatsApp)
│   │   │   └── ConsoleNotificationAdapter.ts # Adaptador consola (pruebas)
│   │   └── repositories/
│   │       └── InMemoryUserRepository.ts    # Repositorio en memoria
│   │
│   ├── config/                          # CONFIGURACIÓN
│   │   ├── env.ts                      # Variables de entorno
│   │   └── logger.ts                   # Configuración de logger
│   │
│   ├── Bootstrap.ts                     # Inicialización de la app
│   └── index.ts                         # Punto de entrada
│
├── .env.example                         # Ejemplo de variables de entorno
├── .eslintrc.json                       # Configuración ESLint
├── tsconfig.json                        # Configuración TypeScript
├── ecosystem.config.js                  # Configuración PM2
├── package.json                         # Dependencias del proyecto
└── README.md                            # Este archivo
```

---

## 🧱 Arquitectura Hexagonal

### Concepto

La **arquitectura hexagonal** (Ports & Adapters) separa la lógica de negocio de los detalles de implementación:

```
       EXTERIOR (Adaptadores)
┌─────────────────────────────────┐
│  WhatsApp │ Database │ Email    │
└──────────┬──────────┬──────────┘
           │ Puertos  │
           │ (Puertos)│
    ┌──────┴──────────┴──────┐
    │   DOMINIO (Núcleo)    │
    │  - Entidades          │
    │  - Casos de Uso       │
    │  - Reglas de Negocio  │
    └─────────────────────────┘
           │ Puertos  │
┌──────────┴──────────┴──────────┐
│  MySQL │ MongoDB │ PostgreSQL  │
└────────────────────────────────┘
```

### Capas

#### 1. **Dominio** (`src/domain/`)
- **Independiente** de cualquier framework o librería
- Contiene **lógica pura** de negocio
- Define **puertos** (interfaces) que adaptadores deben implementar
- Fácil de testear

```typescript
// No sabe qué es WhatsApp, ni bases de datos
export class HandleMessageUseCase {
  async execute(message: Message): Promise<BotResponse> {
    // Lógica pura: procesar mensajes
  }
}
```

#### 2. **Aplicación** (`src/app/`)
- Orquesta casos de uso
- Convierte eventos externos en objetos del dominio
- Gestión de inyección de dependencias

```typescript
// Coordina: entrada -> dominio -> salida
export class BotController {
  async processMessage(from: string, content: string): Promise<void> {
    const message = new Message(from, content);
    const response = await this.useCase.execute(message);
    await this.notificationPort.send(response);
  }
}
```

#### 3. **Infraestructura** (`src/infrastructure/`)
- **Adaptadores** que implementan puertos
- Detalles técnicos: WhatsApp, BD, APIs, etc.
- Intercambiables sin afectar el dominio

```typescript
// Implementa NotificationPort para WhatsApp
export class BaileysWhatsAppAdapter implements NotificationPort {
  async sendMessage(to: string, text: string): Promise<void> {
    // Código específico de Baileys
  }
}
```

### Flujo de Mensaje

```
Usuario escribe en WhatsApp
         ↓
BaileysWhatsAppAdapter (infraestructura)
         ↓
BotController (aplicación)
         ↓
HandleMessageUseCase (dominio) ← lógica de negocio
         ↓
ConsoleNotificationAdapter (infraestructura)
         ↓
Respuesta al usuario
```

---

## 🚀 Instalación

### Requisitos
- **Node.js** >= 18.0.0
- **npm** o **yarn**

### Pasos

1. **Clonar el repositorio**
```bash
git clone https://github.com/seguritech/seguritech-bot-pro.git
cd seguritech-bot-pro
```

2. **Instalar dependencias**
```bash
npm install
```

3. **Configurar variables de entorno**
```bash
cp .env.example .env
# Editar .env con tus valores
```

4. **Compilar TypeScript**
```bash
npm run build
```

5. **Ejecutar**
```bash
npm start
```

---

## 💻 Uso

### Modo Desarrollo

Con auto-reload al cambiar archivos:
```bash
npm run dev
```

### Modo Producción

```bash
npm run build
npm start
```

### Con PM2

```bash
npm run start:pm2
npm run logs
npm run stop:pm2
```

### Linting y Type-Check

```bash
npm run lint
npm run type-check
```

---

## 🔌 Extensibilidad

### Agregar un nuevo adaptador de notificación

Ejemplo: Enviar por Email

1. **Crear adaptador** en `src/infrastructure/adapters/EmailNotificationAdapter.ts`

```typescript
import { NotificationPort } from '@/domain/ports';

export class EmailNotificationAdapter implements NotificationPort {
  async sendMessage(email: string, message: string): Promise<void> {
    // Implementar con nodemailer, SendGrid, etc.
  }

  async sendButtons(email: string, message: string, buttons: string[]): Promise<void> {
    // Implementar envío de opciones por email
  }
}
```

2. **Registrar en ApplicationContainer**

```typescript
const emailAdapter = new EmailNotificationAdapter();
const container = new ApplicationContainer(
  userRepository,
  emailAdapter,  // ← Cambiar aquí
  logger,
);
```

**Sin cambiar la lógica de negocio** del dominio. ¡Así de fácil!

### Agregar un nuevo caso de uso

Ejemplo: Obtener historial de pedidos

1. **Crear caso de uso** en `src/domain/use-cases/GetOrderHistoryUseCase.ts`

```typescript
import { UseCase } from '@/domain/interfaces/UseCase';
import { OrderRepository } from '@/domain/ports';

export class GetOrderHistoryUseCase implements UseCase<string, any[]> {
  constructor(private orderRepository: OrderRepository) {}

  async execute(userId: string): Promise<any[]> {
    return await this.orderRepository.findByUserId(userId);
  }
}
```

2. **Agregar a controlador**

```typescript
export class BotController {
  private getOrderHistoryUseCase: GetOrderHistoryUseCase;

  async handleOrderHistory(userId: string): Promise<void> {
    const orders = await this.getOrderHistoryUseCase.execute(userId);
    // Responder al usuario
  }
}
```

---

## 🧪 Mejores Prácticas Implementadas

### 1. **Separación de Responsabilidades**
- Cada clase tiene **una única razón para cambiar**
- Dominio no conoce infraestructura
- Fácil de entender y mantener

### 2. **Inyección de Dependencias**
```typescript
// ✅ Inyectamos dependencias
constructor(
  private userRepository: UserRepository,
  private notificationPort: NotificationPort,
) {}

// ❌ No creamos instancias directamente
// const repo = new MongoUserRepository(); // MAL
```

### 3. **Puertos y Adaptadores**
```typescript
// ✅ Interfaz (Puerto)
export interface NotificationPort {
  sendMessage(to: string, text: string): Promise<void>;
}

// ✅ Adaptador 1 (WhatsApp)
export class BaileysWhatsAppAdapter implements NotificationPort {}

// ✅ Adaptador 2 (Email)
export class EmailNotificationAdapter implements NotificationPort {}

// ❌ No acoplamiento directo
// const client = new WhatsAppClient(); // MAL
```

### 4. **Tipado Estricto**
```typescript
// ✅ TypeScript estricto
const config: AppConfig = {
  timeout: 5000,
};

// ❌ Any (evitar)
const config: any = {}; // MAL
```

### 5. **Nombres Claros**
```typescript
// ✅ Nombres explícitos
export class HandleMessageUseCase {}
export class InMemoryUserRepository {}
export class BaileysWhatsAppAdapter {}

// ❌ Nombres ambiguos
export class Handler {} // ¿Qué maneja?
export class Repo {} // ¿De qué?
```

### 6. **Validación Centralizada**
```typescript
// ✅ Una fuente de verdad
export const config = {
  bot: { name: process.env.BOT_NAME || 'Bot' },
};

// ❌ Disperso
const botName = process.env.BOT_NAME;
const botName2 = process.env.BOT_NAME;
```

### 7. **Funciones Pequeñas y Puras**
```typescript
// ✅ Pequeña y enfocada
private isGreeting(content: string): boolean {
  const greetings = ['hola', 'hi', 'hey'];
  return greetings.some((g) => content.includes(g));
}

// ❌ Grande y haciendo múltiples cosas
private processInput(input: string): any {
  // ... 100+ líneas
}
```

### 8. **Logging Estructurado**
```typescript
// ✅ Logs claros
this.logger.info('Usuario creado', { userId, phone });
this.logger.error('Error al guardar', error);

// ❌ Logs confusos
console.log('done');
console.log('err:' + error);
```

---

## 📊 Casos de Uso Soportados

### 1. **Saludar al Bot** ✅
```
Usuario: "Hola"
Bot: "¡Hola! Bienvenido a SegurITech Bot Pro. ¿Qué deseas hacer?"
Bot: [Menú con opciones]
```

### 2. **Ver Productos** ✅
```
Usuario: "1"
Bot: "Productos disponibles: ..."
```

### 3. **Consultar Precios** ✅
```
Usuario: "2"
Bot: "Nuestros precios: ..."
```

### 4. **Hacer Pedido** ✅
```
Usuario: "3"
Bot: "¿Cuál producto deseas?"
Bot: [Opciones de productos]
```

### 5. **Confirmar Pedido** ✅
```
Usuario: "2"
Bot: "Has seleccionado Premium. ¿Confirmar?"
Bot: [Sí/No]
```

---

## 🔮 Roadmap (Mejoras Futuras)

- [ ] **Base de datos real** (MongoDB/PostgreSQL)
- [ ] **Autenticación multiusuario**
- [ ] **Dashboard web de administración**
- [ ] **Integración con Stripe/PayPal**
- [ ] **Análisis de sentimiento**
- [ ] **Soporte para múltiples idiomas (i18n)**
- [ ] **Caché con Redis**
- [ ] **Tests automatizados (Jest)**
- [ ] **CI/CD con GitHub Actions**
- [ ] **Documentación OpenAPI**

---

## 🛠️ Desarrollo

### Estructura de una Nueva Funcionalidad

1. **Definir en dominio** (`src/domain/entities`, `use-cases`)
2. **Crear puerto si es necesario** (`src/domain/ports`)
3. **Implementar adaptador** (`src/infrastructure/adapters` o `repositories`)
4. **Integrar en controlador** (`src/app/controllers`)
5. **Registrar en contenedor** (`src/app/ApplicationContainer.ts`)
6. **Escribir tests** (cuando agregues)

### Checklist Antes de Commit

- [ ] TypeScript compila sin errores: `npm run build`
- [ ] ESLint pasa: `npm run lint`
- [ ] Type-check OK: `npm run type-check`
- [ ] Código sigue Clean Code principles
- [ ] Nombres claros y descriptivos
- [ ] Sin lógica duplicada
- [ ] Sin console.log (usar logger)
- [ ] Documento actualizado si hay cambios

---

## 📚 Recursos y Referencias

### Arquitectura Hexagonal
- [Alistair Cockburn - Hexagonal Architecture](https://alistair.cockburn.us/hexagonal-architecture/)
- [DDD (Domain-Driven Design)](https://martinfowler.com/bliki/DomainDrivenDesign.html)

### Clean Code
- [Robert Martin - Clean Code](https://www.amazon.com/Clean-Code-Handbook-Software-Craftsmanship/dp/0132350882)
- [SOLID Principles](https://en.wikipedia.org/wiki/SOLID)

### TypeScript
- [TypeScript Official Docs](https://www.typescriptlang.org/docs/)
- [Advanced Types](https://www.typescriptlang.org/docs/handbook/advanced-types.html)

### Baileys
- [Baileys GitHub](https://github.com/WhiskeySockets/Baileys)

---

## 📄 Licencia

MIT License - Libre para usar en proyectos personales y comerciales.

---

## 👥 Autor

**SegurITech** - Soluciones de Ciberseguridad

---

## 🤝 Contribuir

Las contribuciones son bienvenidas. Por favor:
1. Fork el repositorio
2. Crea una rama (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

---

## 📞 Soporte

Para problemas o preguntas:
- 📧 Email: soporte@seguritech.com
- 🐙 GitHub Issues
- 💬 Discord: [enlace a comunidad]

---

**Hecho con ❤️ por SegurITech**
#   s e g u r i t e c h - b o t - p r o  
 