# 🧪 Test Suite Multi-Tenant - Documentación Completa

> **Suite de Tests Automático** que valida el aislamiento de datos en una arquitectura multi-tenant de SegurITech Bot Pro

**Versión:** 1.0  
**Fecha:** 2026-04-25  
**Status:** ✅ 100% Funcional

---

## 📋 Índice

1. [Descripción General](#descripción-general)
2. [Instalación & Configuración](#instalación--configuración)
3. [Comandos de Ejecución](#comandos-de-ejecución)
4. [Arquitectura de Tests](#arquitectura-de-tests)
5. [Tests Realizados](#tests-realizados)
6. [Salida Visual en Terminal](#salida-visual-en-terminal)
7. [FAQ](#faq)

---

## 📖 Descripción General

### ¿Qué es esta suite?

Un conjunto completo de tests de integración que simula ser **Meta (WhatsApp)** enviando mensajes a tu servidor para validar que:

✅ **El mismo número de teléfono** en diferentes tenants crea usuarios **100% independientes**  
✅ **Cada tenant** mantiene su propio contexto conversacional sin mezcla de datos  
✅ **No hay fuga**, duplicación o corrupción de datos entre tenants  
✅ **La arquitectura multi-tenant funciona** de punta a punta

### Por qué es importante

En un SaaS B2B multi-tenant, la mayor vulnerabilidad es que un cliente vea datos de otro. Esta suite garantiza que **NO pasa**.

---

## 🔧 Instalación & Configuración

### Paso 1: Dependencias ya instaladas ✅

Las siguientes dependencias ya están en `package.json`:

```json
{
  "devDependencies": {
    "jest": "^29.x",
    "ts-jest": "^latest",
    "@types/jest": "^latest",
    "supertest": "^latest",
    "@types/supertest": "^latest"
  }
}
```

**Si no las tienes, ejecuta:**

```bash
npm install --save-dev jest ts-jest @types/jest supertest @types/supertest
```

### Paso 2: Archivos creados

```
src/tests/
├── integration/
│   └── multiTenantFlow.test.ts      ← Tests principales
└── utils/
    ├── testDatabase.ts              ← BD en memoria para testing
    └── testVisuals.ts               ← Visualización hermosa en terminal
```

### Paso 3: Configuración Jest

El archivo `jest.config.js` ya está configurado para:
- ✅ Soporte de TypeScript con `ts-jest`
- ✅ Path aliases (`@/` → `src/`)
- ✅ Detectar handles abiertos
- ✅ Verbose output

---

## ⚡ Comandos de Ejecución

### **1. Ejecutar SOLO los tests multi-tenant (RECOMENDADO)**

```bash
npm run test:multiTenant
```

**Output esperado:**
```
PASS src/tests/integration/multiTenantFlow.test.ts
  🏢 Multi-Tenant Isolation Test Suite
    ✅ TEST 1: Mismo teléfono, tenants diferentes = Usuarios independientes
    ✅ TEST 2: Misma conversación, estados divergentes por tenant
    ✅ TEST 3: No hay fuga ni mezcla de datos entre tenants

Test Suites: 1 passed, 1 total
Tests:       3 passed, 3 total
```

---

### **2. Ejecutar TODOS los tests**

```bash
npm run test
```

Ejecuta todos los tests del proyecto (si hay más tests) con manejo automático de handles.

---

### **3. Modo Watch (Desarrollo)**

```bash
npm run test:watch
```

Re-ejecuta los tests automáticamente cuando cambias archivos.

---

### **4. Con Coverage (Cobertura)**

```bash
npm run test:coverage
```

Genera un reporte de cobertura de código.

---

### **5. Solo tests de integración**

```bash
npm run test:integration
```

Ejecuta solo tests de la carpeta `integration/`.

---

## 🏗️ Arquitectura de Tests

### Estructura de archivos

```typescript
multiTenantFlow.test.ts
├── beforeAll()
│   ├── ✓ Inicializar BD en memoria (SQLite :memory:)
│   ├── ✓ Crear inyección de dependencias
│   └── ✓ Levantar servidor Express
├── TEST 1: Aislamiento de Usuarios
├── TEST 2: Estados Divergentes
├── TEST 3: Integridad de Datos
└── afterAll()
    ├── ✓ Cerrar servidor
    └── ✓ Limpiar BD
```

### Base de datos de pruebas

**Archivo:** `testDatabase.ts`

- Implementa `UserRepository` interface
- Usa SQLite **`:memory:`** (en RAM, no en disco)
- Se limpia automáticamente después de cada test
- Garantiza aislamiento: cada test usa su propia conexión

```typescript
const repo = new InMemoryTestRepository();
await repo.initialize();  // BD en memoria
// ... tests ...
await repo.cleanup();     // Cierra conexión
```

### Visualización en terminal

**Archivo:** `testVisuals.ts`

Proporciona funciones para imprimir tests de forma **hermosa y clara**:

```typescript
printTestHeader('TEST TITLE', 'Description')
printScenario(1, 'Scenario 1', 'papeleria_01', '+527471234567', 'hola')
printTestResult('Test name', true, 'Details')
printIsolationCheck('+527...', 'tenant1', 'state1', 'tenant2', 'state2', true)
printTable('DB State', [{ tenant: ..., phone: ..., state: ... }])
printTestSummary(3, 3, 0, 250)  // Total, passed, failed, duration
```

---

## 🧪 Tests Realizados

### TEST 1: Aislamiento de Usuarios

**Objetivo:** Verificar que el **mismo número de teléfono** en diferentes tenants crea usuarios **diferentes**

**Escenario:**
1. Usuario `+527471234567` envía "hola" a `papeleria_01`
2. Mismo usuario `+527471234567` envía "hola" a `ferreteria_01`

**Validaciones:**
- ✅ Ambos usuarios existen en BD
- ✅ Tienen IDs únicos y diferentes
- ✅ Ambos están en estado `MENU` (después del saludo)
- ✅ Los IDs de tenant son correctos

**Resultado visual:**
```
════════════════════════════════════════════════════════════════════════════════
║ ★ TEST 1: Aislamiento de Usuarios por Tenant
║ Verificar que el mismo número crea usuarios independientes en cada tenant
════════════════════════════════════════════════════════════════════════════════

● Escenario 1: Mensaje en papeleria_01
   Tenant:       papeleria_01
   Teléfono:     +527471234567
   Mensaje:      "hola"

✅  PASS Webhook recibido correctamente
   ► Status 200

✅  Verificación de Aislamiento Multi-Tenant
   Mismo número: +527471234567
   papeleria_01: estado = "menu"
   ferreteria_01: estado = "menu"
   ✔ Estados completamente aislados (SIN mezcla de datos)

📊 Datos completos en BD
tenant_id     │ id                 │ phone_number  │ current_state
──────────────┼────────────────────┼───────────────┼──────────────
papeleria_01  │ 1777179231061-c... │ +527471234567 │ menu
ferreteria_01 │ 1777179231082-6... │ +527471234567 │ menu
```

---

### TEST 2: Estados Divergentes

**Objetivo:** Verificar que cada usuario progresa a su **propio estado** en cada tenant

**Escenario:**
1. Usuario `+527471234568` en `papeleria_02` → Saluda + elige opción "1"
2. Usuario `+527471234568` en `ferreteria_02` → Solo saluda

**Validaciones:**
- ✅ Usuario en papelería está en estado `VIEWING_PRODUCTS`
- ✅ Usuario en ferretería está en estado `MENU`
- ✅ Estados divergentes sin mezcla

**Resultado visual:**
```
✅  Verificación de Aislamiento Multi-Tenant
   Mismo número: +527471234568
   papeleria_02: estado = "viewing_products"
   ferreteria_02: estado = "menu"
   ✔ Estados completamente aislados (SIN mezcla de datos)
```

---

### TEST 3: Integridad de Datos

**Objetivo:** Validar que **NO hay fuga, duplicación ni corrupción** de datos

**Escenario:**
- 2 tenants (`tienda_a_001`, `tienda_b_001`)
- 2 usuarios por tenant
- 4 combinaciones únicas: (tenant, teléfono)

**Validaciones:**
- ✅ Base de datos contiene todos los registros
- ✅ No hay duplicados
- ✅ Cada tenant solo ve sus usuarios
- ✅ Integridad confirmada

**Resultado visual:**
```
📊 Estado final de BD (TEST 3)
tenant       │ phone          │ state  │ created
─────────────┼────────────────┼────────┼──────────────
tienda_a_001 │ +527471234569  │ menu   │ 10:54:15 p.m.
tienda_a_001 │ +527471234570  │ menu   │ 10:54:15 p.m.
tienda_b_001 │ +527471234569  │ menu   │ 10:54:15 p.m.
tienda_b_001 │ +527471234570  │ menu   │ 10:54:15 p.m.

✅  PASS Integridad multi-tenant confirmada
   ► Nada de fugas o mezcla de datos
```

---

## 🎨 Salida Visual en Terminal

### Encabezados visuales

```
════════════════════════════════════════════════════════════════════════════════
║ ★ Multi-Tenant Isolation Test Suite
║ Preparando base de datos en memoria y servidor
════════════════════════════════════════════════════════════════════════════════
```

### Escenarios

```
● Escenario 1: Mensaje en papeleria_01
   Tenant:       papeleria_01
   Teléfono:     +527471234567
   Mensaje:      "hola"
```

### Resultados

```
✅  PASS Webhook recibido correctamente
   ► Status 200

❌  FAIL Usuario no encontrado
   ► Expected 1 but got 0
```

### Resumen final

```
════════════════════════════════════════════════════════════════════════════════
✅  RESUMEN DE PRUEBAS
════════════════════════════════════════════════════════════════════════════════
   Total:      3
   Pasadas:     3
   Fallidas:     0
   Éxito:      100.00%
   Tiempo:      250ms
════════════════════════════════════════════════════════════════════════════════
```

### Tablas de datos

```
📊 Datos completos en BD
tenant_id     │ id                 │ phone_number  │ current_state
──────────────┼────────────────────┼───────────────┼──────────────
papeleria_01  │ 1777179231061-c... │ +527471234567 │ menu
ferreteria_01 │ 1777179231082-6... │ +527471234567 │ menu
```

---

## 🎯 Cada test hace:

### Antes de empezar (beforeAll)
```typescript
✓ Crear repositorio SQLite en memoria
✓ Crear contenedor de inyección de dependencias
✓ Crear servidor Express
✓ Montar rutas webhook
✓ Iniciar servidor en puerto aleatorio
```

### Durante cada test
```typescript
✓ Hacer POST a /webhook/:tenantId con teléfono y mensaje
✓ Validar respuesta 200
✓ Consultar base de datos
✓ Verificar IDs, estados, aislamiento
✓ Imprimir visualización hermosa
```

### Después (afterAll)
```typescript
✓ Cerrar servidor
✓ Limpiar/cerrar base de datos
✓ Liberar puertos y conexiones
```

---

## ❓ FAQ

### P: ¿Dónde está el código del test?

```
C:\Users\micho\IdeaProjects\seguritech-bot-proprueba\
src\tests\integration\multiTenantFlow.test.ts
```

### P: ¿Cómo agregar más tests?

Crea nuevos archivos `.test.ts` en `src/tests/integration/` y ejecuta:

```bash
npm run test
```

### P: ¿Los tests limpian la BD automáticamente?

✅ **Sí**, la BD en memoria (`:memory:`) se limpia cuando se cierra en `afterAll()`.

### P: ¿Puedo ver el SQL ejecutado?

En `testDatabase.ts`, descomentar:

```typescript
this.db.configure('busyTimeout', 5000);
// Agregar logger
```

### P: ¿Cómo debuguear un test?

Ejecuta con Node debugger:

```bash
node --inspect-brk node_modules/.bin/jest --runInBand
```

Luego abre `chrome://inspect` en Chrome.

### P: ¿Qué pasa si los tests fallan?

Jest mostrará:
- ❌ Cuál test falló
- 📍 En qué línea
- 🔍 Qué se esperaba vs. qué se recibió
- 🐛 Stack trace

### P: ¿Es seguro correr esto en producción?

✅ **NO**, solo usa en **desarrollo/CI**. En producción:
- Usa BD real (PostgreSQL, MySQL)
- No uses `:memory:` 
- Configura timeouts apropiados

### P: ¿Cómo medir cobertura?

```bash
npm run test:coverage
```

Abre `coverage/lcov-report/index.html`

---

## 📚 Más Info

**Documentación del Proyecto:**
- README.md - Descripción general
- MASTER.md - Todo en uno

**Configuración:**
- jest.config.js - Configuración Jest
- tsconfig.json - Configuración TypeScript

---

## ✅ Checklist de Validación

- [x] Tests compilan sin errores
- [x] BD en memoria funciona
- [x] Aislamiento multi-tenant validado
- [x] Estados divergentes confirmados
- [x] Integridad de datos verificada
- [x] Visualización en terminal funciona
- [x] Todos los tests pasan (3/3)
- [x] Documentación completa

---

## 🚀 Próximos Pasos

1. **Ejecutar regularmente:**
   ```bash
   npm run test:multiTenant
   ```

2. **Agregar al CI/CD:**
   ```bash
   # En tu pipeline (GitHub Actions, GitLab CI, etc.)
   npm run test
   ```

3. **Expandir tests:**
   - Agregar tests de carga (load testing)
   - Tests de concurrencia
   - Tests de seguridad

4. **Integrar en pre-commit:**
   ```bash
   # Con husky
   npm install husky --save-dev
   npx husky add .husky/pre-commit "npm run test:multiTenant"
   ```

---

**¡Tu suite de tests multi-tenant está 100% lista! 🎉**

Para preguntas: Revisa FAQ o ejecuta `npm run test:multiTenant --verbose`

