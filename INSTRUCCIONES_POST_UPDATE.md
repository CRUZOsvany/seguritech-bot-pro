# 🚀 INSTRUCCIONES POST-UPDATE - Actualización a Rama Main

**Actualización Crítica Recibida**: Resolución de Colisión de Puertos EADDRINUSE :::3000  
**Fecha**: 12 Abril 2024  
**Rama**: main  
**Commit**: c365592

---

## ⚡ ACCIÓN INMEDIATA PARA EL EQUIPO

### Paso 1: Actualizar tu repositorio local

```bash
cd C:\Users\[tu-usuario]\IdeaProjects\seguritech-bot-pro
git pull origin main
```

**Esperado**: 11 archivos actualizados (2 código + 8 documentación)

### Paso 2: Reinstalar dependencias (por si acaso)

```bash
npm install
```

### Paso 3: Compilar la nueva versión

```bash
npm run build
```

**Esperado**: ✅ Sin errores de TypeScript

### Paso 4: Iniciar el servidor

```bash
npm start
```

**Esperado**: 🚀 Servidor Express escuchando en puerto 3001 (NO 3000)

---

## 📋 ¿QUÉ CAMBIÓ?

### Cambios Técnicos (3 archivos)

| Archivo | Cambio | Impacto |
|---------|--------|--------|
| `src/infrastructure/server/ExpressServer.ts:133` | `'3000'` → `'3001'` | Express ahora usa puerto 3001 |
| `src/config/env.ts:31` | `'3000'` → `'3001'` | Configuración centralizada corregida |
| `.env` (NO versionado) | Debe tener `WEBHOOK_PORT=3001` | Variable de entorno explícita |

### Documento Crítico para el Equipo

**LEE PRIMERO**: `ESTADO_ACTUALIZADO.md`
- ✅ Explicación completa del problema
- ✅ Solución implementada
- ✅ Guía Ngrok para webhooks públicos
- ✅ Siguiente paso definido

---

## 🔧 CONFIGURACIÓN DEL ENTORNO (.env)

Después de hacer `git pull`, **debes agregar esta línea a tu `.env` local**:

```dotenv
WEBHOOK_PORT=3001
```

**Ubicación del archivo**: `C:\Users\[tu-usuario]\IdeaProjects\seguritech-bot-pro\.env`

**IMPORTANTE**: Este archivo NO está versionado (está en `.gitignore`) por seguridad. Debes agregarlo manualmente en cada máquina.

---

## 📁 ARCHIVOS NUEVOS (DOCUMENTACIÓN)

Estos archivos han sido agregados al repositorio:

```
ESTADO_ACTUALIZADO.md              ← LEE ESTO PRIMERO
PROTOCOLO_VERIFICACION_PUERTOS.md  ← Guía manual
VERIFICACION_PUERTOS.ps1           ← Script automatizado
RESUMEN_EJECUTIVO_PUERTOS.md       ← Para stakeholders
REFERENCIA_RAPIDA.md               ← Cheat sheet 30 seg
CHECKLIST_FINAL.md                 ← Validación final
INDICE_SOLUCION_PUERTOS.md         ← Índice por rol
RECAPITULACION_HISTORICA.md        ← Referencia histórica
```

---

## ✅ VERIFICAR QUE TODO FUNCIONA

### Test 1: Health Check

```bash
curl http://localhost:3001/health

# ✅ Respuesta esperada:
# {"status":"ok","timestamp":"2024-04-12T..."}
```

### Test 2: Webhook Multi-Tenant

```bash
curl -X POST http://localhost:3001/webhook/papeleria_01 \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": "+56912345678", "message": "test"}'

# ✅ Respuesta esperada:
# {"success":true,"tenantId":"papeleria_01","response":...}
```

### Test 3: Terminal Interactiva

```bash
# npm start ya debería mostrar el prompt del bot:
[papeleria_01|+56912345678] Tú: /help

# Deberías ver los comandos disponibles
```

---

## 🚀 PRÓXIMO PASO: NGROK SETUP

