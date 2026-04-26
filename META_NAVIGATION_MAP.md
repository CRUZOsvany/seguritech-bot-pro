# 🗺️ MetaWhatsAppAdapter - Mapa de Navegación

Una guía visual para encontrar exactamente lo que necesitas.

---

## 🚀 START HERE

### Si tienes 2 minutos:
→ Lee: [`META_QUICKSTART.md`](./META_QUICKSTART.md)  
Obtén credenciales, copia `.env`, listo.

### Si tienes 15 minutos:
→ Lee: [`META_WHATSAPP_ADAPTER_GUIDE.md`](./META_WHATSAPP_ADAPTER_GUIDE.md)  
Entendé la arquitectura, flujos, y casos de uso.

### Si estás implementando:
→ Usa: [`META_ADAPTER_IMPLEMENTATION_CHECKLIST.md`](./META_ADAPTER_IMPLEMENTATION_CHECKLIST.md)  
Checklist paso a paso en 6 fases.

### Si quieres ver código:
→ Abre: [`META_INTEGRATION_EXAMPLE.ts`](./META_INTEGRATION_EXAMPLE.ts)  
6 ejemplos ejecutables de cada función.

---

## 📂 Estructura de Archivos

### 🎯 CÓDIGO FUENTE CREADO

```
src/infrastructure/adapters/
└── MetaWhatsAppAdapter.ts (504 líneas)
    ├─ Método: verifyWebhook()
    ├─ Método: parseIncomingMessage()
    ├─ Método: sendMessage()
    └─ Método: sendButtons()
```

**Path completo:**
```
C:\Users\micho\IdeaProjects\seguritech-bot-proprueba\
  src\infrastructure\adapters\MetaWhatsAppAdapter.ts
```

---

### 📝 ACTUALIZACIONES EXISTENTES

| Archivo | Cambios | Por qué |
|---------|---------|--------|
| `src/config/env.ts` | Agregado bloque `meta: {...}` | Centralizar credenciales |
| `src/app/ApplicationContainer.ts` | Instancia `MetaWhatsAppAdapter` + getter | Inyección de dependencias |
| `src/infrastructure/server/ExpressServer.ts` | Constructor + setter + uso en rutas | Integración con Express |
| `.env.example` | Agregadas variables META_* | Documentar variables |

**Paths:**
- `C:\Users\micho\IdeaProjects\seguritech-bot-proprueba\src\config\env.ts`
- `C:\Users\micho\IdeaProjects\seguritech-bot-proprueba\src\app\ApplicationContainer.ts`
- `C:\Users\micho\IdeaProjects\seguritech-bot-proprueba\src\infrastructure\server\ExpressServer.ts`
- `C:\Users\micho\IdeaProjects\seguritech-bot-proprueba\.env.example`

---

### 📚 DOCUMENTACIÓN CREADA

| Documento | Propósito | Para quién |
|-----------|-----------|-----------|
| `META_QUICKSTART.md` | ⚡ Empezar en 3 minutos | Devs impacientes |
| `META_WHATSAPP_ADAPTER_GUIDE.md` | 📖 Guía completa + arquitectura | Devs que lerán todo |
| `META_ADAPTER_IMPLEMENTATION_CHECKLIST.md` | ✅ 60+ pasos para deployment | Project managers & devs |
| `META_INTEGRATION_EXAMPLE.ts` | 💻 Código ejecutable | Devs practicones |
| `META_ADAPTER_SUMMARY.md` | 🎓 Resumen ejecutivo | Architects & leads |
| **Este archivo** | 🗺️ Navegación | Todos |

**Todos los Paths:**
```
C:\Users\micho\IdeaProjects\seguritech-bot-proprueba\
├── META_QUICKSTART.md
├── META_WHATSAPP_ADAPTER_GUIDE.md
├── META_ADAPTER_IMPLEMENTATION_CHECKLIST.md
├── META_INTEGRATION_EXAMPLE.ts
├── META_ADAPTER_SUMMARY.md
└── META_NAVIGATION_MAP.md (este archivo)
```

---

## 🎯 Casos de Uso - Dónde Buscar

### "Necesito empezar rápido"
1. Lee: `META_QUICKSTART.md`
2. Si pregunta fundamental, lee: `META_WHATSAPP_ADAPTER_GUIDE.md` sección relevante
3. Copia & pega de: `META_INTEGRATION_EXAMPLE.ts`

### "¿Cómo funciona exactamente?"
1. Lee intro: `META_ADAPTER_SUMMARY.md` (arquitectura)
2. Lee detalles: `META_WHATSAPP_ADAPTER_GUIDE.md`
3. Mira código: `src/infrastructure/adapters/MetaWhatsAppAdapter.ts`

### "¿Cómo lo deployo en producción?"
1. Sigue: `META_ADAPTER_IMPLEMENTATION_CHECKLIST.md`
2. Específicamente: Secciones 3, 5, 6

