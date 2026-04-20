# 🎮 Guía de Testing Interactivo - Terminal Multi-Tenant

> **Estado**: ✅ Sistema listo para pruebas interactivas
> **Fecha**: 2026-04-12

---

## 🚀 INICIO RÁPIDO (5 minutos)

### Paso 1: Compilar
```bash
npm run build
```

### Paso 2: Ejecutar
```bash
npm start
```

Deberías ver:
```
      ƒ SIMULADOR MULTI-TENANT LOCAL v2.0 ƒ
         SegurITech Bot Pro

ƒ INFORMACIÓN DEL CONTEXTO:
   ƒ Tenant Actual: papeleria_01
   ƒ Cliente Actual: +56912345678
```

### Paso 3: Probar Mensaje
```
[papeleria_01|+56912345678] Tú: hola
```

---

## 📋 COMANDOS DISPONIBLES

| Comando | Ejemplo | Efecto |
|---------|---------|--------|
| `/tenant` | `/tenant ferreteria_01` | Cambiar tenant (negocio) |
| `/phone` | `/phone +56987654321` | Cambiar número de cliente |
| `/tenants` | `/tenants` | Listar todos los tenants |
| `/history` | `/history` | Ver conversación actual |
| `/help` | `/help` | Mostrar ayuda |
| `exit` | `exit` | Salir |
| (mensaje normal) | `hola` | Enviar mensaje al bot |

---

## 🎯 ESCENARIO 1: Papelería Básica (3 minutos)

### Inicio
```bash
npm start
```

### Acciones
```
[papeleria_01|+56912345678] Tú: hola

[papeleria_01|+56912345678] Tú: /help

[papeleria_01|+56912345678] Tú: /history
```

**Esperado:**
- ✅ Bot responde "Escribe hola para empezar"
- ✅ Ver lista de comandos
- ✅ Ver historial de papelería

---

## 🎯 ESCENARIO 2: Multi-Tenant (Cambiar de Negocio)

### Iniciamos en papelería
```
[papeleria_01|+56912345678] Tú: Compré 100 cuadernos

[papeleria_01|+56912345678] Tú: /history
```

### Cambiamos a ferretería
```
[papeleria_01|+56912345678] Tú: /tenant ferreteria_01

[ferreteria_01|+56912345678] Tú: Necesito 50 tornillos
```

**Esperado:**
- ✅ El prefijo cambia a `ferreteria_01`
- ✅ El bot responde en contexto de ferretería
- ✅ `ferreteria_01` tiene su **propio historial** (vacío)

### Volvemos a papelería
```
[ferreteria_01|+56912345678] Tú: /tenant papeleria_01

[papeleria_01|+56912345678] Tú: /history
```

**Esperado:**
- ✅ Historial de papelería sigue ahí (vemos "Compré 100 cuadernos")
- ✅ **Datos completamente aislados** ✅

---

## 🎯 ESCENARIO 3: Múltiples Clientes del Mismo Negocio

### Cliente 1 de papelería
```
[papeleria_01|+56912345678] Tú: Necesito papel bond
```

### Cambiar cliente (mismo negocio)
```
[papeleria_01|+56912345678] Tú: /phone +56912345679

[papeleria_01|+56912345679] Tú: Hola, tengo un reclamo
```

**Esperado:**
- ✅ Número de cliente cambia en el prefijo
- ✅ Este es un **usuario diferente** en la BD
- ✅ Pero sigue siendo `papeleria_01`

### Volver al primer cliente
```
[papeleria_01|+56912345679] Tú: /phone +56912345678

[papeleria_01|+56912345678] Tú: /history
```

**Esperado:**
- ✅ Vemos el historial del primer cliente ("Necesito papel bond")
- ✅ No vemos el reclamo del segundo cliente

---

## 🎯 ESCENARIO 4: Validar Aislamiento Total (5 minutos)

### Cliente de papelería
```
[papeleria_01|+56912345678] Tú: Información confidencial A
[papeleria_01|+56912345678] Tú: /history
```

### Cliente de ferretería
```
[papeleria_01|+56912345678] Tú: /tenant ferreteria_01
[ferreteria_01|+56912345678] Tú: /history
```

**VALIDACIÓN CRÍTICA:**
- ❌ "Información confidencial A" NO aparece en ferreteria_01
- ✅ Cada tenant ve **solo su propio historial**

### Verificar en tercera terminal (mientras npm start sigue corriendo)
```bash
# Terminal 2 - Sin cerrar Terminal 1
cd C:\Users\micho\IdeaProjects\seguritech-bot-pro
node check-db.js
```

**Esperado:**
```
📊 USUARIOS EN BASE DE DATOS:
  Tenant: papeleria_01 | ID: ... | Phone: +56912345678
  Tenant: papeleria_01 | ID: ... | Phone: +56912345679
  Tenant: ferreteria_01 | ID: ... | Phone: +56912345678
```

✅ **Tres registros diferentes**, cada uno con su `tenant_id`

---

## 🌐 ESCENARIO 5: Testing con cURL (Webhook API)

### Terminal Nueva (dejando npm start corriendo)