Consulta `ESTADO_ACTUALIZADO.md` sección **"SIGUIENTE PASO INMEDIATO"** para:

1. Descargar Ngrok
2. Exponer puerto 3001 a público
3. Configurar en Meta Business Manager
4. Recibir webhooks reales de WhatsApp

---

## 📚 GUÍA POR ROL

### 👨‍💼 CTO / DevOps Lead
1. Lee: `ESTADO_ACTUALIZADO.md`
2. Verifica: `PROTOCOLO_VERIFICACION_PUERTOS.md`
3. Ejecuta: `npm run build && npm start`

### 👨‍💻 Desarrollador Backend
1. Lee: `REFERENCIA_RAPIDA.md`
2. `git pull origin main`
3. `npm run build && npm start`
4. Verifica: `curl http://localhost:3001/health`

### 🔧 DevOps Engineer
1. Lee: `RESUMEN_EJECUTIVO_PUERTOS.md`
2. Ejecuta: `.\VERIFICACION_PUERTOS.ps1`
3. Valida: `CHECKLIST_FINAL.md`

### 📊 Project Manager
1. Lee: `CHECKLIST_FINAL.md`
2. Confirma: 4/4 tareas ✅
3. Comparte con equipo

---

## ❓ PREGUNTAS FRECUENTES

**P: ¿Mi código del frontend cambió?**
A: No. Frontend continúa en puerto 3000. Ningún cambio allí.

**P: ¿Tengo que hacer algo especial?**
A: Solo asegúrate de agregar `WEBHOOK_PORT=3001` a tu `.env` local.

**P: ¿Qué es este cambio de 3000 a 3001?**
A: Express (backend webhooks) ahora escucha en 3001 en lugar de 3000 (que usa Next.js).

**P: ¿Esto afecta producción?**
A: Sí, pero ya está documentado en ESTADO_ACTUALIZADO.md.

**P: ¿Qué pasa si no tengo WEBHOOK_PORT?**
A: Fallback a 3001 automáticamente (no a 3000), así que funciona igual.

---

## ⚠️ IMPORTANTE

### NO hagas esto:
```bash
❌ rm -rf node_modules && npm install
❌ git reset --hard
❌ Modificar src/config/env.ts nuevamente
```

### SÍ haz esto:
```bash
✅ git pull origin main
✅ npm install (si hay cambios en package.json)
✅ npm run build
✅ npm start
```

---

## 🔗 REFERENCIAS

| Recurso | Ubicación |
|---------|-----------|
| Reporte completo | `ESTADO_ACTUALIZADO.md` |
| Guía manual | `PROTOCOLO_VERIFICACION_PUERTOS.md` |
| Script auto | `VERIFICACION_PUERTOS.ps1` |
| Ngrok setup | `ESTADO_ACTUALIZADO.md` → Sección "Ngrok" |
| Índice por rol | `INDICE_SOLUCION_PUERTOS.md` |

---

## 📞 SOPORTE

Si algo no funciona:

1. Consulta `PROTOCOLO_VERIFICACION_PUERTOS.md` (Troubleshooting)
2. Verifica `WEBHOOK_PORT=3001` en `.env`
3. Ejecuta `npm run build` nuevamente
4. Revisa que no haya otro proceso en puerto 3001

---

## ✅ CHECKLIST POST-UPDATE

- [ ] `git pull origin main` ejecutado
- [ ] `npm install` ejecutado (si fue necesario)
- [ ] `WEBHOOK_PORT=3001` agregado a `.env` local
- [ ] `npm run build` completó sin errores
- [ ] `npm start` inicia el servidor en puerto 3001
- [ ] `curl http://localhost:3001/health` retorna OK
- [ ] Terminal interactiva funciona
- [ ] Leíste `ESTADO_ACTUALIZADO.md`

---

## 🎉 ¡LISTO!

Tu repositorio está actualizado y sincronizado con GitHub.

**Próximo paso**: Ngrok setup (ver `ESTADO_ACTUALIZADO.md`)

---

**Actualización**: 12 Abril 2024  
**Rama**: main  
**Status**: ✅ COMPLETADO Y VERIFICADO


