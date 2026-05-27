# 🔌 MetaWhatsAppAdapter - Guía de Integración

## 📋 Overview

El `MetaWhatsAppAdapter` es un traductor de protocolos que implementa la interfaz `NotificationPort` de nuestra Arquitectura Hexagonal. Transforma los payloads gigantes de Meta WhatsApp Cloud API en mensajes limpios y tipados para nuestro sistema interno.

### Responsabilidades:

1. **Verificación de Webhook (Handshake)** - Valida requests `GET /webhook` de Meta
2. **Parseo de Entrada** - Convierte payloads de Meta a formato interno
3. **Envío de Mensajes** - Traduce respuestas internas al formato de Meta

---

## 🚀 Instalación & Configuración

### 1. Variables de Entorno

```bash
# .env o process.env
export META_VERIFY_TOKEN="tu_token_super_secreto_123"
export META_PHONE_NUMBER_ID="102345678901234"  # De tu dashboard Meta
export META_ACCESS_TOKEN="EAAx...xyz"          # Token de acceso permanente
export META_API_URL="https://graph.instagram.com/v19.0"  # Usar v19.0 o superior
```

**Dónde obtenerlos:**
- `META_PHONE_NUMBER_ID`: WhatsApp Manager → Números de teléfono
- `META_ACCESS_TOKEN`: Facebook App → Configuración → Tokens de sistema
- `META_VERIFY_TOKEN`: Tú lo defines (usar valor aleatorio fuerte)

### 2. Inyectar en ApplicationContainer

```typescript
import { ApplicationContainer } from '@/app/ApplicationContainer';
import { MetaWhatsAppAdapter } from '@/infrastructure/adapters/MetaWhatsAppAdapter';
import { config } from '@/config/env';

// En tu Bootstrap.ts o index.ts:
const container = new ApplicationContainer(
  userRepository,
  notificationAdapter,
  logger
);

// El ApplicationContainer ya instancia MetaWhatsAppAdapter internamente
const metaAdapter = container.getMetaWhatsAppAdapter();
```

---

## 🔄 Flujo de Integración

### A) Configurar Webhook en Meta

1. Ve a **Meta App Dashboard** → **WhatsApp Manager**
2. Selecciona tu número
3. **Configure → Webhook**:

   ```
   Callback URL:     https://tudominio.com/webhook
   Verify Token:     ^ Debe coincidir con META_VERIFY_TOKEN
   Subscribe Fields: messages, message_status
   ```

Meta hará un `GET` con `hub.challenge` → nuestro `verifyWebhook()` lo maneja.

### B) Recibir Mensajes (POST /webhook/:tenantId)

#### 1. Meta envía el payload gigante:

```json
POST /webhook/papeleria_01 HTTP/1.1

{
  "entry": [{
    "changes": [{
      "value": {
        "messaging_product": "whatsapp",
        "metadata": {
          "display_phone_number": "34912345678",
          "phone_number_id": "102345678901234"
        },
        "messages": [{
          "from": "34612345678",
          "text": { "body": "Hola, necesito ayuda" },
          "timestamp": "1234567890"
        }],
        "contacts": [{
          "wa_id": "34612345678",
          "profile": { "name": "Juan Pérez" }
        }]
      }
    }]
  }]
}
```

#### 2. ExpressServer parsea automáticamente:

```typescript
// En src/infrastructure/server/ExpressServer.ts
this.app.post('/webhook/:tenantId', async (req: Request, res: Response) => {
  const tenantId = String(req.params.tenantId);
  
  if (this.metaAdapter && req.body.entry) {
    const parsed = this.metaAdapter.parseIncomingMessage(req.body);
    // parsed = {
    //   from: "34612345678",
    //   content: "Hola, necesito ayuda",
    //   businessNumber: "34912345678",
    //   timestamp: "1234567890"
    // }
    
    const response = await processMessage(tenantId, parsed.from, parsed.content);
  }
});
```

#### 3. Resultado limpio:

```typescript
interface ParsedIncomingMessage {
  from: string;              // "+34612345678"
  content: string;           // "Hola, necesito ayuda"
  businessNumber: string;    // "+34912345678"
  timestamp: string;         // "1234567890"
}
```

