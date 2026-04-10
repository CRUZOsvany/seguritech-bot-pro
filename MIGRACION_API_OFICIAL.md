# 🚀 MIGRACIÓN A API OFICIAL - GUÍA RÁPIDA

## ✅ COMPLETADO

### 1. Limpieza
- ✅ Desinstalado: @whiskeysockets/baileys, qrcode-terminal
- ✅ Eliminado: src/bot.ts
- ✅ Instalado: express, sqlite3

### 2. Nuevos Archivos
- ✅ `src/infrastructure/adapters/ReadlineAdapter.ts` - Terminal interactiva
- ✅ `src/infrastructure/server/ExpressServer.ts` - Webhook POST
- ✅ `src/Bootstrap.ts` - Reescrito sin Baileys

### 3. Configuración
- ✅ `src/config/env.ts` - Agregado webhookPort, webhookToken
- ✅ `package.json` - Actualizado dependencias

---

## 🎮 PROBAR LOCALMENTE

### Opción A: Terminal Interactiva
```bash
npm run dev
# Escribe mensajes en la consola
# Presiona Enter para enviar
# Escribe "exit" para salir
```

**Ejemplo**:
```
Tú: Hola
┌─ BOT RESPONDE:
│
│ 🤖 *¡Bienvenido a SegurITech!*
│
│ Selecciona una opción:
│ 1️⃣ Ver productos
└─

Tú: 1
┌─ BOT RESPONDE:
│
│ 📦 *Productos Disponibles:*
│ - Sistema de Seguridad
│ - Cuadernos de Laboratorio
│ - Paquetes Especiales
└─
```

### Opción B: Webhook (curl)
```bash
# Terminal 1: Ejecutar el bot
npm run dev

# Terminal 2: Enviar mensaje via webhook
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber":"+34123456789","message":"Hola"}'

# Respuesta:
# {"success":true,"response":"🤖 *¡Bienvenido a SegurITech!*...","timestamp":"..."}
```

---

## 📊 ESTRUCTURA FINAL

```
src/
├── Bootstrap.ts (✨ sin Baileys)
├── index.ts
│
├── infrastructure/
│   ├── adapters/
│   │   ├── ReadlineAdapter.ts (✨ NEW)
│   │   └── ...
│   └── server/
│       └── ExpressServer.ts (✨ NEW)
└── ...
```

---

## 🔌 PARA CONECTAR A API OFICIAL MAÑANA

El `ExpressServer.ts` ya tiene:
- ✅ POST /webhook - Recibe mensajes
- ✅ GET /webhook - Verificación de Meta
- ✅ Health check

Solo necesitas:
1. Conectar a token de Meta (WEBHOOK_TOKEN env)
2. Apuntar tu webhook en Meta Business Platform a: `https://tudominio.com/webhook`
3. Cambiar simulados POST a reales de Meta

El código está listo. Solo cambia el adaptador de entrada.

---

## 🧪 VALIDACIÓN

```bash
npm run type-check  # ✅ Sin errores TypeScript
npm run lint        # ✅ ESLint OK
npm run dev         # ✅ Inicia correctamente
```

---

**Estado**: Ready for local testing ✅  
**Próximo paso**: Integración con WhatsApp Cloud API

