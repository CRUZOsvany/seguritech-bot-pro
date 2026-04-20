# 🧪 GUÍA COMPLETA: TESTS DE PERFORMANCE Y DEVSECOPS

## 📋 ARCHIVO GENERADO

**Ubicación**: `src/PerformanceSecurityTest.ts`

**Propósito**: Verificar que NO hay ReDoS ni bloqueos en Event Loop después de la actualización de dependencias

**Verificaciones incluidas**: 
- ✅ Respuesta a saludo simple (< 100ms)
- ✅ Respuesta a menú (< 150ms)
- ✅ Secuencia rápida de 5 mensajes
- ✅ Bajo carga (10 usuarios simultáneos)
- ✅ Validación de Regex (sin ReDoS)
- ✅ Event Loop Health (detección de bloqueos)

---

## 🚀 CÓMO USAR LOS TESTS

### Paso 1: Actualizar package.json con scripts de test

Edita tu `package.json` y agrega estos scripts:

```json
{
  "scripts": {
    "dev": "ts-node src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "start:pm2": "pm2 start ecosystem.config.js",
    "stop:pm2": "pm2 stop all",
    "logs": "pm2 logs",
    "lint": "eslint src --ext .ts",
    "type-check": "tsc --noEmit",
    "test:performance": "ts-node -O '{\"module\":\"commonjs\"}' src/PerformanceSecurityTest.ts",
    "test:performance:watch": "nodemon --exec ts-node src/PerformanceSecurityTest.ts",
    "test:security": "npm audit && npm run test:performance"
  }
}
```

---

### Paso 2: Instalar dependencias opcionales para testing

```powershell
# Opcionales para mejor experiencia en testing
npm install --save-dev nodemon @types/jest jest ts-jest
```

---

### Paso 3: Ejecutar los tests

#### Opción A: Test de performance simple
```powershell
npm run test:performance
```

#### Opción B: Test en modo watch (con auto-reload)
```powershell
npm run test:performance:watch
```

#### Opción C: Test de seguridad completo (audit + performance)
```powershell
npm run test:security
```

---

## 📊 INTERPRETACIÓN DE RESULTADOS

### Reporte esperado (EXITOSO):

```
🔐 Iniciando Tests de Performance y DevSecOps...
⏱️  Máximo permitido por test: 2 segundos
🛡️  Validando: NO hay ReDoS bloqueando Event Loop

📝 Test 1: ✅ Completado en 45.23ms
📝 Test 2: ✅ Completado en 32.15ms
📝 Test 3: ✅ 5 mensajes en 156.78ms
📝 Test 4: ✅ Completado en 287.34ms
📝 Test 5: ✅ Completado en 89.45ms
📝 Test 6: ✅ Event Loop OK - Max lag: 2.15ms

======================================================================
📊 REPORTE FINAL DE PERFORMANCE Y DEVSECOPS
======================================================================

✅ Tests ejecutados: 6/6
❌ Tests fallidos: 0

⏱️  Tiempo promedio: 115.49ms
⏱️  Tiempo máximo: 287.34ms

✅ Event Loop SALUDABLE - Sin signos de ReDoS

🔐 CONCLUSIÓN:
✅ SEGURO: NO hay ReDoS. Bot es seguro en producción.
======================================================================
```

### Qué significa cada métrica:

| Métrica | Esperado | Problema |
|---------|----------|----------|
| Tiempo por test | < 2000ms | > 2000ms = ReDoS probable |
| Event Loop lag | < 100ms | > 100ms = ReDoS probable |
| Tests fallidos | 0 | > 0 = Revisar configuración |
| Conclusión | SEGURO | INSEGURO = Investigar |

---

## 🔍 DETALLES DE CADA TEST

### TEST 1: Respuesta a Saludo Simple
```
Qué prueba: Bot responde a "Hola" en < 100ms
Por qué: Valida que no hay regex complejas bloqueando
Resultado esperado: 20-50ms
```

### TEST 2: Respuesta a Opción de Menú
```
Qué prueba: Bot responde a "1" (opción de menú)
Por qué: Valida búsqueda de opciones
Resultado esperado: 15-40ms
```

### TEST 3: Secuencia Rápida de Mensajes
```
Qué prueba: 5 mensajes consecutivos sin delay
Por qué: Simula usuario escribiendo rápido
Resultado esperado: 80-150ms total
```

### TEST 4: Bajo Carga (10 usuarios)
```
Qué prueba: 10 usuarios simultáneos
Por qué: Valida concurrencia y no hay race conditions
Resultado esperado: 150-300ms
```

### TEST 5: Validación de Regex
```
Qué prueba: Todas las regex contra múltiples strings
Por qué: Detecta patrones ReDoS específicos
Resultado esperado: 50-100ms
```

### TEST 6: Event Loop Health
```
Qué prueba: Mide lag del Event Loop con setImmediate
Por qué: Detecta bloqueos en el event loop (ReDoS causa esto)
Resultado esperado: lag < 100ms
```

---

## 🚨 SI ALGO FALLA

### Error: "Event Loop bloqueado"
```
Causa: Expresión regular causando ReDoS
Solución:
1. Ejecutar: npm audit
2. Ver qué causa el ReDoS
3. Actualizar dependencia específica
4. Reintentar test
```