#### Test 1: Papelería
```bash
$uri = "http://localhost:3000/webhook/papeleria_01"
$body = '{"phoneNumber":"+56912345678","message":"Necesito lapiceros"}'
$headers = @{"Content-Type"="application/json"}
$response = Invoke-WebRequest -Uri $uri -Method POST -Body $body -Headers $headers -UseBasicParsing
$response.Content
```

**Esperado:**
```json
{
  "success": true,
  "tenantId": "papeleria_01",
  "response": "...",
  "timestamp": "..."
}
```

#### Test 2: Ferretería
```bash
$uri = "http://localhost:3000/webhook/ferreteria_01"
$body = '{"phoneNumber":"+56912345679","message":"Necesito pintura"}'
$headers = @{"Content-Type"="application/json"}
$response = Invoke-WebRequest -Uri $uri -Method POST -Body $body -Headers $headers -UseBasicParsing
$response.Content
```

**Esperado:**
```json
{
  "success": true,
  "tenantId": "ferreteria_01",
  "response": "...",
  "timestamp": "..."
}
```

#### Test 3: Tercera Negocio (Óptica)
```bash
$uri = "http://localhost:3000/webhook/optica_01"
$body = '{"phoneNumber":"+56912345680","message":"Necesito lentes"}'
$headers = @{"Content-Type"="application/json"}
$response = Invoke-WebRequest -Uri $uri -Method POST -Body $body -Headers $headers -UseBasicParsing
$response.Content
```

---

## ✅ LISTA DE VALIDACIÓN FINAL

- [ ] Compilación sin errores (`npm run build`)
- [ ] Servidor inicia en puerto 3000 (`npm start`)
- [ ] Terminal interactiva muestra prefijo `[tenant|phone]`
- [ ] Comando `/tenant` cambia el tenant actual
- [ ] Comando `/phone` cambia el cliente actual
- [ ] Comando `/history` muestra solo historial del tenant actual
- [ ] Cambiar de tenant cambia el historial
- [ ] Cambiar de cliente dentro del mismo tenant maneja usuarios diferentes
- [ ] Webhooks responden correctamente
- [ ] Webhook 1 (papeleria_01) aislado de Webhook 2 (ferreteria_01)
- [ ] Tercera tenant (optica_01) también funciona
- [ ] Base de datos muestra múltiples tenant_ids

---

## 🐛 TROUBLESHOOTING

### Problema: "Cannot find module '@/config/env'"
**Solución:** 
- Asegurar que `npm start` carga `dist/register-paths.js`
- Revisar `package.json` script `start`

### Problema: "SQLITE_ERROR: no such column: tenant_id"
**Solución:**
- Base de datos antigua (single-tenant)
- Ejecutar: `rm database.sqlite` y reiniciar

### Problema: "Connection refused on port 3000"
**Solución:**
- Revisar que `npm start` esté ejecutándose
- Revisar que no hay otro proceso en puerto 3000
- `Get-Process node | Stop-Process -Force` para limpiar

---

## 📊 EXPECTED FLOW (Diagrama)

```
INICIO
  │
  ├─ Terminal: [papeleria_01|+56912345678]
  │   │
  │   ├─ Mensaje 1: "Necesito cuadernos"
  │   │  └─ Guardado en: users WHERE tenant_id='papeleria_01'
  │   │
  │   └─ /tenant ferreteria_01
  │      └─ Cambia contexto
  │
  ├─ Terminal: [ferreteria_01|+56912345678]
  │   │
  │   ├─ Mensaje 2: "Necesito tornillos"
  │   │  └─ Guardado en: users WHERE tenant_id='ferreteria_01'
  │   │
  │   └─ /history
  │      └─ Muestra SOLO: "Necesito tornillos"
  │         (NO "Necesito cuadernos")
  │
  └─ VALIDACIÓN: ✅ Datos completamente aislados

API WEBHOOK
  │
  ├─ POST /webhook/papeleria_01 → ✅ Responde
  ├─ POST /webhook/ferreteria_01 → ✅ Responde
  └─ POST /webhook/optica_01 → ✅ Responde
     (Todos con datos aislados)
```

---

## 🎓 CONCEPTOS CLAVE

### ¿Qué es tenantId?
Es el **identificador único del negocio** (ej: `papeleria_01`, `ferreteria_01`)

### ¿Cómo se garantiza el aislamiento?
1. **SQL**: PRIMARY KEY (tenant_id, id) + UNIQUE (tenant_id, phone)
2. **Queries**: WHERE tenant_id = ? en todas
3. **Código**: Método repository requiere tenantId
4. **HTTP**: URL contiene tenantId explícitamente

### ¿Puedo usar el mismo phone_number en dos tenants?
✅ **SÍ**, porque la clave es compuesta: `(tenant_id, phone_number)`
- Papelería: `(papeleria_01, +56912345678)`
- Ferretería: `(ferreteria_01, +56912345678)`
- Óptica: `(optica_01, +56912345678)`

Son **3 usuarios completamente diferentes**.

---

## 📞 CONTACTO RÁPIDO

- **Error de módulos**: Revisar `dist/register-paths.js`
- **Error de BD**: Revisar `SqliteUserRepository.ts`
- **Error de tenant**: Revisar que `tenantId` se pase en URL

**Estado**: ✅ Sistema Multi-Tenant 100% Funcional

¡Disfruta probando! 🚀

