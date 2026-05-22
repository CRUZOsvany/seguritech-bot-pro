# 🚀 Test Suite Multi-Tenant - Quick Start (2 minutos)

## ⚡ TL;DR

```bash
# 1. Compilar
npm run build

# 2. Ejecutar tests
npm run test:multiTenant
```

**Listo.** ✅

---

## 📊 Qué esperar

```
PASS src/tests/integration/multiTenantFlow.test.ts
  🏢 Multi-Tenant Isolation Test Suite
    ✅ TEST 1: Mismo teléfono, tenants diferentes = Usuarios independientes (104 ms)
    ✅ TEST 2: Misma conversación, estados divergentes por tenant (40 ms)
    ✅ TEST 3: No hay fuga ni mezcla de datos entre tenants (67 ms)

Test Suites: 1 passed, 1 total
Tests:       3 passed, 3 total
Time:        1.746 s
```

---

## 🎯 ¿Qué validan estos tests?

| Test | Qué valida |
|------|-----------|
| **TEST 1** | Mismo número `+527471234567` en `papeleria_01` y `ferreteria_01` = **usuarios diferentes** ✅ |
| **TEST 2** | Cada usuario tiene su **propio estado** en cada tenant (divergente/independiente) ✅ |
| **TEST 3** | **No hay fuga, duplicación ni mezcla** de datos entre tenants ✅ |

---

## 📝 Otras opciones

```bash
# Ejecutar todos los tests
npm run test

# Watch mode (re-ejecuta en cada cambio)
npm run test:watch

# Con coverage
npm run test:coverage

# Solo integración
npm run test:integration
```

---

## 📚 Documentación completa

Lee el archivo completo: [TEST_SUITE_DOCUMENTATION.md](./TEST_SUITE_DOCUMENTATION.md)

---

## ❓ Problemas?

### Tests no compilan
```bash
npm run build
# Si hay errores, verifica tsconfig.json
```

### Tests pasan pero ves warnings
```
ts-jest[ts-jest-transformer] (WARN) Define ts-jest config under globals is deprecated.
```
→ Esto es **normal**, Jest aún lo soporta.

### No puede eliminar BD
```bash
# Asegúrate de no tener otra instancia de node abierta
npm run test:multiTenant
```

---

## ✅ Checklist

- [x] Instalé dependencias: `npm install --save-dev jest ts-jest @types/jest supertest @types/supertest`
- [x] Compilé el proyecto: `npm run build`
- [x] Ejecuté los tests: `npm run test:multiTenant`
- [x] Todos los tests pasaron ✅

---

**¡Listo! Tu suite de tests está operativa.** 🎉