### Error: "Test excede 2 segundos"
```
Causa: Bot tomando mucho tiempo en responder
Solución:
1. Revisar messageHandler.ts
2. Buscar regex complejas
3. Optimizar búsquedas
4. Recompilar y reintentar
```

### Error: "Regex lenta detectada"
```
Causa: Patrón específico causa ReDoS
Solución:
1. Revisar handlers/messageHandler.ts
2. Reemplazar patrón por uno más seguro
3. Usar atomic groups si es posible
4. Reintentar
```

---

## 📈 INTERPRETACIÓN DETALLADA

### Gráfico de performance normal:
```
Tiempo (ms)
300 |
    |                               ■ (Test 4: 10 usuarios)
250 |
    |
200 |
    |
150 |     ■ (Test 3: 5 mensajes)
    |
100 | ■           ■           ■
    | (1)         (2)         (5)
 50 |
    |
  0 |_______________________________________________
    Test1 Test2 Test3 Test4 Test5 Test6
```

### Rojo (Peligro):
```
Tiempo (ms)
5000 | ■
     | (Test bloqueado por ReDoS)
2500 |
     |
  0 |_______
    
Conclusión: ❌ INSEGURO
```

---

## 🔄 FLUJO DE VALIDACIÓN DEVSECOPS

```
npm audit
    ↓
Si hay ReDoS ↓
    ↓
Actualizar overrides en package.json
    ↓
npm cache clean --force
    ↓
npm install
    ↓
npm audit (nuevamente)
    ↓
Si OK ↓
    ↓
npm run test:performance
    ↓
Si todos pasan < 2s ↓
    ↓
✅ SEGURO PARA PRODUCCIÓN
```

---

## 💡 CASOS DE USO

### Caso 1: Post-Instalación de Dependencias
```powershell
npm install
npm run test:performance
# Valida que no hay ReDoS post-actualización
```

### Caso 2: Pre-Commit Hook
```powershell
# .git/hooks/pre-commit
npm run test:security
# Si falla, bloquea el commit
```

### Caso 3: CI/CD Pipeline
```yaml
# .github/workflows/security.yml
- name: Performance & Security Test
  run: npm run test:security
```

### Caso 4: Desarrollo Continuo
```powershell
npm run test:performance:watch
# Ejecutar en otra terminal mientras desarrollas
```

---

## 📚 INTEGRACIÓN CON CI/CD

### GitHub Actions:
```yaml
name: Security & Performance

on: [push, pull_request]

jobs:
  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '24'
      
      - name: Install dependencies
        run: npm install
      
      - name: Run security audit
        run: npm audit --audit-level=high
      
      - name: Run performance tests
        run: npm run test:performance
```

### GitLab CI:
```yaml
security_and_performance:
  image: node:24
  script:
    - npm install
    - npm audit --audit-level=high
    - npm run test:performance
  only:
    - merge_requests
```

---

## 🎯 CHECKLIST DEVSECOPS

```
Pre-Actualización:
[ ] Ejecuté: npm audit
[ ] Documenté vulnerabilidades existentes
[ ] Hice backup del package-lock.json

Actualización:
[ ] Actualicé package.json con overrides
[ ] Limpié caché: npm cache clean --force
[ ] Eliminé node_modules
[ ] Ejecuté: npm install

Post-Actualización:
[ ] Ejecuté: npm audit (sin ReDoS)
[ ] Ejecuté: npm run lint (sin errores)
[ ] Ejecuté: npm run type-check (OK)
[ ] Ejecuté: npm run test:performance (6/6 PASS)
[ ] Verifiqué: Event Loop Health (OK)

Producción:
[ ] Commitié cambios
[ ] Pusheé a GitHub
[ ] CI/CD pipeline pasó
[ ] Deployé a producción
[ ] Monitoreé en producción (sin alertas)
```

---

## 📊 MÉTRICAS CLAVE

### Health Check:
- Event Loop lag: DEBE ser < 100ms
- Respuesta bot: DEBE ser < 2000ms
- Tests fallidos: DEBE ser 0
- ReDoS detectados: DEBE ser 0

### Umbrales de alerta:
- Event Loop lag > 50ms: ⚠️ Warning
- Event Loop lag > 100ms: 🔴 Critical
- Test > 1000ms: ⚠️ Warning
- Test > 2000ms: 🔴 Critical

---

## 🔐 CONCLUSIÓN

Este test suite te asegura que:

✅ **NO hay ReDoS** bloqueando tu Event Loop  
✅ **Respuestas rápidas** del bot (< 2s)  
✅ **Bajo carga funciona** (10 usuarios simultáneos)  
✅ **Regex son seguras** (sin patrones peligrosos)  
✅ **Event Loop saludable** (sin bloqueos)  
✅ **Listo para producción** (validado)  

---

## 🚀 PRÓXIMOS PASOS

1. Ejecuta: `npm run test:performance`
2. Verifica que todos los tests pasen
3. Commitea los cambios
4. Pushea a GitHub
5. ¡Listo! 🎉

---

**Recuerda**: Ejecuta estos tests después de cualquier actualización de dependencias.

