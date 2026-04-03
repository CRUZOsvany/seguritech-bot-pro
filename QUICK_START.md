# Guía Rápida - SegurITech Bot Pro

**Referencia rápida para desarrolladores**

---

## 🚀 Inicio Rápido

```bash
# 1. Instalar
npm install

# 2. Desarrollo (con auto-reload)
npm run dev

# 3. Compilar para producción
npm run build
npm start

# 4. Con PM2
npm run start:pm2
npm run logs
npm run stop:pm2
```

---

## 📁 Estructura de Archivos

```
src/
├── domain/                          # LÓGICA DE NEGOCIO PURA
│   ├── entities/index.ts           # Tipos y entidades (Message, User, Order, etc)
│   ├── ports/index.ts              # Interfaces/Puertos (UserRepository, NotificationPort)
│   ├── use-cases/
│   │   └── HandleMessageUseCase.ts # Procesa mensajes, determina respuesta
│   └── interfaces/UseCase.ts       # Interfaz base
│
├── app/                             # ORQUESTACIÓN
│   ├── controllers/
│   │   └── BotController.ts        # Recibe eventos, ejecuta casos de uso
│   └── ApplicationContainer.ts      # Inyección de dependencias
│
├── infrastructure/                  # ADAPTADORES
│   ├── adapters/
│   │   ├── ConsoleNotificationAdapter.ts  # Para pruebas (imprime en consola)
│   │   └── BaileysWhatsAppAdapter.ts      # Para WhatsApp real (futuro)
│   └── repositories/
│       └── InMemoryUserRepository.ts      # Usuarios en memoria (desarrollo)
│
├── config/                          # CONFIGURACIÓN
│   ├── env.ts                      # Variables de entorno
│   └── logger.ts                   # Setup de logging
│
├── Bootstrap.ts                     # Inicialización
└── index.ts                         # Punto de entrada
```

---

## 🧠 Conceptos Clave

### Arquitectura Hexagonal

```
Usuario escribe en WhatsApp
         ↓
┌─────────────────────────────────────┐
│   INFRAESTRUCTURA (Adaptadores)     │
│  • BaileysWhatsAppAdapter           │
│  • ConsoleNotificationAdapter       │
└──────────────┬──────────────────────┘
               ↓
┌─────────────────────────────────────┐
│   APLICACIÓN (Orquestación)         │
│  • BotController                    │
│  • ApplicationContainer             │
└──────────────┬──────────────────────┘
               ↓
┌─────────────────────────────────────┐
│   DOMINIO (Lógica Pura)            │
│  • HandleMessageUseCase             │
│  • Entidades y Puertos              │
└──────────────┬──────────────────────┘
               ↓
        Respuesta generada
         ↓
Envío al usuario
```

### Inversión de Dependencias

```typescript
// ❌ MAL: Acoplado
export class BotController {
  private repo = new MongoUserRepository(); // Directamente instanciado
}

// ✅ BIEN: Inyectado
export class BotController {
  constructor(private userRepository: UserRepository) {} // Interface
}
```

### Gestión de Estado

```
Usuario: "Hola"
   ↓
Estado: INITIAL
   ↓
Respuesta: "¡Hola! ¿Qué deseas?"
Nuevo Estado: MENU
   ↓
Usuario: "1"
   ↓
Estado: MENU
   ↓
Respuesta: "Productos: ..."
Nuevo Estado: VIEWING_PRODUCTS
```

---

## 💻 Agregar Nueva Funcionalidad

### Pasos Generales

1. **Definir en Dominio** (no necesita dependencias)
2. **Crear Adaptador** (si es nueva integración)
3. **Integrar en Controlador** (orquestar)
4. **Registrar en Container** (inyectar)

### Ejemplo: Enviar por Email

**1. Crear Adaptador**

```typescript
// src/infrastructure/adapters/EmailNotificationAdapter.ts
export class EmailNotificationAdapter implements NotificationPort {
  async sendMessage(email: string, message: string): Promise<void> {
    // Usar nodemailer, SendGrid, etc.
  }

  async sendButtons(email: string, message: string, buttons: string[]): Promise<void> {
    // Implementar
  }
}
```

**2. Registrar en Container**

```typescript
// src/app/ApplicationContainer.ts
const emailAdapter = new EmailNotificationAdapter();
const container = new ApplicationContainer(
  userRepository,
  emailAdapter,  // ← Cambiar aquí
  logger,
);
```

**Sin cambiar nada en dominio.** La magia de hexagonal.

---

## 🔧 Scripts Disponibles

| Script | Qué hace |
|--------|----------|
| `npm run dev` | Ejecutar con ts-node (desarrollo) |
| `npm run build` | Compilar TypeScript → JavaScript |
| `npm start` | Ejecutar build compilado |
| `npm run start:pm2` | Iniciar con PM2 (producción) |
| `npm run stop:pm2` | Detener PM2 |
| `npm run logs` | Ver logs de PM2 |
| `npm run lint` | Revisar código con ESLint |
| `npm run type-check` | Validar tipos TypeScript |

