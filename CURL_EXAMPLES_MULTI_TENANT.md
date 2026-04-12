# 🧪 cURL Examples - Multi-Tenant Testing

## Setup Previo

Asegúrate que el bot está corriendo:
```bash
npm start
```

El servidor escuchará en `http://localhost:3000`

---

## 1. Health Check

```bash
curl http://localhost:3000/health
```

**Respuesta esperada**:
```json
{
  "status": "ok",
  "timestamp": "2024-04-11T10:30:45.123Z"
}
```

---

## 2. Webhook Verificación Meta (GET)

### Para /webhook
```bash
curl "http://localhost:3000/webhook?hub.mode=subscribe&hub.verify_token=tu_token_secreto&hub.challenge=test_challenge_123"
```

**Respuesta esperada**: `test_challenge_123`

### Para /webhook/:tenantId
```bash
curl "http://localhost:3000/webhook/papeleria_01?hub.mode=subscribe&hub.verify_token=tu_token_secreto&hub.challenge=test_challenge_123"
```

**Respuesta esperada**: `test_challenge_123`

---

## 3. Mensaje a Papelería (POST /webhook/:tenantId)

```bash
curl -X POST http://localhost:3000/webhook/papeleria_01 \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumber": "+56912345678",
    "message": "hola"
  }'
```

**Respuesta esperada**:
```json
{
  "success": true,
  "tenantId": "papeleria_01",
  "response": "¡Hola! Bienvenido a SegurITech Bot Pro. ¿Qué deseas hacer?",
  "timestamp": "2024-04-11T10:30:45.123Z"
}
```

---

## 4. Mensaje a Ferretería (POST /webhook/:tenantId)

```bash
curl -X POST http://localhost:3000/webhook/ferreteria_01 \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumber": "+56912345678",
    "message": "hola"
  }'
```

**Respuesta esperada**:
```json
{
  "success": true,
  "tenantId": "ferreteria_01",
  "response": "¡Hola! Bienvenido a SegurITech Bot Pro. ¿Qué deseas hacer?",
  "timestamp": "2024-04-11T10:30:45.123Z"
}
```

**⚠️ IMPORTANTE**: Aunque ambas respuestas se ven iguales, los usuarios en la BD son DIFERENTES:
- `papeleria_01` → `+56912345678`
- `ferreteria_01` → `+56912345678`

---

## 5. Progresión de Conversación - Papelería

### Saludo
```bash
curl -X POST http://localhost:3000/webhook/papeleria_01 \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": "+56912345678", "message": "hola"}'
```

### Seleccionar opción 1 (Productos)
```bash
curl -X POST http://localhost:3000/webhook/papeleria_01 \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": "+56912345678", "message": "1"}'
```

**Respuesta**:
```json
{
  "success": true,
  "response": "Productos disponibles:\n\n1. Seguro Básico - $10/mes\n...",
  "timestamp": "..."
}
```

### Seleccionar opción 2 (Precios)
```bash
curl -X POST http://localhost:3000/webhook/papeleria_01 \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": "+56912345678", "message": "2"}'
```

---

## 6. Múltiples Clientes en Ferretería

### Cliente 1 envía mensaje
```bash
curl -X POST http://localhost:3000/webhook/ferreteria_01 \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumber": "+56912345678",
    "message": "hola"
  }'
```

### Cliente 2 envía mensaje (DIFERENTE NÚMERO)
```bash
curl -X POST http://localhost:3000/webhook/ferreteria_01 \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumber": "+56987654321",
    "message": "hola"
  }'
```

**✅ Resultado**: 2 usuarios diferentes en la BD, ambos en ferreteria_01

---

## 7. Endpoint Legacy (POST /webhook con tenantId en body)

```bash
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "tenantId": "cerrajeria_01",
    "phoneNumber": "+56912345690",
    "message": "hola"
  }'
```

**Respuesta esperada**:
```json
{
  "success": true,
  "tenantId": "cerrajeria_01",
  "response": "¡Hola! Bienvenido...",
  "timestamp": "..."
}
```

---

## 8. Test de Aislamiento Completo

### Script Bash (Linux/macOS)
```bash
#!/bin/bash

echo "=== TEST AISLAMIENTO MULTI-TENANT ==="

TENANT1="papeleria_01"
TENANT2="ferreteria_01"
PHONE="+56912345678"

echo ""
echo "1. Crear usuario en $TENANT1 con teléfono $PHONE"
curl -s -X POST http://localhost:3000/webhook/$TENANT1 \
  -H "Content-Type: application/json" \
  -d "{\"phoneNumber\": \"$PHONE\", \"message\": \"hola\"}" | jq .

echo ""
echo "2. Crear usuario en $TENANT2 con MISMO teléfono $PHONE"
curl -s -X POST http://localhost:3000/webhook/$TENANT2 \
  -H "Content-Type: application/json" \
  -d "{\"phoneNumber\": \"$PHONE\", \"message\": \"hola\"}" | jq .

echo ""
echo "✅ Si ambas llamadas fueron exitosas, el aislamiento funciona"
```