### "¿Cómo hago X cosa?"
1. Busca en: `META_WHATSAPP_ADAPTER_GUIDE.md` o `META_ADAPTER_IMPLEMENTATION_CHECKLIST.md`
2. Si no está, busca en: `META_INTEGRATION_EXAMPLE.ts`
3. Si aún así no, lee el código: `MetaWhatsAppAdapter.ts`

### "¿Cuáles son mis límites/restricciones?"
→ `META_WHATSAPP_ADAPTER_GUIDE.md` sección "Límites de Meta"
→ `META_QUICKSTART.md` tabla de "Límites Meta"

### "¿Qué hacer si falla?"
→ `META_ADAPTER_IMPLEMENTATION_CHECKLIST.md` sección 6 "Troubleshooting"
→ `META_QUICKSTART.md` sección "Si algo falla"

### "¿Cómo testeo?"
→ `META_ADAPTER_IMPLEMENTATION_CHECKLIST.md` sección 4 "Testing"
→ `META_INTEGRATION_EXAMPLE.ts` para ejemplos
→ `META_WHATSAPP_ADAPTER_GUIDE.md` sección "Testing"

---

## 🏗️ Arquitectura - Dónde Está Qué

### Layering Hexagonal

```
┌─ DOMINIO ────────────────────────────────────────┐
│                                                   │
│  NotificationPort (abstracción)                  │
│  ← src/domain/ports/index.ts                    │
│                                                   │
└──────────────────────────────────────────────────┘

┌─ ADAPTADORES ─────────────────────────────────────┐
│                                                    │
│  MetaWhatsAppAdapter ← src/infrastructure/adapters/
│                         MetaWhatsAppAdapter.ts   │
│  BaileysWhatsAppAdapter ← src/infrastructure/adapters/
│                            BaileysWhatsAppAdapter.ts │
│                                                    │
│  ExpressServer ← src/infrastructure/server/      │
│                  ExpressServer.ts                │
│                                                    │
└────────────────────────────────────────────────────┘

┌─ CONFIGURACIÓN ─────────────────────────────────────┐
│                                                      │
│  config/env.ts ← src/config/env.ts                 │
│  ApplicationContainer ← src/app/ApplicationContainer.ts │
│                                                      │
└──────────────────────────────────────────────────────┘
```

---

## 🔧 Métodos del Adaptador

### `MetaWhatsAppAdapter.verifyWebhook()`
**Qué:** Valida el handshake de Meta  
**Dónde:** `META_WHATSAPP_ADAPTER_GUIDE.md` → sección "Verificación de Webhook"  
**Código:** Líneas 158-198 en `MetaWhatsAppAdapter.ts`  
**Ejemplo:** `META_INTEGRATION_EXAMPLE.ts` → `exampleWebhookVerification()`  

### `MetaWhatsAppAdapter.parseIncomingMessage()`
**Qué:** Traduce payload de Meta a formato interno  
**Dónde:** `META_WHATSAPP_ADAPTER_GUIDE.md` → sección "Parseo de Entrada"  
**Código:** Líneas 237-310 en `MetaWhatsAppAdapter.ts`  
**Ejemplo:** `META_INTEGRATION_EXAMPLE.ts` → `exampleParseIncomingMessage()`  

### `MetaWhatsAppAdapter.sendMessage()`
**Qué:** Envía mensaje de texto simple  
**Dónde:** `META_WHATSAPP_ADAPTER_GUIDE.md` → sección "Envío de Mensajes" → "Opción 1"  
**Código:** Líneas 351-370 en `MetaWhatsAppAdapter.ts`  
**Ejemplo:** `META_INTEGRATION_EXAMPLE.ts` → `exampleSendText()`  

### `MetaWhatsAppAdapter.sendButtons()`
**Qué:** Envía mensaje interactivo con botones  
**Dónde:** `META_WHATSAPP_ADAPTER_GUIDE.md` → sección "Envío de Mensajes" → "Opción 2"  
**Código:** Líneas 382-440 en `MetaWhatsAppAdapter.ts`  
**Ejemplo:** `META_INTEGRATION_EXAMPLE.ts` → `exampleSendButtons()`  

### `MetaWhatsAppAdapter.initialize()`
**Qué:** Ciclo de vida - inicializar  
**Código:** Líneas 497-505 en `MetaWhatsAppAdapter.ts`  
**Nota:** Meta Cloud API no requiere conexión persistente (a diferencia de Baileys)

### `MetaWhatsAppAdapter.disconnect()`
**Qué:** Ciclo de vida - desconectar  
**Código:** Líneas 508-512 en `MetaWhatsAppAdapter.ts`  
**Nota:** No hay conexión que cerrar en Meta Cloud API

---

## 📖 Índice de Documentos

### META_QUICKSTART.md (200 líneas)
```
1. Obtener credenciales (1 min)
2. Configurar código (1 min)
3. Registrar webhook en Meta (1 min)
4. Testing local
5. Límites Meta
6. Troubleshooting rápido
7. Checklist rápido
```

### META_WHATSAPP_ADAPTER_GUIDE.md (400 líneas)
```
1. Overview
2. Instalación & Configuración
3. Flujo de Integración (A, B, C)
4. Integración en ExpressServer
5. Manejo de Errores
6. Arquitectura Hexagonal
7. Testing
8. Troubleshooting completo
9. Referencias
```

