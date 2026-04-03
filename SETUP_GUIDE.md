# SegurITech Bot Pro 🤖

**Chatbot profesional de WhatsApp para múltiples negocios usando Baileys, TypeScript y Arquitectura Hexagonal**

---

## 📋 Tabla de Contenidos

- [Características](#características)
- [Requisitos](#requisitos)
- [Instalación](#instalación)
- [Configuración](#configuración)
- [Uso](#uso)
- [Estructura del Proyecto](#estructura-del-proyecto)
- [Arquitectura](#arquitectura)
- [API del Bot](#api-del-bot)
- [Troubleshooting](#troubleshooting)
- [Roadmap](#roadmap)

---

## ✨ Características

✅ **Conexión con WhatsApp** vía Baileys (@whiskeysockets/baileys)  
✅ **QR dinámico** mostrado en terminal para autenticación  
✅ **Reconexión automática** con reintentos configurables  
✅ **Manejo de mensajes** automático y escalable  
✅ **TypeScript strict** con tipos seguros  
✅ **Arquitectura hexagonal** - separación clara de responsabilidades  
✅ **Logging profesional** con Pino  
✅ **Gestión de sesiones** persistentes  
✅ **Multi-negocio** preparado para escalabilidad (SaaS ready)  

---

## 📦 Requisitos

- **Node.js**: v18.0.0 o superior (tested con v24)
- **npm**: v9.0.0 o superior
- **Windows / macOS / Linux**
- **Cuenta de WhatsApp válida** para scanear QR

---

## 🚀 Instalación

### 1. Clonar el repositorio
```bash
git clone https://github.com/tuusuario/seguritech-bot-pro.git
cd seguritech-bot-pro
```

### 2. Instalar dependencias
```bash
npm install
```

### 3. Configurar variables de entorno
```bash
# Copiar archivo de ejemplo
cp .env.example .env

# Editar .env con tus valores
# (Ver sección Configuración)
```

### 4. Compilar TypeScript
```bash
npm run build
```

### 5. Ejecutar en desarrollo
```bash
npm run dev
```

El bot te mostrará un **código QR en la terminal**. Escanea con tu teléfono en WhatsApp:
- iPhone: Settings > Linked devices > Link a device
- Android: Settings > Linked devices > Link a device

---

## ⚙️ Configuración

### Variables de Entorno (`.env`)

```env
# Entorno
NODE_ENV=development

# WhatsApp
WHATSAPP_PHONE_NUMBER=5491234567890        # Tu número con código país
WHATSAPP_SESSION_NAME=seguritech-session   # Nombre de la sesión
WHATSAPP_QR_TIMEOUT=30000                  # Timeout del QR (ms)

# Bot
BOT_NAME=SegurITech Bot
BOT_PREFIX=!
BOT_AUTO_REPLY_ENABLED=true

# Logging
LOG_LEVEL=info  # debug, info, warn, error, fatal

# Base de datos (futuro)
DATABASE_URL=mongodb://localhost:27017/seguritech-bot

# APIs externas (futuro)
API_KEY=your_api_key_here
API_URL=https://api.example.com

# PM2
PM2_INSTANCE_NAME=seguritech-bot-pro
```

---

## 📖 Uso

### Ejecutar en desarrollo
```bash
npm run dev
```

### Compilar y ejecutar en producción
```bash
npm run build
npm run start
```

### Con PM2 (gestión de procesos)
```bash
npm run start:pm2
npm run logs
npm run stop:pm2
```

### Verificar tipos (sin compilar)
```bash
npm run type-check
```

### Lint del código
```bash
npm run lint
```

---

## 📁 Estructura del Proyecto

```
seguritech-bot-pro/
├── src/
│   ├── bot.ts                          # 🤖 Clase principal del bot con Baileys
│   ├── index.ts                        # Punto de entrada
│   ├── Bootstrap.ts                    # Inicialización de la aplicación
│   │
│   ├── config/
│   │   ├── env.ts                      # Variables de entorno centralizadas
│   │   └── logger.ts                   # Configuración de Pino logger
│   │
│   ├── handlers/
│   │   └── messageHandler.ts           # 🔄 Procesamiento de mensajes
│   │
│   ├── services/
│   │   └── whatsappConnectionService.ts # 📱 Gestión de conexión y sesiones
│   │
│   ├── models/
│   │   └── entities.ts                 # Entidades de dominio (User, Message, etc)
│   │
│   ├── utils/
│   │   └── helpers.ts                  # Funciones utilitarias
│   │
│   ├── domain/                         # 🏛️ Lógica de negocio pura
│   │   ├── entities/
│   │   ├── interfaces/
│   │   ├── ports/
│   │   └── use-cases/
│   │
│   ├── app/                            # 🎯 Orquestación (casos de uso)
│   │   └── ApplicationContainer.ts
│   │
│   └── infrastructure/                 # 🔌 Adaptadores (BD, APIs, etc)
│       ├── adapters/
│       └── repositories/
│
├── dist/                               # 🔨 Compilado (generado)
├── .bot_auth/                          # 🔐 Sesión de WhatsApp (auto-generado)
│
├── package.json
├── tsconfig.json
├── .env                                # ⚠️ No subir a Git
├── .env.example                        # ✅ Ejemplo de configuración
├── .gitignore                          # Git ignore configurado
├── README.md
└── ecosystem.config.js                 # PM2 configuration
```

---

## 🏗️ Arquitectura

### Principio: Hexagonal Architecture (Ports & Adapters)

```
┌─────────────────────────────────────────────────────┐
│                  OUTSIDE WORLD                      │
│        (WhatsApp, Database, APIs)                   │
└────────────────────────┬────────────────────────────┘
                         │
                    ┌────▼────┐
                    │ ADAPTERS │ (Infrastructure)
                    │  Layer   │
                    └────┬─────┘
                         │
                    ┌────▼───────────────────┐
                    │ APPLICATION / SERVICES │
                    │  (Use Cases)           │
                    └────┬───────────────────┘
                         │
                    ┌────▼─────────────────┐
                    │  DOMAIN LOGIC        │
                    │  (Pure Business)     │
                    └──────────────────────┘
```

### Responsabilidades:

- **Domain**: Lógica pura, sin dependencias externas
- **Application**: Orquestación de casos de uso
- **Infrastructure**: Adaptadores (WhatsApp, DB, APIs)
- **Config**: Variables centralizadas

### Beneficios:

✅ Cambiar de Baileys a API oficial sin tocar la lógica  
✅ Testable sin dependencias  
✅ Escalable a múltiples negocios  
✅ Código limpio y mantenible  

---

## 🤖 API del Bot

### Clase Principal: `WhatsAppBot`

```typescript
import { bot } from '@/bot';

// Iniciar bot
await bot.start();

// Enviar mensaje programáticamente
await bot.sendMessage('5491234567890@s.whatsapp.net', '¡Hola desde el bot!');

// Obtener estado
const status = bot.getStatus();
console.log(status);
// { isConnected: true, user: {...}, phoneNumber: '5491234567890' }

// Cerrar gracefully
await bot.shutdown();
```

### Crear un Handler personalizado

```typescript
// src/handlers/customHandler.ts
import { MessageHandler, WAMessage } from '@whiskeysockets/baileys';

export class CustomMessageHandler implements MessageHandler {
  async handle(message: WAMessage, senderJid: string): Promise<string | null> {
    const text = message.message?.conversation || '';
    
    if (text.toLowerCase() === 'hola') {
      return '¡Hola! ¿Cómo estás?';
    }
    
    return null;
  }
}
```

### Extender el Bot

```typescript
// Editar src/bot.ts e inyectar tu handler
const customHandler = new CustomMessageHandler();
// Usar en handleIncomingMessage
```

---

## 🔍 Troubleshooting

### ❌ "Error: Could not find tsconfig.json"
```bash
npm run build  # Regenera dist/
```

### ❌ "WhatsApp session expired"
- Elimina la carpeta `.bot_auth/`
- Ejecuta `npm run dev` nuevamente
- Escanea el nuevo QR

### ❌ "Port already in use"
```bash
# Encuentra el proceso
lsof -i :3000  # en macOS/Linux
netstat -ano | findstr :3000  # en Windows

# Mata el proceso
kill -9 <PID>  # macOS/Linux
taskkill /PID <PID> /F  # Windows
```

### ❌ "TypeError: Cannot read property 'user' of null"
- Asegúrate de que el bot esté conectado
- Espera a que aparezca el mensaje "✅ Conectado exitosamente"

### ⚠️ El bot no responde mensajes
1. Verifica que `BOT_AUTO_REPLY_ENABLED=true` en `.env`
2. Revisa los logs: `npm run logs` (si usas PM2)
3. Comprueba que el número está correctamente configurado

---

## 🚀 Comandos útiles

```bash
# Desarrollo
npm run dev               # Ejecutar en modo desarrollo
npm run build            # Compilar TypeScript

# Testing
npm run type-check       # Verificar tipos sin compilar
npm run lint            # Validar código

# Producción
npm run start            # Ejecutar versión compilada
npm run start:pm2        # Iniciar con PM2
npm run stop:pm2         # Detener con PM2
npm run logs             # Ver logs de PM2
```

---

## 📊 Roadmap (Futuro)

- [ ] Conectar a MongoDB
- [ ] Panel web de administración
- [ ] API REST para manejar bot remotamente
- [ ] Soporte para grupos de WhatsApp
- [ ] Procesamiento de imágenes y documentos
- [ ] Sistema de permisos multi-usuario
- [ ] Dashboard de analíticas
- [ ] Integración con CRM
- [ ] Soporte para múltiples negocios (SaaS)
- [ ] Tests unitarios y E2E

---

## 📝 Licencia

MIT - Libre para uso comercial

---

## 👨‍💻 Autor

**SegurITech**  
Soluciones de seguridad e integración tecnológica

---

## 🤝 Contribuir

1. Fork el proyecto
2. Crea una rama (`git checkout -b feature/mi-feature`)
3. Commit tus cambios (`git commit -m 'Agrego feature'`)
4. Push a la rama (`git push origin feature/mi-feature`)
5. Abre un Pull Request

---

## 📞 Soporte

- 📧 Email: dev@seguritech.com
- 🐛 Issues: [GitHub Issues](https://github.com/tuusuario/seguritech-bot-pro/issues)
- 💬 Discussions: [GitHub Discussions](https://github.com/tuusuario/seguritech-bot-pro/discussions)

---

**Made with ❤️ by SegurITech**

