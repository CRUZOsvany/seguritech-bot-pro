# 🎮 COMANDOS RÁPIDOS - Copia y Pega

**Descripción:** Comandos listos para copiar/pegar para testing rápido.

---

## 🚀 PASO 1: INICIAR SERVIDOR

```bash
cd C:\Users\micho\IdeaProjects\seguritech-bot-pro
npm run build
npm start
```

**Esperado:**
```
      ƒ SIMULADOR MULTI-TENANT LOCAL v2.0 ƒ
         SegurITech Bot Pro

[papeleria_01|+56912345678] Tú: _
```

---

## 🧪 PASO 2: TESTING EN NUEVA TERMINAL (Deja npm start corriendo)

### Test 1: Papelería (copia todo)
```powershell
$uri = "http://localhost:3000/webhook/papeleria_01"
$body = '{"phoneNumber":"+56912345678","message":"Necesito cuadernos"}'
$headers = @{"Content-Type"="application/json"}
$response = Invoke-WebRequest -Uri $uri -Method POST -Body $body -Headers $headers -UseBasicParsing
Write-Host "PAPELERÍA RESPONSE:"
$response.Content
```

**Esperado:**
```
{"success":true,"tenantId":"papeleria_01",...}
```

---

### Test 2: Ferretería (copia todo)
```powershell
$uri = "http://localhost:3000/webhook/ferreteria_01"
$body = '{"phoneNumber":"+56987654321","message":"Necesito tornillos"}'
$headers = @{"Content-Type"="application/json"}
$response = Invoke-WebRequest -Uri $uri -Method POST -Body $body -Headers $headers -UseBasicParsing
Write-Host "FERRETERÍA RESPONSE:"
$response.Content
```

**Esperado:**
```
{"success":true,"tenantId":"ferreteria_01",...}
```

---

### Test 3: Óptica (copia todo)
```powershell
$uri = "http://localhost:3000/webhook/optica_01"
$body = '{"phoneNumber":"+56912345680","message":"Necesito lentes"}'
$headers = @{"Content-Type"="application/json"}
$response = Invoke-WebRequest -Uri $uri -Method POST -Body $body -Headers $headers -UseBasicParsing
Write-Host "ÓPTICA RESPONSE:"
$response.Content
```

**Esperado:**
```
{"success":true,"tenantId":"optica_01",...}
```

---

## 💬 PASO 3: TESTING EN TERMINAL INTERACTIVA

En la terminal de `npm start`, escribe estos comandos:

```
# Mensaje inicial
hola

# Ver ayuda
/help

# Ver contexto actual
/tenants

# Cambiar de negocio
/tenant ferreteria_01

# Enviar mensaje en nuevo negocio
Necesito tornillos

# Ver historial (debe mostrar solo "Necesito tornillos", no "hola")
/history

# Cambiar cliente
/phone +56987654321

# Enviar mensaje con nuevo cliente
Tengo un problema

# Volver a papelería
/tenant papeleria_01

# Ver historial de papelería (debe estar intacto)
/history

# Salir
exit
```

---

## 📊 PASO 4: VALIDAR AISLAMIENTO (Mientras npm start corre)

En nueva terminal:

### Opción A: Revisar qué tenants se han usado
```powershell
# Lista archivos de conversación
Get-ChildItem C:\Users\micho\IdeaProjects\seguritech-bot-pro -Filter "*.json" -Recurse
```

### Opción B: Consultar base de datos (si tienes sqlite3)
```powershell
# Ver todos los usuarios
sqlite3 C:\Users\micho\IdeaProjects\seguritech-bot-pro\database.sqlite `
  "SELECT tenant_id, phone_number FROM users ORDER BY tenant_id;"
```

**Esperado:**
```
papeleria_01|+56912345678
papeleria_01|+56987654321
ferreteria_01|+56912345678
optica_01|+56912345680
```

---

## 🔧 PASO 5: TROUBLESHOOTING

### Error: "Cannot find module '@/config/env'"
```bash
# Verifica que dist/register-paths.js existe
dir dist\register-paths.js

# Si no existe, recompila:
npm run build

# Verifica package.json script start
cat package.json | grep -A 1 '"start"'
```

---

### Error: "Connection refused on port 3000"
```powershell
# Verifica que npm start está ejecutándose
Get-Process node

# Si hay procesos node, detén todos:
Get-Process node | Stop-Process -Force

# Reinicia npm start
npm start
```

---

### Error: "SQLITE_ERROR: no such column: tenant_id"
```bash
# Base de datos antigua (single-tenant), bórrala:
rm database.sqlite

# Reinicia npm start (recreará con esquema nuevo)
npm start
```

---

## 📋 CHECKLIST RÁPIDO

- [ ] `npm run build` → Sin errores
- [ ] `npm start` → Servidor inicia
- [ ] Webhook papeleria_01 → Response 200
- [ ] Webhook ferreteria_01 → Response 200
- [ ] Terminal: `/tenant ferreteria_01` → Funciona
- [ ] Terminal: `/history` → Muestra solo historial de ferreteria_01
- [ ] Base de datos tiene múltiples tenant_ids
- [ ] Datos no se mezclan entre tenants

Si todo está ✅, el sistema está validado.

---

## 🚀 PRÓXIMOS PASOS

1. Ejecuta los tests de arriba
2. Confirma que todo funciona
3. Abre `TESTING_INTERACTIVE_TERMINAL.md` para escenarios más complejos
4. Cuando estés satisfecho, contacta al equipo

---

**Generado:** 2026-04-12  
**Versión:** v2.0 Multi-Tenant Edition