### META_ADAPTER_IMPLEMENTATION_CHECKLIST.md (600 líneas)
```
Fase 1: Configuración Inicial
Fase 2: Código
Fase 3: Integración en Meta Dashboard
Fase 4: Testing
Fase 5: Deployment
Fase 6: Monitoreo & Troubleshooting
- Problemas comunes & soluciones
- Documentación de referencia
- Roadmap futuro
```

### META_INTEGRATION_EXAMPLE.ts (450 líneas)
```
Setup inicial
Ejemplo 1: Instanciar adaptador
Ejemplo 2: Verificación de webhook
Ejemplo 3: Parsear mensajes
Ejemplo 4: Enviar texto
Ejemplo 5: Enviar botones
Ejemplo 6: Integración completa
- Ejecutable: npx ts-node META_INTEGRATION_EXAMPLE.ts
```

### META_ADAPTER_SUMMARY.md (600 líneas)
```
1. Misión cumplida
2. Entregables
   - Código núcleo
   - Actualizaciones infraestructura
   - Documentación
   - Variables de entorno
3. Especificaciones cumplidas
4. Arquitectura hexagonal respetada
5. Cómo integrar en codebase
6. Testing
7. Estadísticas
8. Aprendizajes clave
9. Recursos incluidos
10. Seguridad
11. Próximos pasos
```

---

## 🎓 Cómo Leer Este Proyecto

### Enfoque 1: Bottom-up (Entender el código primero)

1. Lee: `src/infrastructure/adapters/MetaWhatsAppAdapter.ts` (el código)
2. Lee: `META_INTEGRATION_EXAMPLE.ts` (cómo se usa)
3. Lee: `META_WHATSAPP_ADAPTER_GUIDE.md` (contexto)
4. Leo: `META_ADAPTER_SUMMARY.md` (big picture)

### Enfoque 2: Top-down (Entender la visión primero)

1. Lee: `META_ADAPTER_SUMMARY.md` (big picture)
2. Lee: `META_WHATSAPP_ADAPTER_GUIDE.md` (contexto)
3. Lee: `META_INTEGRATION_EXAMPLE.ts` (cómo se usa)
4. Leo: `src/infrastructure/adapters/MetaWhatsAppAdapter.ts` (el código)

### Enfoque 3: Pragmático (Hacerlo funcionar)

1. Lee: `META_QUICKSTART.md` (para empezar)
2. Usa: `META_ADAPTER_IMPLEMENTATION_CHECKLIST.md` (paso a paso)
3. Experimenta: `META_INTEGRATION_EXAMPLE.ts` (ejecuta los ejemplos)
4. Consulta: `META_WHATSAPP_ADAPTER_GUIDE.md` (si tienes dudas)

---

## 🔗 Dependencies & Imports

### En MetaWhatsAppAdapter.ts, importas:

```typescript
import { NotificationPort } from '@/domain/ports';      // Interfaz
import pino from 'pino';                                // Logger
import { Request, Response } from 'express';            // HTTP tipos
// fetch() es nativa de Node.js 18+
```

### En ApplicationContainer.ts:

```typescript
import { MetaWhatsAppAdapter } from '@/infrastructure/adapters/MetaWhatsAppAdapter';
import { config } from '@/config/env';
```

### En ExpressServer.ts:

```typescript
import { MetaWhatsAppAdapter } from '@/infrastructure/adapters/MetaWhatsAppAdapter';
```

---

## ✅ Verificación de Integridad

Después de los cambios, tu proyecto debe:

1. ✅ Compilar sin errores
   ```bash
   npm run build
   # Solo debe haber warnings de ESLint (ignorables)
   ```

2. ✅ Archivos presentes
   ```bash
   ls src/infrastructure/adapters/MetaWhatsAppAdapter.ts
   # Debe existir
   ```

3. ✅ Variables de entorno
   - `META_VERIFY_TOKEN` en .env
   - `META_PHONE_NUMBER_ID` en .env
   - `META_ACCESS_TOKEN` en .env

4. ✅ Prueba rápida
   ```bash
   npm start
   # Debe mostrar: "🚀 Servidor Express escuchando en puerto 3001"
   ```

---

## 📊 Resumen de Entregables

| Tipo | Cantidad | Total líneas |
|------|----------|-------------|
| **Código** | 1 archivo | 504 |
| **Actualizaciones** | 4 archivos | ~100 |
| **Documentación** | 5 archivos | ~2500 |
| **Variables entorno** | 4 nuevos valores | - |
| **Ejemplos** | 6 ejecutables | 450 |
| **Total** | 21 items | 3554+ |

---

## 🎯 Próximo Paso

**Recomendación:** Comienza por `META_QUICKSTART.md` (3 min) y luego `META_WHATSAPP_ADAPTER_GUIDE.md` (15 min).

---

*Último actualizado: 2025-04-25*  
*Arquitecto de Software: GitHub Copilot (especializado en integraciones API)*

