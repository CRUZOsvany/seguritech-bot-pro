# 🏗️ Arquitectura Multi-Tenant Visual - SegurITech Bot Pro v2.0

## Comparativa: Single-Tenant vs Multi-Tenant

### ANTES (Single-Tenant) ❌
```
┌─────────────────────────────────────┐
│   SegurITech Bot Pro v1.0           │
│   (Un solo negocio)                 │
├─────────────────────────────────────┤
│                                     │
│  Base de Datos                      │
│  ┌─────────────────────────────┐   │
│  │ users                       │   │
│  ├─────────────────────────────┤   │
│  │ id  │ phone     │ state     │   │
│  │ A1  │ +56912... │ menu      │   │
│  │ A2  │ +56987... │ order     │   │
│  └─────────────────────────────┘   │
│                                     │
│  ⚠️ PROBLEMA: UN SOLO NEGOCIO       │
│                                     │
└─────────────────────────────────────┘
```

### AHORA (Multi-Tenant) ✅
```
┌──────────────────────────────────────────────────────┐
│         SegurITech Bot Pro v2.0                       │
│         (Múltiples negocios simultáneamente)         │
├──────────────────────────────────────────────────────┤
│                                                      │
│  Base de Datos (BLINDADA)                           │
│  ┌────────────────────────────────────────────────┐ │
│  │ users (con aislamiento multi-tenant)           │ │
│  ├────────────────────────────────────────────────┤ │
│  │ tenant_id        │ id  │ phone     │ state     │ │
│  │ papeleria_01     │ A1  │ +56912... │ menu      │ │
│  │ papeleria_01     │ A2  │ +56987... │ order     │ │
│  │ ferreteria_01    │ A3  │ +56912... │ menu      │ │
│  │ óptica_02        │ A4  │ +56945... │ initial   │ │
│  └────────────────────────────────────────────────┘ │
│                                                      │
│  ✅ SEGURIDAD: Mismos teléfonos ≠ Usuarios          │
│  ✅ ESCALABLE: N negocios sin conflictos             │
│                                                      │
└──────────────────────────────────────────────────────┘
```

---

## Flujo de Arquitectura Multi-Tenant

```
                        ┌─────────────────────────────────┐
                        │   ENTRADA (Webhook / Terminal)  │
                        │ POST /webhook/:tenantId         │
                        │ Body: {phoneNumber, message}    │
                        └──────────────┬──────────────────┘
                                       │
                                       ▼
                        ┌─────────────────────────────────┐
                        │    ExpressServer                │
                        │  (Router Multi-Tenant)          │
                        │  Extrae:                        │
                        │  - tenantId (de URL)            │
                        │  - phoneNumber (de body)        │
                        │  - message (de body)            │
                        └──────────────┬──────────────────┘
                                       │
                                       ▼
                        ┌─────────────────────────────────┐
                        │    BotController                │
                        │  processMessage(                │
                        │    tenantId,                    │
                        │    phoneNumber,                 │
                        │    message                      │
                        │  )                              │
                        └──────────────┬──────────────────┘
                                       │
                                       ▼
                        ┌─────────────────────────────────┐
                        │  HandleMessageUseCase           │
                        │  (Lógica de Negocio)            │
                        │  1. Extrae tenantId de message  │
                        │  2. Busca usuario en repo       │
                        │     WHERE tenantId = ?          │
                        │     AND phone = ?               │
                        │  3. Ejecuta caso de uso         │
                        │  4. Actualiza estado            │
                        └──────────────┬──────────────────┘
                                       │
                                       ▼
                        ┌─────────────────────────────────┐
                        │   UserRepository                │
                        │   (SQLite Blindado)             │
                        │                                 │
                        │   findByPhoneNumber(             │
                        │     tenantId,                   │
                        │     phoneNumber                 │
                        │   )                             │
                        │                                 │
                        │   SELECT * FROM users WHERE:    │
                        │   ✅ tenant_id = ?              │
                        │   ✅ phone_number = ?           │
                        └──────────────┬──────────────────┘
                                       │
                                       ▼
                        ┌─────────────────────────────────┐
                        │   SQLite Database               │
                        │   ┌───────────────────────────┐ │
                        │   │ users                     │ │
                        │   ├───────────────────────────┤ │
                        │   │ PK (tenant_id, id)  ✅    │ │
                        │   │ UX (tenant_id, phone) ✅  │ │
                        │   │ IDX tenant_id            │ │
                        │   └───────────────────────────┘ │
                        └─────────────────────────────────┘
```

