# 🏗️ Refactorización Multi-Tenant - SegurITech Bot Pro

## Resumen Ejecutivo

Se ha completado la refactorización del sistema de **single-tenant a multi-tenant**. El arquitectura ahora soporta múltiples negocios (inquilinos) simultáneamente con aislamiento total de datos.

### Cambios Principales

#### ✅ 1. **Refactorización del Dominio**
- Agregado `tenantId` obligatorio en las entidades clave:
  - `Message`: `tenantId: string`
  - `User`: `tenantId: string`
  - `Product`: `tenantId: string`
  - `Order`: `tenantId: string`

#### ✅ 2. **Blindaje del Repositorio SQLite**
- Tabla `users` ahora tiene:
  - **Clave primaria compuesta**: `(tenant_id, id)`
  - **Clave única compuesta**: `(tenant_id, phone_number)`
  - **Índices multi-tenant**: Para optimizar queries por tenant
  
- **TODAS las consultas** ahora filtran por `tenantId`:
  ```sql
  -- Antes (PELIGROSO):
  SELECT * FROM users WHERE id = ?
  
  -- Ahora (SEGURO):
  SELECT * FROM users WHERE tenant_id = ? AND id = ?
  ```

#### ✅ 3. **Evolución del Simulador Local (ReadlineAdapter)**
El terminal interactivo ahora soporta:

**Comandos especiales**:
- `/tenant <id>` - Cambiar el negocio actual (ej: `/tenant ferreteria_01`)
- `/phone <número>` - Cambiar el cliente simulado (ej: `/phone +56912345679`)
- `/tenants` - Listar todos los negocios utilizados
- `/history` - Ver historial de conversaciones del negocio actual
- `/help` - Mostrar ayuda
- `exit` - Salir

**Interfaz mejorada**:
```
[papeleria_01|+56912345678] Tú: hola
```
El prompt muestra el contexto actual (tenant + teléfono).

#### ✅ 4. **Preparación del Webhook (ExpressServer)**
El endpoint Express ahora soporta rutas multi-tenant:

**Endpoints disponibles**:
```
POST /webhook/:tenantId
  Body: { "phoneNumber": "...", "message": "..." }

POST /webhook
  Body: { "tenantId": "...", "phoneNumber": "...", "message": "..." }

GET /webhook/:tenantId (verificación Meta)
GET /webhook (verificación Meta)

GET /health (health check)
```

---

## 📋 Guía de Uso Rápida

### Compilación
```bash
npm install
npm run build
```

### Ejecución Local (Terminal Interactiva Multi-Tenant)
```bash
npm start
```

**Salida esperada**:
```
╔════════════════════════════════════════════════════════╗
║         🚀 SIMULADOR MULTI-TENANT LOCAL v2.0 🚀        ║
║                SegurITech Bot Pro                       ║
╚════════════════════════════════════════════════════════╝

📋 INFORMACIÓN DEL CONTEXTO:
   👥 Tenant Actual: papeleria_01
   📱 Cliente Actual: +56912345678

⌨️  COMANDOS ESPECIALES:
   /tenant <id>     - Cambiar tenant (ej: /tenant ferreteria_01)
   /phone <número>  - Cambiar número (ej: /phone +56912345679)
   /tenants         - Listar tenants utilizados
   /history         - Ver historial del tenant actual
   /help            - Mostrar esta ayuda
   exit             - Salir del simulador

💬 Escribe mensajes y presiona Enter para enviar:

[papeleria_01|+56912345678] Tú: hola
```

### Ejemplos de Flujos Multi-Tenant

#### Flujo 1: Pruebas con Papelería
```
[papeleria_01|+56912345678] Tú: hola

┌─ BOT RESPONDE:
│ ¡Hola! Bienvenido a SegurITech Bot Pro. ¿Qué deseas hacer?
└─

[papeleria_01|+56912345678] Tú: 1

┌─ BOT RESPONDE:
│ Productos disponibles:
│ 1. Seguro Básico - $10/mes
│ 2. Seguro Premium - $25/mes
│ 3. Seguro Enterprise - $50/mes
│ ¿Deseas conocer más detalles?
└─
```

#### Flujo 2: Cambiar a Ferretería (Sin resetear papelería)
```
[papeleria_01|+56912345678] Tú: /tenant ferreteria_01

✅ Tenant cambiado a: ferreteria_01
📱 Teléfono resetado a: +56912345678

[ferreteria_01|+56912345678] Tú: hola

┌─ BOT RESPONDE:
│ ¡Hola! Bienvenido a SegurITech Bot Pro. ¿Qué deseas hacer?
└─
```

#### Flujo 3: Múltiples clientes en la Ferretería
```
[ferreteria_01|+56912345678] Tú: 1
[ferreteria_01|+56912345678] Tú: /phone +56987654321

✅ Cliente cambiado a: +56987654321

[ferreteria_01|+56987654321] Tú: hola
```

