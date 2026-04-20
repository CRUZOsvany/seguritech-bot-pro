# 📋 PROTOCOLO DE VERIFICACIÓN - COLISIÓN DE PUERTOS
**SegurITech Bot Pro v2.0 Multi-Tenant**  
*Resolución del error: EADDRINUSE :::3000*

---

## ✅ Objetivo

Separar completamente los entornos:
- **Puerto 3000**: Next.js Frontend (si aplica)
- **Puerto 3001**: Express Backend (WEBHOOK_PORT=3001)

---

## 🔍 Verificación de Puertos

### a) Verificar procesos ocupando los puertos

```powershell
# Puerto 3000 (Next.js)
Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | Select-Object OwningProcess, State

# Puerto 3001 (Express)
Get-NetTCPConnection -LocalPort 3001 -ErrorAction SilentlyContinue | Select-Object OwningProcess, State
```

**Esperado**: Ambos comandos retornan vacío (sin procesos).

---

## 🔨 Matar Procesos Huérfanos

### b) Identificar qué procesos usan los puertos

```powershell
# Buscar PID en puerto 3000
$port3000 = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue
if ($port3000) {
    Get-Process -Id $port3000.OwningProcess
}

# Buscar PID en puerto 3001
$port3001 = Get-NetTCPConnection -LocalPort 3001 -ErrorAction SilentlyContinue
if ($port3001) {
    Get-Process -Id $port3001.OwningProcess
}
```

### c) Matar procesos (EJECUTAR COMO ADMINISTRADOR)

```powershell
# Método 1: Por puerto (más seguro)
# Puerto 3000
$port3000 = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue
if ($port3000) {
    Stop-Process -Id $port3000.OwningProcess -Force
    Write-Host "✅ Proceso en puerto 3000 eliminado"
} else {
    Write-Host "ℹ️  Puerto 3000 ya está libre"
}

# Puerto 3001
$port3001 = Get-NetTCPConnection -LocalPort 3001 -ErrorAction SilentlyContinue
if ($port3001) {
    Stop-Process -Id $port3001.OwningProcess -Force
    Write-Host "✅ Proceso en puerto 3001 eliminado"
} else {
    Write-Host "ℹ️  Puerto 3001 ya está libre"
}

# Método 2: Matar por nombre de proceso (si sabes cuál es)
Stop-Process -Name "node" -Force -ErrorAction SilentlyContinue
```

---

## 🏗️ Compilar el Proyecto

### Paso 1: Navegar al directorio del backend

```powershell
cd C:\Users\micho\IdeaProjects\seguritech-bot-pro
```

### Paso 2: Compilar TypeScript

```powershell
npm run build
```

**Esperado**: 
```
> seguritech-bot-pro@1.0.0 build
> tsc

PS C:\Users\micho\IdeaProjects\seguritech-bot-pro>
```

Sin errores de compilación.

---

## 🚀 Iniciar el Servidor Backend

### Paso 3: Ejecutar el servidor

```powershell
npm start
```

**Esperado** (primeras líneas de logs):

```
🚀 SegurITech Bot Pro (API Oficial)
Entorno: development

⚙️  Inicializando...
✅ Contenedor DI creado
🚀 Servidor Express escuchando en puerto 3001
📍 Webhooks disponibles:
   POST http://localhost:3001/webhook/:tenantId
   POST http://localhost:3001/webhook (con tenantId en body)
   GET  http://localhost:3001/health
✅ Bot iniciado
```

---

## ✔️ Verificación Post-Arranque

### En otra terminal, verificar que el servidor está respondiendo

```powershell
# Verificar health check
curl http://localhost:3001/health

# Esperado:
# {"status":"ok","timestamp":"2024-04-12T10:30:45.123Z"}
```

---

## 🔐 Checklist de Validación

| Paso | Comando/Verificación | Resultado | ✅/❌ |
|------|---------------------|----------|------|
| **1** | `npm run build` | Sin errores de TypeScript | ✅ |
| **2** | `npm start` | Mensaje: "puerto 3001" en logs | ✅ |
| **3** | `curl http://localhost:3001/health` | Respuesta JSON con "status": "ok" | ✅ |
| **4** | Puerto 3000 libre | `Get-NetTCPConnection -LocalPort 3000` retorna vacío | ✅ |
| **5** | Puerto 3001 escuchando | `Get-NetTCPConnection -LocalPort 3001` muestra node.exe | ✅ |
| **6** | .env contiene WEBHOOK_PORT | `WEBHOOK_PORT=3001` en .env | ✅ |

---

## 🌐 Endpoints Disponibles (Post-Arranque)

```
GET  http://localhost:3001/health
     → Verificar que el servidor está vivo

POST http://localhost:3001/webhook/:tenantId
     → Recibir mensajes de WhatsApp Cloud API
     Payload:
     {
       "phoneNumber": "+56912345678",
       "message": "Hola bot"
     }

GET  http://localhost:3001/webhook/:tenantId
     → Verificación de webhook por Meta (hub.challenge)
```

---

## 🧪 Test Rápido (Opcionalmente en otra terminal)

```powershell
# Terminal 1: npm start (ya corriendo)

# Terminal 2: Test del webhook
curl -X POST http://localhost:3001/webhook/papeleria_01 `
  -H "Content-Type: application/json" `
  -d '{"phoneNumber": "+56912345678", "message": "hola"}'

# Esperado:
# {"success":true,"tenantId":"papeleria_01","response":"...","timestamp":"2024-04-12..."}
```

---

## 🚨 Troubleshooting

### ❌ Error: EADDRINUSE :::3001

**Causa**: El puerto 3001 ya está en uso.

**Solución**:
```powershell
$port3001 = Get-NetTCPConnection -LocalPort 3001 -ErrorAction SilentlyContinue
if ($port3001) {
    Stop-Process -Id $port3001.OwningProcess -Force
}
```

### ❌ Error: Compilación fallida

**Causa**: Errores de TypeScript.

**Solución**: Revisar output de `npm run build` y corregir.

### ❌ Error: WEBHOOK_PORT no definido

**Causa**: .env no tiene `WEBHOOK_PORT=3001`.

**Solución**: Verificar `.env` en la raíz del proyecto:
```powershell
Get-Content .\.env | Select-String WEBHOOK_PORT
# Debe retornar: WEBHOOK_PORT=3001
```

### ❌ Error: "Cannot find module..."

**Causa**: Dependencias no instaladas.

**Solución**:
```powershell
npm install
npm run build
```

---

## 📡 Próximo Paso: Ngrok

Una vez verificado que el servidor escucha en puerto 3001:

```powershell
# Descargar Ngrok (si no lo tienes): https://ngrok.com
ngrok http 3001

# Output:
# Forwarding  https://1234-56-78-90-123.ngrok-free.app -> http://localhost:3001
```

**URL pública para Meta**: `https://1234-56-78-90-123.ngrok-free.app/webhook/:tenantId`

---

## 📚 Resumen

| Componente | Puerto | Estado | Configuración |
|-----------|--------|--------|---------------|
| **Express Backend** | 3001 | ✅ ACTIVO | `WEBHOOK_PORT=3001` en `.env` |
| **Next.js Frontend** | 3000 | ✅ LIBRE | No colisiona |
| **Ngrok** | — | 📍 Próximo | Conectar a `localhost:3001` |

---

**¡Listo para testing! 🚀**

Última actualización: 12 Abril 2024