---

## Aislamiento de Datos - Visualización

### Escenario: Mismo cliente, diferentes negocios

```
┌─────────────────────────────────────────────────────────────┐
│  TELÉFONO: +56912345678                                    │
│  PREGUNTA: ¿Cuántos usuarios existen con este número?      │
└─────────────────────────────────────────────────────────────┘

                    RESPUESTA: 3 usuarios

  ┌─────────────────────────────────────────────────────────┐
  │                                                         │
  │  Usuario 1                │  Usuario 2                  │
  │  ┌──────────────────┐    │  ┌──────────────────┐       │
  │  │ tenant_id: pape- │    │  │ tenant_id: ferre-│       │
  │  │            leria_01   │  │            teria_01      │
  │  │ phone: +569...  │    │  │ phone: +569...  │       │
  │  │ state: MENU      │    │  │ state: INITIAL   │       │
  │  │ created_at: ...  │    │  │ created_at: ...  │       │
  │  └──────────────────┘    │  └──────────────────┘       │
  │                          │                              │
  │  Usuario 3                                              │
  │  ┌──────────────────┐                                   │
  │  │ tenant_id: óptica│                                  │
  │  │            _02   │                                   │
  │  │ phone: +569...  │                                   │
  │  │ state: VIEWING_P│                                   │
  │  │        RODUCTS  │                                   │
  │  │ created_at: ...  │                                  │
  │  └──────────────────┘                                  │
  │                                                         │
  │  ✅ Completamente independientes                        │
  │  ✅ Diferentes estados                                  │
  │  ✅ Diferentes conversaciones                           │
  │                                                         │
  └─────────────────────────────────────────────────────────┘
```

---

## Terminal Interactiva Multi-Tenant

```
╔════════════════════════════════════════════════════════╗
║      🚀 SIMULADOR MULTI-TENANT LOCAL v2.0 🚀           ║
║               SegurITech Bot Pro                        ║
╚════════════════════════════════════════════════════════╝

📋 CONTEXTO ACTUAL:
   👥 Tenant: papeleria_01
   📱 Cliente: +56912345678

[papeleria_01|+56912345678] Tú: hola

┌─ BOT RESPONDE:
│ ¡Hola! Bienvenido a SegurITech Bot Pro. ¿Qué deseas hacer?
└─

[papeleria_01|+56912345678] Tú: /tenant ferreteria_01

✅ Tenant cambiado a: ferreteria_01
📱 Teléfono resetado a: +56912345678

[ferreteria_01|+56912345678] Tú: hola

┌─ BOT RESPONDE:
│ ¡Hola! Bienvenido a SegurITech Bot Pro. ¿Qué deseas hacer?
└─

[ferreteria_01|+56912345678] Tú: /history

┌─ 📜 HISTORIAL DE ferreteria_01:
│
│ [1] 📱 +56912345678
│     👤 Tú: hola
│     🤖 Bot: ¡Hola! Bienvenido...
│
└─

[ferreteria_01|+56912345678] Tú: exit
```

---

## Webhooks Multi-Tenant

