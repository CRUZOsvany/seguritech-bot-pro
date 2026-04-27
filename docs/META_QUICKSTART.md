# ⚡ Meta WhatsApp Adapter - Quick Start (3 minutos)

## 1️⃣ Credenciales Meta (1 minuto)

### Obtén en Meta Dashboard:

```
https://developers.facebook.com/
  → Tu App
    → WhatsApp Manager
      → Números de teléfono
        → Click en tu número
          → Copiar: Phone Number ID
```

```
https://developers.facebook.com/
  → Tu App
    → Settings → Tokens de sistema
      → Copiar: Token de acceso de usuario
```

### Crea un token de verificación (tú lo defines):

```bash
# En terminal/PowerShell
openssl rand -base64 32

# Salida:
# 3hG9x2kL8mN_Abc123XyZ+GhJkLmN5oPqRsTuVwXyZ1a=
```

### Actualiza tu `.env`:

```env
META_VERIFY_TOKEN=3hG9x2kL8mN_Abc123XyZ+GhJkLmN5oPqRsTuVwXyZ1a=
META_PHONE_NUMBER_ID=102345678901234
META_ACCESS_TOKEN=EAAx...xyz
```

---

## 2️⃣ Código (1 minuto)

### ✅ Archivos ya creados:

- `src/infrastructure/adapters/MetaWhatsAppAdapter.ts` ← El adaptador
- `src/config/env.ts` ← Variables de entorno
- `src/app/ApplicationContainer.ts` ← Inyección
- `src/infrastructure/server/ExpressServer.ts` ← Integración

### Compilar:

```bash
npm run build
```

✅ Si ves `PS C:\...>` sin errores, ¡está compilado!

---

## 3️⃣ Webhook en Meta Console (1 minuto)

### 1. Ve a Meta Developers:

```
https://developers.facebook.com/
  → Tu App
    → WhatsApp Manager
      → Configuration
        → Webhooks → Select a number
```

### 2. Ingresa tus datos:

```
Callback URL:    https://tudominio.com/webhook
Verify Token:    3hG9x2kL8mN_Abc123XyZ+GhJkLmN5oPqRsTuVwXyZ1a=

[Verify and Save]
```

Meta hará un `GET` con `?hub.challenge=...` → Nuestro adaptador responde ✅

### 3. Suscribirse a eventos:

```
En la misma página, Manage → Selecciona "messages"
```

---

## 🎯 Ahora puedes:

### A) Recibir mensajes

Usuario envía en WhatsApp:
```
"Hola, necesito ayuda"
```

Tu servidor recibe automáticamente (parseado):
```typescript
{
  from: "34612345678",
  content: "Hola, necesito ayuda",
  businessNumber: "34912345678",
  timestamp: "1234567890"
}
```

### B) Responder con texto

```typescript
const metaAdapter = container.getMetaWhatsAppAdapter();

await metaAdapter.sendMessage(
  "34612345678",
  "¡Hola! Un agente te contactará pronto."
);
```

Resultado en WhatsApp del usuario: ✅

### C) Responder con botones

```typescript
await metaAdapter.sendButtons(
  "34612345678",
  "¿En qué te ayudamos?",
  ["📦 Orden", "💰 Pago", "❌ Cancelar"]
);
```

Resultado en WhatsApp: 3 botones clickeables ✅

---

## 🧪 Testing Local

### Simular handshake (verificar token):

```bash
curl "http://localhost:3001/webhook?hub.mode=subscribe&hub.verify_token=3hG9x2kL8mN_Abc123XyZ&hub.challenge=test123"

# Respuesta esperada:
# test123
```

### Simular mensaje entrante:

```bash
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
            "text": { "body": "¡Hola!" },
            "timestamp": "1234567890"
          }]
        }
      }]
    }]
  }'

# Respuesta esperada:
# { "success": true, ... }
```

---

## 📊 Límites Meta (Importante)

| Límite | Valor | Acción |
|--------|-------|--------|
| Botones por mensaje | 3 máx | Adaptador trunca automáticamente |
| Caracteres por botón | 20 máx | Adaptador trunca a 20 |
| Requests/segundo | 60 máx | Implementar rate limiter |
| Caracteres totales mensaje | 1024 máx | Validar antes de enviar |

---

## 🚨 Si algo falla...

### "Token incorrecto"

```
❌ Token de verificación incorrecto
```

→ Verifica que `META_VERIFY_TOKEN` en .env = token en Meta Dashboard

### "Credenciales no configuradas"

```
⚠️  Credenciales META no configuradas
```

→ Llena `META_PHONE_NUMBER_ID` y `META_ACCESS_TOKEN` en .env

### "No compila"

```bash
npm run build
# Debe estar en blanco (sin errores)
```

### "Webhook no se conecta"

→ Verifica:
  - `npm start` está levantado
  - Servidor es accesible desde internet (no localhost)
  - Firewall permite puerto 3001
  - Logs muestran "Servidor escuchando en puerto 3001"

---

## 📚 Documentación Completa

- **Guía completa:** `META_WHATSAPP_ADAPTER_GUIDE.md`
- **Ejemplos de código:** `META_INTEGRATION_EXAMPLE.ts`
- **Checklist completo:** `META_ADAPTER_IMPLEMENTATION_CHECKLIST.md`
- **Resumen de arquitectura:** `META_ADAPTER_SUMMARY.md`

---

## ✅ Checklist rápido

- [ ] Credenciales Meta en `.env`
- [ ] `npm run build` sin errores
- [ ] Webhook registrado en Meta Dashboard
- [ ] `npm start` levantado
- [ ] Test GET /webhook ✅
- [ ] Test POST /webhook ✅
- [ ] Enviar respuesta de texto ✅
- [ ] Enviar respuesta con botones ✅

---

**¡Listo! Ya puedes usar Meta WhatsApp Cloud API en SegurITech Bot Pro.** 🚀

Si necesitas ayuda adicional, lee `META_WHATSAPP_ADAPTER_GUIDE.md`.

