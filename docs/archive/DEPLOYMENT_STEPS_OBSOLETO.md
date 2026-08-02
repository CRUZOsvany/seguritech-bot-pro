# 🚀 PASOS DE DEPLOYMENT - BUG FIXES

Después de descargar el código, ejecutar estos pasos en orden:

## PASO 1: Variables de Entorno ✅

Agregar al `.env` o `.env.local`:
```env
SUPABASE_URL=https://YOUR-PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
```

Verificación:
```bash
echo $SUPABASE_URL
echo $SUPABASE_SERVICE_ROLE_KEY
```

## PASO 2: Migración de Base de Datos ✅

**Option A: Supabase Dashboard**
1. Ir a: https://app.supabase.com → Tu proyecto → SQL Editor
2. Copiar contenido de: `supabase/migrations/001_create_phone_tenant_map.sql`
3. Pegar en SQL Editor y ejecutar

**Option B: Supabase CLI**
```bash
supabase migration up
```

**Verificación**:
```sql
SELECT * FROM phone_tenant_map;
-- Debe retornar tabla vacía o con datos existentes
```

## PASO 3: Insertar Mapeos Phone → Tenant ✅

Para cada número de teléfono de negocio, ejecutar:
```sql
INSERT INTO phone_tenant_map (phone_number, tenant_id) VALUES 
  ('573123456789', 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'),
  ('573987654321', 'yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy');
```

Donde:
- `573123456789` = Número de teléfono del Business Account (formateado sin +, sin guiones)
- `xxxxxxxx-xxxx-...` = UUID del tenant en tabla `tenants`

## PASO 4: Compilar y Desplegar ✅

```bash
# Instalar dependencias (si es necesario)
npm install

# Compilar TypeScript
npm run build

# Iniciar servidor
npm start

# O para development:
npm run dev
```

## PASO 5: Probar Webhook ✅

### Test 1: Número mapeado
```bash
curl -X POST http://localhost:3001/webhook \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature-256: sha256=test" \
  -d '{
    "entry": [{
      "changes": [{
        "value": {
          "metadata": {"display_phone_number": "573123456789"},
          "messages": [{
            "from": "573123456789",
            "text": {"body": "Hola"}
          }]
        }
      }]
    }]
  }'
```

**Respuesta esperada** (HTTP 200):
```json
{
  "success": true,
  "tenantId": "xxxxxxxx-xxxx-...",
  "response": "respuesta del bot",
  "timestamp": "2026-04-26T..."
}
```

### Test 2: Sin número mapeado
```bash
curl -X POST http://localhost:3001/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "entry": [{
      "changes": [{
        "value": {
          "messages": [{
            "from": "999999999999",
            "text": {"body": "Hola"}
          }]
        }
      }]
    }]
  }'
```

**Respuesta esperada** (HTTP 200):
```json
{
  "success": true,
  "message": "Webhook recibido pero sin tenant mapping para este número"
}
```

**Revisar logs**:
```
⚠️  Webhook de Meta sin tenantId resolvible. Configura phone_tenant_map con este número
```

## PASO 6: Configurar Webhook en Meta ✅

1. Ir a: Meta App Dashboard → WhatsApp → Configuration
2. Webhook URL: `https://tudominio.com/webhook`
3. Verify Token: El configurado en `META_VERIFY_TOKEN`
4. Subscribe events: `messages`

## ✨ Listo!

Si todos los tests retornan HTTP 200, el deployment está completo.

### Troubleshooting

**Problema**: Error 401 en Supabase
```
Service role key no configurada en variables de entorno del servidor
```

**Solución**: Verificar que `SUPABASE_SERVICE_ROLE_KEY` esté en `.env`

---

**Problema**: No se encuentra tenant para número
```
🔍 No se encontró mapping de teléfono -> tenant
```

**Solución**: Insertar registro en `phone_tenant_map` ejecutando:
```sql
INSERT INTO phone_tenant_map (phone_number, tenant_id, is_active) 
VALUES ('573XXXXXXXXX', 'tu-tenant-id-aqui', true);
```

---

**Problema**: Todos los webhooks retornan sin procesar
```
ℹ️  Webhook de Meta recibido pero sin mensajes
```

**Solución**: Meta está enviando un delivery receipt (no es un mensaje). Esto es normal.