#### Flujo 4: Ver historial
```
[ferreteria_01|+56987654321] Tú: /history

┌─ 📜 HISTORIAL DE ferreteria_01:
│
│ [1] 📱 +56912345678
│     👤 Tú: hola
│     🤖 Bot: ¡Hola! Bienvenido a SegurITech Bot Pro...
│
│ [2] 📱 +56912345678
│     👤 Tú: 1
│     🤖 Bot: Productos disponibles:...
│
│ [3] 📱 +56987654321
│     👤 Tú: hola
│     🤖 Bot: ¡Hola! Bienvenido a SegurITech Bot Pro...
└─
```

---

## 🔒 Seguridad & Aislamiento

### Garantías de Aislamiento

1. **Nivel Base de Datos**
   - `tenantId` es parte de la clave primaria
   - Todas las queries incluyen filtro `WHERE tenant_id = ?`
   - Imposible acceder a datos de otros tenants

2. **Nivel Aplicación**
   - `Message` contiene `tenantId` requerido
   - `BotController.processMessage()` recibe `tenantId` como primer parámetro
   - `HandleMessageUseCase` filtra por tenant desde el inicio

3. **Nivel HTTP/Webhook**
   - `tenantId` viene de la URL o body
   - Validación obligatoria
   - Logs registran tenant para auditoría

### Testing de Aislamiento

**Escenario: Papelería vs Ferretería**

```bash
# Terminal 1: Simular cliente papelería
curl -X POST http://localhost:3000/webhook/papeleria_01 \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumber": "+56912345678",
    "message": "hola"
  }'

# Terminal 2: Simular cliente ferretería
curl -X POST http://localhost:3000/webhook/ferreteria_01 \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumber": "+56912345678",
    "message": "hola"
  }'

# Resultado: Dos usuarios DIFERENTES en la base de datos
# - users(papeleria_01, +56912345678)
# - users(ferreteria_01, +56912345678)
```

---

## 📊 Estructura de Base de Datos Mejorada

### Tabla: users (NEW SCHEMA)

```sql
CREATE TABLE users (
  id TEXT,                          -- ID único del usuario
  tenant_id TEXT NOT NULL,          -- Identificador del negocio
  phone_number TEXT NOT NULL,       -- Teléfono del cliente
  current_state TEXT,               -- Estado de la conversación
  created_at DATETIME,              -- Timestamp de creación
  updated_at DATETIME,              -- Timestamp de actualización
  PRIMARY KEY (tenant_id, id),      -- Clave primaria COMPUESTA
  UNIQUE (tenant_id, phone_number)  -- Clave única COMPUESTA
);

-- Índices para optimizar queries
CREATE INDEX idx_users_tenant_id ON users(tenant_id);
CREATE INDEX idx_users_tenant_phone ON users(tenant_id, phone_number);
```

### Ejemplos de Datos

```
id                              | tenant_id        | phone_number     | current_state | created_at
1711000000000-abc12345          | papeleria_01     | +56912345678     | menu          | 2024-03-21...
1711000010000-def67890          | papeleria_01     | +56912345679     | initial       | 2024-03-21...
1711000020000-ghi11111          | ferreteria_01    | +56912345678     | viewing_...   | 2024-03-21...
```

**Observación clave**: El mismo número `+56912345678` puede existir en `papeleria_01` y `ferreteria_01` como usuarios **COMPLETAMENTE DIFERENTES**.

---

## 🚀 Integración con API Oficial WhatsApp Cloud (Próximo Paso)

Cuando conectes la API oficial de WhatsApp:

### 1. Webhook Meta → Tu API
```
Meta llama a:
POST https://tudominio.com/webhook/ferreteria_01

Body: {
  "entry": [{
    "changes": [{
      "value": {
        "messages": [{
          "from": "56912345678",
          "text": { "body": "Hola" }
        }]
      }
    }]
  }]
}
```

### 2. Tu API → BotController
```typescript
// En ExpressServer.ts (ya preparado):
this.app.post('/webhook/:tenantId', async (req, res) => {
  const tenantId = req.params.tenantId;  // ← De la URL
  const phoneNumber = req.body.entry[0].changes[0].value.messages[0].from;
  const message = req.body.entry[0].changes[0].value.messages[0].text.body;

  const response = await processMessage(tenantId, phoneNumber, message);
});
```

### 3. Configuración en Meta
```
Webhook URL: https://tudominio.com/webhook/{ID_DEL_NEGOCIO}
```

---

## 📝 Cambios Detallados por Archivo

### `src/domain/entities/index.ts`
- ✅ `Message.tenantId` agregado
- ✅ `User.tenantId` agregado
- ✅ `Product.tenantId` agregado
- ✅ `Order.tenantId` agregado

### `src/domain/ports/index.ts`
- ✅ `UserRepository.findById(tenantId, id)`
- ✅ `UserRepository.findByPhoneNumber(tenantId, phoneNumber)`
- ✅ `ProductRepository.findAll(tenantId)`
- ✅ `ProductRepository.findById(tenantId, id)`
- ✅ `OrderRepository.findByUserId(tenantId, userId)`