### C) Enviar Respuestas (Texto o Botones)

#### Opción 1: Mensaje de Texto Simple

```typescript
import { MetaWhatsAppAdapter } from '@/infrastructure/adapters/MetaWhatsAppAdapter';

const metaAdapter = container.getMetaWhatsAppAdapter();

await metaAdapter.sendMessage(
  '34612345678',
  '¡Hola! Tu solicitud fue recibida. Un agente te contactará en 5 minutos.'
);

// Meta recibe:
// POST /v19.0/102345678901234/messages
// {
//   "messaging_product": "whatsapp",
//   "to": "34612345678",
//   "type": "text",
//   "text": { "body": "¡Hola! Tu solicitud..." }
// }
```

#### Opción 2: Mensaje Interactivo con Botones

```typescript
await metaAdapter.sendButtons(
  '34612345678',
  '¿Cómo podemos ayudarte?',
  ['📦 Orden', '💰 Facturación', '🔐 Seguridad']
);

// Meta recibe:
// {
//   "type": "interactive",
//   "interactive": {
//     "type": "button",
//     "body": { "text": "¿Cómo podemos ayudarte?" },
//     "action": {
//       "buttons": [
//         { "type": "reply", "reply": { "id": "btn_0", "title": "📦 Orden" } },
//         { "type": "reply", "reply": { "id": "btn_1", "title": "💰 Factura" } },
//         { "type": "reply", "reply": { "id": "btn_2", "title": "🔐 Seguridad" } }
//       ]
//     }
//   }
// }
```

**Límites de Meta:**
- Máximo 3 botones
- Máximo 20 caracteres por botón (se truncan automáticamente)

---

## 🛠️ Integración en ExpressServer

### Constructor con inyección de dependencia:

```typescript
// src/infrastructure/server/ExpressServer.ts
export class ExpressServer {
  private metaAdapter?: MetaWhatsAppAdapter;

  constructor(logger: pino.Logger, metaAdapter?: MetaWhatsAppAdapter) {
    this.logger = logger;
    this.app = express();
    this.metaAdapter = metaAdapter;
    this.setupMiddleware();
  }

  // Opción: setter si el adaptador se crea después
  setMetaAdapter(adapter: MetaWhatsAppAdapter): void {
    this.metaAdapter = adapter;
  }
}
```

### Uso en Bootstrap:

```typescript
// src/Bootstrap.ts
import pino from 'pino';
import { ApplicationContainer } from '@/app/ApplicationContainer';
import { ExpressServer } from '@/infrastructure/server/ExpressServer';
import { config } from '@/config/env';

export async function bootstrap(): Promise<void> {
  const logger = pino();

  // 1. Crear contenedor (internamente crea MetaWhatsAppAdapter)
  const container = new ApplicationContainer(
    userRepository,
    notificationAdapter,
    logger
  );

  // 2. Obtener el adaptador Meta
  const metaAdapter = container.getMetaWhatsAppAdapter();

  // 3. Crear servidor con adaptador inyectado
  const server = new ExpressServer(logger, metaAdapter);

  // 4. Setup rutas (ahora pueden usar this.metaAdapter)
  server.setupRoutes(async (tenantId, phoneNumber, message) => {
    return await container.getBotController().handleMessage(
      tenantId,
      phoneNumber,
      message
    );
  });

  await server.start(parseInt(config.whatsapp.webhookPort));
}
```

---

## 🔐 Manejo de Errores

El adaptador implementa manejo defensivo de errores:

### Errores esperados:

```typescript
// 1. Credenciales Meta no configuradas
metaAdapter.sendMessage('34612345678', 'Mensaje');
// Logger.warn: "⚠️  sendMessage: Credenciales META no configuradas. Simulando envío."

// 2. Payload de Meta malformado
metaAdapter.parseIncomingMessage({ entry: [] });
// Logger.warn: "⚠️  Payload sin entries"
// Retorna: null

// 3. Meta API rechaza (formato incorrecto)
// POST /messages con botones > 3
// Logger.warn: "⚠️  Meta solo soporta máximo 3 botones. Truncando."

// 4. Fallo de red
// Logger.error: "❌ Error de red al conectar con Meta API"
```