---

## 🐛 Troubleshooting

### "Module not found: @/config/env"

```bash
# Solución: Instalar tsconfig-paths
npm install tsconfig-paths

# Ya está en package.json
```

### "Type error: Property 'x' has no initializer"

```typescript
// Solución: Usar definite assignment assertion
private logger!: pino.Logger;
// o inicializar
private logger: pino.Logger = createLogger();
```

### "No error on console.log"

ESLint permite `console.warn` y `console.error`, pero no `console.log`:

```typescript
// ✅ Bueno
logger.info('mensaje');
console.warn('advertencia');
console.error('error');

// ❌ Malo
console.log('hola');
```

---

## 📦 Variables de Entorno

Copiar `.env.example` a `.env`:

```bash
cp .env.example .env
```

**Variables importantes:**

```env
NODE_ENV=development           # development o production
LOG_LEVEL=debug               # debug, info, warn, error
BOT_NAME=SegurITech Bot       # Nombre del bot
WHATSAPP_PHONE_NUMBER=        # Tu número (para Baileys)
DATABASE_URL=                 # URL de BD (futuro)
```

---

## 🧪 Flujo de Testing Manual

```bash
# Terminal 1: Ejecutar bot
npm run dev

# El bot simula automáticamente:
# 1. Usuario +34123456789 dice "Hola"
# 2. Usuario selecciona opción "1" (Productos)
# 3. Otro usuario +34987654321 dice "Hola"
# 4. Selecciona opción "3" (Hacer pedido)
# 5. Selecciona producto "2" (Premium)

# Observar logs y cambios de estado
```

---

## 🎯 Casos de Uso Implementados

| Caso | Código | Estados |
|------|--------|---------|
| Saludo | `isGreeting()` | INITIAL → MENU |
| Ver Productos | `handleMenuState('1')` | MENU → VIEWING_PRODUCTS |
| Consultar Precios | `handleMenuState('2')` | MENU |
| Hacer Pedido | `handleMenuState('3')` | MENU → MAKING_ORDER |
| Confirmar | `handleMakingOrderState()` | MAKING_ORDER → CONFIRMING_ORDER |

---

## 🔐 Seguridad

### TypeScript Estricto

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true
  }
}
```

Esto fuerza:
- ✅ Tipos explícitos
- ✅ Sin `any`
- ✅ Null checks
- ✅ Null/undefined seguros

### Variables de Entorno

```typescript
// ✅ Centralizado en config/env.ts
export const config = {
  bot: { name: process.env.BOT_NAME }
};

// ❌ Disperso
const name = process.env.BOT_NAME;
```

---

## 📈 Escalabilidad Futura

### Base de Datos

```typescript
// Cambiar repositorio en memoria por MongoDB
// InMemoryUserRepository → MongoUserRepository
// Sin cambiar dominio
```

### Multi-Tenancy

```typescript
// Agregar businessId a entidades
interface User {
  businessId: string;  // ← Nuevo
  phoneNumber: string;
}
```

### Panel Web

```typescript
// Crear API REST que use los mismos casos de uso
// GET /api/users/:id
// POST /api/orders

// El dominio NO sabe si es WhatsApp o API
```

---

## 📚 Archivos Clave para Entender

1. **README.md** - Visión general (20 min)
2. **ARCHITECTURE.md** - Detalles arquitectónicos (30 min)
3. **src/domain/use-cases/HandleMessageUseCase.ts** - Lógica principal (10 min)
4. **src/app/ApplicationContainer.ts** - Inyección DI (5 min)
5. **src/infrastructure/adapters/** - Implementaciones (15 min)

**Total: ~80 minutos para entender completamente**

---

## 🤝 Contribuir

Ver [CONTRIBUTING.md](CONTRIBUTING.md) para:
- Proceso de PR
- Estilos de código
- Commit messages
- Testing

**Quick checklist antes de commit:**

```bash
npm run type-check
npm run lint
npm run build
git add .
git commit -m "type(scope): descripción"
```

---

## 🚀 Próximos Pasos

- [ ] Integrar Baileys real
- [ ] Conectar a base de datos (MongoDB)
- [ ] Agregar tests (Jest)
- [ ] Crear API REST
- [ ] Panel de administración web
- [ ] Soporte para múltiples negocios
- [ ] Analytics y reporting

---

## 📞 Soporte

- 📖 Lee [ARCHITECTURE.md](ARCHITECTURE.md)
- 💬 Abre una issue
- 🤝 Contribuye con un PR

---

**Última actualización:** 2026-04-03  
**Versión del Proyecto:** 1.0.0  
**Estado:** ✅ Funcional en Desarrollo