### `src/infrastructure/repositories/SqliteUserRepository.ts`
- ✅ Tabla `users` con clave primaria compuesta `(tenant_id, id)`
- ✅ Índices multi-tenant
- ✅ Filtro `WHERE tenant_id = ?` en TODAS las queries
- ✅ `save()` incluye `tenantId`
- ✅ `findById()` recibe `tenantId`
- ✅ `findByPhoneNumber()` recibe `tenantId`
- ✅ `update()` filtra por `tenantId`

### `src/domain/use-cases/HandleMessageUseCase.ts`
- ✅ `execute()` extrae `tenantId` de `message.tenantId`
- ✅ Pasa `tenantId` a todas las llamadas de repositorio
- ✅ Crea usuarios con `tenantId` obligatorio

### `src/app/controllers/BotController.ts`
- ✅ `processMessage(tenantId, phoneNumber, text)` - firma actualizada
- ✅ Crea `Message` con `tenantId`
- ✅ Pasa `tenantId` al caso de uso

### `src/infrastructure/adapters/ReadlineAdapter.ts`
- ✅ Estado multi-tenant: `currentTenantId`, `currentPhoneNumber`
- ✅ Historial de conversaciones por tenant
- ✅ Comandos: `/tenant`, `/phone`, `/tenants`, `/history`, `/help`
- ✅ Prompt mejorado: `[tenant|phone] Tú:`

### `src/infrastructure/server/ExpressServer.ts`
- ✅ Endpoint: `POST /webhook/:tenantId`
- ✅ Endpoint: `POST /webhook` (legacy, con tenantId en body)
- ✅ Verificación: `GET /webhook/:tenantId` (Meta)
- ✅ Logs con contexto de tenant

### `src/Bootstrap.ts`
- ✅ Actualiza callbacks para pasar `tenantId`

---

## 🧪 Testing Recomendado

### Test 1: Aislamiento de Datos
```bash
# Crear usuarios en papeleria_01
curl -X POST http://localhost:3000/webhook/papeleria_01 \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": "+56912345678", "message": "hola"}'

# Crear usuario con mismo número en ferreteria_01
curl -X POST http://localhost:3000/webhook/ferreteria_01 \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": "+56912345678", "message": "hola"}'

# ✅ Esperado: Dos usuarios diferentes en base de datos
```

### Test 2: Persistencia por Tenant
```bash
# Usuario papeleria avanza a MENU
curl -X POST http://localhost:3000/webhook/papeleria_01 \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": "+56912345678", "message": "1"}'

# Usuario ferreteria aún está en INITIAL
curl -X POST http://localhost:3000/webhook/ferreteria_01 \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": "+56912345678", "message": "1"}'

# ✅ Esperado: Respuestas diferentes (estados independientes)
```

### Test 3: Terminal Interactiva Multi-Tenant
```bash
npm start

# Luego:
hola                    # papeleria_01, +56912345678
/tenant ferreteria_01   # Cambiar tenant
hola                    # ferreteria_01, +56912345678
/phone +56987654321     # Cambiar cliente
hola                    # ferreteria_01, +56987654321
/history                # Ver conversaciones de ferreteria_01
```

---

## 🔄 Plan de Despliegue

### Fase 1: Validación Local ✅
- [x] Refactorizar dominio
- [x] Blindar repositorio
- [x] Actualizar terminal
- [x] Preparar webhook

### Fase 2: Testing (Ahora)
- [ ] Ejecutar `npm start`
- [ ] Probar flujos multi-tenant
- [ ] Validar aislamiento

### Fase 3: Pre-Producción
- [ ] Migrar base de datos (agregar `tenant_id`)
- [ ] Actualizar secrets con tenantIds
- [ ] Validar en staging

### Fase 4: Producción
- [ ] Desplegar código
- [ ] Conectar a API oficial WhatsApp
- [ ] Configurar routing por tenant

---

## ❓ Preguntas Frecuentes

**P: ¿Puedo aún ejecutar en single-tenant?**
R: No necesariamente. El sistema es multi-tenant por defecto. Simplemente usa un único `tenantId` (ej: `"default_business"`).

**P: ¿Cómo migro datos existentes?**
R: Ejecuta esta query:
```sql
UPDATE users SET tenant_id = 'existing_business' WHERE tenant_id IS NULL;
ALTER TABLE users MODIFY tenant_id TEXT NOT NULL;
```

**P: ¿Qué pasa si uso el mismo `tenantId` y `phoneNumber`?**
R: El usuario será el mismo (sin duplicación). La clave única lo previene.

**P: ¿Cómo gestiono múltiples `tenantIds` en la API?**
R: Usa un mapping en tu configuración:
```typescript
const tenantConfig = {
  'ferreteria_01': { name: 'Ferretería El Martillo', ... },
  'papeleria_01': { name: 'Papelería La Pluma', ... },
};
```

---

## 📞 Soporte

Ante cualquier duda, contacta al equipo de arquitectura.

**Versión**: 2.0 Multi-Tenant  
**Fecha**: Marzo 2024  
**Estado**: ✅ Listo para testing

