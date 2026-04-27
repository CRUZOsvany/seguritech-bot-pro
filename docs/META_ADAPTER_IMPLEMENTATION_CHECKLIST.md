# ✅ MetaWhatsAppAdapter - Checklist de Implementación

## 📋 Fase 1: Configuración Inicial

### Obtener Credenciales de Meta

- [ ] **Acceder a Meta Developer Portal**
  - URL: https://developers.facebook.com/
  - Login con cuenta de administrador

- [ ] **Obtener `META_PHONE_NUMBER_ID`**
  - Navega a: Apps → Tu App → WhatsApp Manager
  - Sección: Números de teléfono
  - Copiar el "Phone Number ID"
  - Ejemplo: `102345678901234`

- [ ] **Obtener `META_ACCESS_TOKEN`**
  - Navega a: Tu App → Settings → Tokens de sistema
  - Copiar "Token de acceso de usuario"
  - CRÍTICO: No compartir este token
  - Si es necesario, regenerar desde Meta App Roles

- [ ] **Definir `META_VERIFY_TOKEN`**
  - Valor que defines tú (cualquier string fuerte)
  - Ejemplo: generar con `openssl rand -base64 32`
  - Debe tener mínimo 32 caracteres
  - Será usado en Meta Dashboard

### Configuración en .env

- [ ] Copiar `.env.example` a `.env`
  ```bash
  cp .env.example .env
  ```

- [ ] Rellenar variables Meta en `.env`:
  ```env
  META_VERIFY_TOKEN=xxxxxxxxxxxxxxxxxxxx
  META_PHONE_NUMBER_ID=102345678901234
  META_ACCESS_TOKEN=EAAxxxxxxxxxxxxxxxxxxxx
  META_API_URL=https://graph.instagram.com/v19.0
  ```

- [ ] Verificar que no se subió `.env` a Git:
  ```bash
  git status
  # Debe mostrar .env como "modified" pero untracked
  ```

## 📊 Fase 2: Código

### Verificar Archivos Creados

- [ ] `src/infrastructure/adapters/MetaWhatsAppAdapter.ts`
  - Contiene: `verifyWebhook()`, `parseIncomingMessage()`, `sendMessage()`, `sendButtons()`

- [ ] Actualizaciones en `src/config/env.ts`
  - Contiene: `config.meta` con las 4 variables

- [ ] Actualizaciones en `src/app/ApplicationContainer.ts`
  - Instancia `MetaWhatsAppAdapter`
  - Método `getMetaWhatsAppAdapter()`

- [ ] Actualizaciones en `src/infrastructure/server/ExpressServer.ts`
  - Constructor acepta `metaAdapter?: MetaWhatsAppAdapter`
  - Método `setMetaAdapter()`
  - GET /webhook usa `adapter.verifyWebhook()`
  - POST /webhook/:tenantId parsea con `adapter.parseIncomingMessage()`

### Compilar el Proyecto

- [ ] Instalar dependencias (si necesitas nuevas):
  ```bash
  npm install
  ```

- [ ] Compilar TypeScript:
  ```bash
  npm run build
  # O si no existe:
  npx tsc
  ```

- [ ] Verificar que NO hay errores (warnings están OK):
  ```bash
  npm test  # Si tienes tests
  ```

## 🔗 Fase 3: Integración en Meta Dashboard

### Registrar Webhook en Meta

- [ ] Navega a: Tu App → WhatsApp Manager
  
- [ ] Sección: Configuration → Webhooks

- [ ] Click: "Select a number" → Selecciona tu número

- [ ] Click: "Edit" en Webhook URL

- [ ] Ingresa:
  ```
  Webhook URL:   https://tudominio.com/webhook
  Verify Token:  [El valor de META_VERIFY_TOKEN]
  ```

- [ ] Click: "Verify and Save"
  - Nuestro `verifyWebhook()` debe responder con HTTP 200

- [ ] Si falla:
  - Verifica que `META_VERIFY_TOKEN` coincida exactamente
  - Verifica que tu servidor esté levantado y accesible
  - Verifica logs

- [ ] Suscribirse a eventos:
  - Click: "Manage" en la sección de events
  - Selecciona: `messages`
  - Selecciona: `message_status` (opcional, para receipts)
  - Click: "Save"

## 🧪 Fase 4: Testing

### Test Manual - Verificación de Webhook

```bash
# Simular handshake de Meta (cambiar URL):
curl "http://localhost:3001/webhook?hub.mode=subscribe&hub.verify_token=xxxxxxxxxxxxxxxxxxxx&hub.challenge=test_challenge_123"

# Respuesta esperada (solo el challenge):
# HTTP 200
# body: test_challenge_123
```

### Test Manual - Enviar Mensaje

```bash
# Enviar mensaje de prueba con credentials reales
curl -X POST "http://localhost:3001/webhook/papeleria_01" \
  -H "Content-Type: application/json" \
  -d '{
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
            "text": { "body": "Hola!" },
            "timestamp": "'$(date +%s)'"
          }],
          "contacts": [{
            "wa_id": "34612345678",
            "profile": { "name": "Juan" }
          }]
        }
      }]
    }]
  }'

# Respuesta esperada:
# { "success": true, ... }
```