### Script PowerShell (Windows)
```powershell
$TENANT1 = "papeleria_01"
$TENANT2 = "ferreteria_01"
$PHONE = "+56912345678"

Write-Host "=== TEST AISLAMIENTO MULTI-TENANT ===" -ForegroundColor Green

Write-Host ""
Write-Host "1. Crear usuario en $TENANT1 con teléfono $PHONE"
$body1 = @{
    phoneNumber = $PHONE
    message = "hola"
} | ConvertTo-Json

Invoke-WebRequest -Uri "http://localhost:3000/webhook/$TENANT1" `
  -Method POST `
  -ContentType "application/json" `
  -Body $body1

Write-Host ""
Write-Host "2. Crear usuario en $TENANT2 con MISMO teléfono $PHONE"
$body2 = @{
    phoneNumber = $PHONE
    message = "hola"
} | ConvertTo-Json

Invoke-WebRequest -Uri "http://localhost:3000/webhook/$TENANT2" `
  -Method POST `
  -ContentType "application/json" `
  -Body $body2

Write-Host ""
Write-Host "✅ Si ambas llamadas fueron exitosas, el aislamiento funciona" -ForegroundColor Green
```

---

## 9. Errores Comunes

### Error 1: Falta tenantId
```bash
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": "+56912345678", "message": "hola"}'
```

**Respuesta**:
```json
{
  "error": "Missing tenantId, phoneNumber or message. Use POST /webhook/:tenantId"
}
```

### Error 2: Falta phoneNumber
```bash
curl -X POST http://localhost:3000/webhook/papeleria_01 \
  -H "Content-Type: application/json" \
  -d '{"message": "hola"}'
```

**Respuesta**:
```json
{
  "error": "Missing tenantId (URL param), phoneNumber or message (body)"
}
```

### Error 3: Token inválido en verificación Meta
```bash
curl "http://localhost:3000/webhook/papeleria_01?hub.mode=subscribe&hub.verify_token=token_incorrecto&hub.challenge=test"
```

**Respuesta**: HTTP 403 Forbidden

---

## 10. Verificación en Base de Datos

```bash
# Ver todos los usuarios
sqlite3 database.sqlite "SELECT tenant_id, phone_number, current_state FROM users;"

# Ver usuarios de papeleria
sqlite3 database.sqlite "SELECT id, phone_number, current_state FROM users WHERE tenant_id='papeleria_01';"

# Ver usuarios de ferreteria
sqlite3 database.sqlite "SELECT id, phone_number, current_state FROM users WHERE tenant_id='ferreteria_01';"

# Contar usuarios por tenant
sqlite3 database.sqlite "SELECT tenant_id, COUNT(*) FROM users GROUP BY tenant_id;"
```

**Salida esperada**:
```
tenant_id|COUNT(*)
papeleria_01|2
ferreteria_01|1
```

---

## 11. Flujo Completo de Negocio

```bash
# Crear conversación de papelería desde cero

# 1. Saludo
curl -X POST http://localhost:3000/webhook/papeleria_01 \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": "+56912345678", "message": "hola"}'

# 2. Ver productos
curl -X POST http://localhost:3000/webhook/papeleria_01 \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": "+56912345678", "message": "1"}'

# 3. Ver precios
curl -X POST http://localhost:3000/webhook/papeleria_01 \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": "+56912345678", "message": "2"}'

# 4. Hacer pedido
curl -X POST http://localhost:3000/webhook/papeleria_01 \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": "+56912345678", "message": "3"}'

# 5. Seleccionar producto
curl -X POST http://localhost:3000/webhook/papeleria_01 \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": "+56912345678", "message": "1"}'
```

---

## 12. Performance Benchmark

```bash
#!/bin/bash

echo "Enviando 10 mensajes rápidamente..."
start=$(date +%s%N)

for i in {1..10}; do
  curl -s -X POST http://localhost:3000/webhook/papeleria_01 \
    -H "Content-Type: application/json" \
    -d "{\"phoneNumber\": \"+569123456${i}0\", \"message\": \"hola\"}" > /dev/null
done

end=$(date +%s%N)
duration=$(( ($end - $start) / 1000000 ))

echo "10 mensajes procesados en ${duration}ms"
echo "Promedio: $((duration / 10))ms por mensaje"
```

---

## 13. Postman Collection

### Descargar Postman
1. Instalar [Postman](https://www.postman.com/downloads/)
2. Importar la siguiente colección

### Variables de entorno
```json
{
  "base_url": "http://localhost:3000",
  "tenantId": "papeleria_01",
  "phoneNumber": "+56912345678"
}
```

### Requests

**Health Check**
```
GET {{base_url}}/health
```

**Webhook Multi-Tenant**
```
POST {{base_url}}/webhook/{{tenantId}}
Content-Type: application/json

{
  "phoneNumber": "{{phoneNumber}}",
  "message": "hola"
}
```

---

## Notas

- Reemplaza `localhost:3000` si el bot corre en otro puerto
- Los ejemplos usan `jq` para formatear JSON (instala con `apt install jq`)
- Para Windows, `jq` se puede instalar via `choco install jq`

---

**Última actualización**: 11 Abril 2024  
**Versión**: 2.0 Multi-Tenant