```
┌──────────────────────────────────────────────────────────────┐
│              ENDPOINTS DISPONIBLES                           │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  📍 RECOMENDADO (Producción)                                 │
│  POST /webhook/:tenantId                                    │
│  ├─ URL:  /webhook/papeleria_01                            │
│  ├─ Body: { "phoneNumber": "...", "message": "..." }       │
│  └─ Ejemplo:                                                 │
│     curl -X POST http://localhost:3000/webhook/papeleria_01 \
│       -d '{"phoneNumber": "+56912345678", "message": "hola"}'│
│                                                              │
│  📍 LEGACY (Para compatibilidad)                             │
│  POST /webhook                                              │
│  ├─ Body: { "tenantId": "...", "phoneNumber": "...",       │
│  │           "message": "..." }                              │
│  └─ Ejemplo:                                                 │
│     curl -X POST http://localhost:3000/webhook \             │
│       -d '{"tenantId": "papeleria_01", ... }'              │
│                                                              │
│  📍 VERIFICACIÓN META                                        │
│  GET /webhook?hub.mode=subscribe&hub.verify_token=...      │
│  GET /webhook/:tenantId?hub.mode=subscribe&...              │
│                                                              │
│  📍 HEALTH CHECK                                             │
│  GET /health                                                │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## Capa de Entidades (Domain)

```
Message (Input)
├─ id: string
├─ tenantId: string           ← OBLIGATORIO
├─ from: string (phoneNumber)
├─ content: string
└─ timestamp: Date

        │
        ▼

BotResponse (Output)
├─ message: string
├─ buttons?: string[]
└─ nextState?: UserState

        │
        ▼

User (Persisted)
├─ id: string
├─ tenantId: string           ← OBLIGATORIO
├─ phoneNumber: string
├─ currentState: UserState
├─ createdAt: Date
└─ updatedAt: Date

        │
        ▼

Base de Datos
┌──────────────────────────────────┐
│ users                            │
├──────────────────────────────────┤
│ PRIMARY KEY (tenant_id, id)      │ ← Compuesta
│ UNIQUE (tenant_id, phone_number) │ ← Compuesta
│ INDEX (tenant_id)                │ ← Para búsquedas
└──────────────────────────────────┘
```

---

## Garantías de Seguridad (Capas)

```
┌─────────────────────────────────────┐
│  CAPA 1: SQL (Base de Datos)        │
├─────────────────────────────────────┤
│ ✅ PRIMARY KEY (tenant_id, id)      │
│ ✅ UNIQUE (tenant_id, phone)        │
│ ✅ WHERE tenant_id = ? obligatorio  │
│                                     │
│ Garantía: Imposible mezclar datos   │
│ Imposible acceder sin tenant        │
└──────────────────┬──────────────────┘
                   │
┌──────────────────▼──────────────────┐
│  CAPA 2: Repositorio                │
├─────────────────────────────────────┤
│ ✅ findById(tenantId, id)           │
│ ✅ findByPhone(tenantId, phone)     │
│ ✅ TODAS las queries filtraban     │
│                                     │
│ Garantía: Imposible olvidar tenant  │
│ En la firma del método              │
└──────────────────┬──────────────────┘
                   │
┌──────────────────▼──────────────────┐
│  CAPA 3: Caso de Uso                │
├─────────────────────────────────────┤
│ ✅ execute(message)                 │
│ ✅ Extrae tenantId de message       │
│ ✅ Lo pasa a todas las operaciones  │
│                                     │
│ Garantía: Lógica respeta aislamiento│
└──────────────────┬──────────────────┘
                   │
┌──────────────────▼──────────────────┐
│  CAPA 4: Controlador                │
├─────────────────────────────────────┤
│ ✅ processMessage(tenantId, phone,  │
│                  message)           │
│ ✅ Requiere tenantId EXPLÍCITAMENTE │
│                                     │
│ Garantía: Imposible procesar sin    │
│ especificar a qué cliente            │
└──────────────────┬──────────────────┘
                   │