### Test Unitario (Jest)

```bash
npm test -- MetaWhatsAppAdapter
# Debería pasar:
#  ✓ verifyWebhook with valid token
#  ✓ parseIncomingMessage with valid payload
```

## 🚀 Fase 5: Deployment Inicial

### Pre-deployment Checklist

- [ ] `.env` tiene valores REALES (no ejemplos)
- [ ] No hay `.env` en Git (verificar `.gitignore`)
- [ ] `npm run build` compila sin errores
- [ ] `npm test` pasa todos los tests
- [ ] Logs están configurados correctamente
- [ ] Firewall permite puerto 3001 (o el que uses)

### Deploy en Producción

```bash
# 1. Actualizar código en servidor
git pull origin main

# 2. Instalar dependencias
npm install --production

# 3. Compilar
npm run build

# 4. Usar PM2 o similar
pm2 start npm --name "seguritech-bot" -- start

# 5. Ver logs
pm2 logs seguritech-bot
```

- [ ] Verificar que aplicación está corriendo
- [ ] Verificar que logs muestran "Servidor escuchando..."
- [ ] Probar webhook desde Meta Dashboard (Test)

## 🔍 Fase 6: Monitoreo & Troubleshooting

### Logs a Observar

Cuando todo está correcto, en logs verás:

```
✅ Webhook verificado exitosamente por Meta
✅ Mensaje parseado exitosamente
✅ Mensaje enviado a Meta exitosamente
```

### Problemas Comunes & Soluciones

| Problema | Síntoma | Solución |
|----------|---------|----------|
| Token incorrecto | `❌ Token de verificación incorrecto` | Verificar `META_VERIFY_TOKEN` en .env y Meta Dashboard |
| Credenciales faltantes | `⚠️  Credenciales META no configuradas` | Llenar `META_PHONE_NUMBER_ID` y `META_ACCESS_TOKEN` |
| Servidor no responde | Meta ve error 504 | Verificar que `npm run start` está levantado |
| Meta rechaza mensaje | `Error 400 Bad Request` | Verificar formato de botones (máx 3, máx 20 caracteres) |
| Webhook no entrega | Messages no llegan | Ir a Meta Dashboard → Webhooks → Test, verificar respuesta |

## 📚 Documentación de Referencia

- [Guía completa: META_WHATSAPP_ADAPTER_GUIDE.md](./META_WHATSAPP_ADAPTER_GUIDE.md)
- [Ejemplos de código: META_INTEGRATION_EXAMPLE.ts](./META_INTEGRATION_EXAMPLE.ts)
- [Meta Official Docs](https://developers.facebook.com/docs/whatsapp/cloud-api)

## ✨ Casos de Uso Soportados

### ✅ Soportados Ahora

- [x] Recibir mensajes de texto
- [x] Enviar mensajes de texto
- [x] Enviar mensajes con botones (máx 3)
- [x] Multi-tenant (diferentes tenantId)
- [x] Verificación de webhook
- [x] Manejo de errores robusto
- [x] Logging detallado
- [x] Tipado TypeScript estricto

### 📌 Próximas Mejoras (Roadmap)

- [ ] Soporte para imágenes/archivos
- [ ] Templates de mensajes
- [ ] Webhook secundarios (status delivery)
- [ ] Rate limiting
- [ ] Retry automático
- [ ] Métricas y observabilidad

## 🎓 Arquitectura Resultante

```
┌─────────────────────────────────────────┐
│         Meta WhatsApp Cloud API         │
│       (Infraestructura externa)         │
└────────────────────┬────────────────────┘
                     │ HTTP POST/GET
                     ▼
        ┌────────────────────────────┐
        │   ExpressServer (Puerto 3001)
        │   ├─ GET /webhook          │ ◄─ Handshake
        │   └─ POST /webhook/:tenantId│ ◄─ Mensajes
        │   (Capa de Adapters)       │
        └────────────────┬───────────┘
                         │ instancia
                         ▼
        ┌────────────────────────────┐
        │ MetaWhatsAppAdapter        │ ◄─ NUEVO
        │ ├─ verifyWebhook()         │
        │ ├─ parseIncomingMessage()  │
        │ ├─ sendMessage()           │
        │ └─ sendButtons()           │
        │ (Traductor Meta ↔ SegurITech
        └────────────────┬───────────┘
                         │ implements
                         ▼
        ┌────────────────────────────┐
        │     NotificationPort       │
        │  (Domain - Port/Interface) │
        └────────────────┬───────────┘
                         │
        ┌────────────────▼───────────┐
        │   BotController            │
        │   HandleMessageUseCase     │
        │   (Lógica de Negocio)      │
        └────────────────────────────┘
```

---

**¡Ready to go! 🚀**

Una vez completado este checklist, tu SegurITech Bot Pro estará integrado con Meta WhatsApp Cloud API bajo Arquitectura Hexagonal estricta.