---

## 📐 Arquitectura Hexagonal

```
┌─────────────────────────────────────────────────────────────┐
│                                                               │
│  Domain (Lógica de Negocio)                                 │
│  ├─ Entities                                                 │
│  ├─ Use Cases                                                │
│  └─ Ports (NotificationPort)                                 │
│                                                               │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Infrastructure (Adaptadores)                        │    │
│  │                                                     │    │
│  │  🔌 MetaWhatsAppAdapter (NUEVO) ◄─────┐           │    │
│  │  implements NotificationPort            │           │    │
│  │                                         │           │    │
│  │  ├─ verifyWebhook()   ◄──────────┐    │           │    │
│  │  ├─ parseIncomingMessage()   ◄────├────┤ Meta      │    │
│  │  ├─ sendMessage()            ◄────┤    │ Cloud API │    │
│  │  └─ sendButtons()               └──┼────┤           │    │
│  │                                    │    │           │    │
│  │  🔌 BaileysWhatsAppAdapter        │    │           │    │
│  │  implements NotificationPort       │    │           │    │
│  │  (Legacy/Alternativo)              │    │           │    │
│  │                                    │    │           │    │
│  │  📡 ExpressServer                 │    │           │    │
│  │  ├─ GET /webhook ─────────────────┴────┤           │    │
│  │  ├─ POST /webhook/:tenantId ──────────┤           │    │
│  │  └─ POST /webhook ────────────────────┤           │    │
│  │                                        │           │    │
│  └────────────────────────────────────────┼───────────┘    │
│                                           │                 │
│  Application Container (DI)               │                 │
│  ├─ BotController                         │                 │
│  └─ MetaWhatsAppAdapter ◄─────────────────┘                 │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

---

## 🧪 Testing

### Unit Test - parseIncomingMessage:

```typescript
import { MetaWhatsAppAdapter } from '@/infrastructure/adapters/MetaWhatsAppAdapter';
import pino from 'pino';

describe('MetaWhatsAppAdapter', () => {
  let adapter: MetaWhatsAppAdapter;

  beforeEach(() => {
    adapter = new MetaWhatsAppAdapter(pino());
  });

  it('should parse Meta webhook payload', () => {
    const metaPayload = {
      entry: [{
        changes: [{
          value: {
            metadata: {
              display_phone_number: '34912345678',
            },
            messages: [{
              from: '34612345678',
              text: { body: 'Hola' },
              timestamp: '1234567890',
            }],
          },
        }],
      }],
    };

    const result = adapter.parseIncomingMessage(metaPayload);

    expect(result).toEqual({
      from: '34612345678',
      content: 'Hola',
      businessNumber: '34912345678',
      timestamp: '1234567890',
    });
  });
});
```

---

## 🚨 Troubleshooting

### "Webhook verificado incorrecto"

```
❌ Token de verificación incorrecto o mode inválido
```

✅ Solución:
- Verifica que `META_VERIFY_TOKEN` en .env coincida con el token en Meta Dashboard
- Recarga la aplicación luego de cambiar .env

### "Credenciales META no configuradas"

```
⚠️  sendMessage: Credenciales META no configuradas. Simulando envío.
```

✅ Solución:
- Configura: `META_PHONE_NUMBER_ID`, `META_ACCESS_TOKEN`
- En desarrollo, puede funcionar sin ellas (simulación)
- En producción, falla la validación

### "Meta solo soporta máximo 3 botones"

```
⚠️  Meta solo soporta máximo 3 botones. Truncando.
```

✅ Solución:
- Máximo 3 botones por mensaje
- Máximo 20 caracteres por botón
- El adaptador trunca automáticamente

---

## 📚 Véase también

- `src/infrastructure/adapters/MetaWhatsAppAdapter.ts` - Código fuente
- `src/config/env.ts` - Variables de entorno
- `src/app/ApplicationContainer.ts` - Inyección de dependencias
- `src/infrastructure/server/ExpressServer.ts` - Servidor HTTP
- [Meta WhatsApp Cloud API Docs](https://developers.facebook.com/docs/whatsapp/cloud-api)