┌──────────────────▼──────────────────┐
│  CAPA 5: Webhook (HTTP)             │
├─────────────────────────────────────┤
│ ✅ POST /webhook/:tenantId          │
│ ✅ tenantId en URL (no nullable)    │
│ ✅ Validación obligatoria           │
│                                     │
│ Garantía: Cliente define su tenant  │
│ No puede ser None/Null              │
└─────────────────────────────────────┘
```

---

## Flujo Seguro de un Mensaje

```
Cliente envía:
  POST /webhook/papeleria_01
  { "phoneNumber": "+56912345678", "message": "hola" }

              ▼

ExpressServer
  ✅ Extrae: tenantId = "papeleria_01"
  ✅ Extrae: phoneNumber = "+56912345678"
  ✅ Extrae: message = "hola"

              ▼

BotController
  ✅ Crea Message con tenantId = "papeleria_01"
  ✅ Llama: processMessage("papeleria_01", "+56912345678", "hola")

              ▼

HandleMessageUseCase
  ✅ Filtra: findByPhoneNumber("papeleria_01", "+56912345678")
  ✅ SELECT * FROM users 
     WHERE tenant_id = "papeleria_01" 
     AND phone_number = "+56912345678"

              ▼

SQLite
  ✅ Busca usuario SOLO en papeleria_01
  ✅ Garantizado: NO mezcla con ferreteria_01

              ▼

Respuesta
  ✅ Mensaje enviado al usuario correcto
  ✅ Estado actualizado en el tenant correcto
```

---

## Casos de Uso Soportados

```
ESCENARIO 1: Múltiples Clientes en un Negocio
┌────────────────────────────────────┐
│ Papelería                          │
├────────────────────────────────────┤
│ Cliente A: +56912345678 → MENU     │
│ Cliente B: +56987654321 → INITIAL  │
│ Cliente C: +56945123456 → CONFIRM  │
│ ...N clientes simultáneos          │
└────────────────────────────────────┘

ESCENARIO 2: Múltiples Negocios en Paralelo
┌────────────────────────────────────┐
│ Papelería (tenant_1)               │
│  └─ Clientes: A, B, C              │
├────────────────────────────────────┤
│ Ferretería (tenant_2)              │
│  └─ Clientes: X, Y, Z              │
├────────────────────────────────────┤
│ Óptica (tenant_3)                  │
│  └─ Clientes: M, N, O              │
└────────────────────────────────────┘

ESCENARIO 3: Mismos Clientes en Diferentes Negocios
┌────────────────────────────────────┐
│ Cliente +56912345678               │
│ ├─ en Papelería:  state = MENU     │
│ ├─ en Ferretería: state = INITIAL  │
│ └─ en Óptica:     state = ORDER    │
│                                    │
│ Usuarios COMPLETAMENTE DIFERENTES  │
└────────────────────────────────────┘
```

---

## Próximos Pasos (Roadmap)

```
✅ FASE 1: Refactorización (COMPLETADA)
   ├─ Agregado tenantId a entidades
   ├─ Blindaje de repositorio
   ├─ Terminal interactiva multi-tenant
   └─ Webhooks preparados

🔄 FASE 2: Testing (PRÓXIMA)
   ├─ Tests unitarios de aislamiento
   ├─ Testing de carga
   ├─ Validación de permeabilidad
   └─ Performance benchmarks

📊 FASE 3: Producción
   ├─ Autenticación por tenant
   ├─ Rate-limiting
   ├─ Dashboard de gestión
   └─ Auditoría y logs

🌐 FASE 4: Integración Oficial
   ├─ API Oficial WhatsApp Cloud
   ├─ Sincronización de teléfonos
   ├─ Webhook callbacks
   └─ Production deployment
```

---

**Versión**: 2.0 Multi-Tenant  
**Arquitectura**: Hexagonal (Puertos y Adaptadores) + Multi-Tenant  
**Base de Datos**: SQLite con aislamiento compuesto  
**Estado**: ✅ Listo para testing

