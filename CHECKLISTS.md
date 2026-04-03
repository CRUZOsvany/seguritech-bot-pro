# CHECKLISTS DE DESARROLLO

## ✅ Pre-Desarrollo Checklist

Antes de empezar a contribuir:

- [ ] He leído README.md
- [ ] He leído ARCHITECTURE.md
- [ ] Entiendo la arquitectura hexagonal
- [ ] Tengo Node.js >= 18.0.0 instalado
- [ ] Tengo npm o yarn instalado
- [ ] Tengo un editor con soporte TypeScript (VSCode, IntelliJ, etc)
- [ ] He clonado el repositorio
- [ ] He ejecutado `npm install`
- [ ] He ejecutado `npm run dev` y funciona
- [ ] Entiendo los principios SOLID
- [ ] Entiendo Clean Code

**Tiempo estimado:** 45 minutos

---

## ✅ Feature Development Checklist

Cuando estés desarrollando una nueva funcionalidad:

### Planificación
- [ ] He creado o actualizado un GitHub issue
- [ ] He documentado el caso de uso
- [ ] He identificado qué capas afecta (dominio, app, infraestructura)
- [ ] He diseñado los puertos necesarios

### Dominio
- [ ] He creado/actualizado entidades si es necesario
- [ ] He creado/actualizado puertos (interfaces)
- [ ] He creado el caso de uso
- [ ] El dominio NO tiene dependencias externas
- [ ] El dominio es testeable

### Infraestructura
- [ ] He creado/actualizado adaptadores
- [ ] He creado/actualizado repositorios
- [ ] Implemento correctamente los puertos
- [ ] Los adaptadores NO tienen lógica de negocio

### Aplicación
- [ ] He actualizado BotController si es necesario
- [ ] He actualizado ApplicationContainer
- [ ] He inyectado correctamente las dependencias
- [ ] La orquestación es clara

### Código
- [ ] TypeScript compila sin errores: `npm run type-check`
- [ ] ESLint pasa: `npm run lint`
- [ ] Sin `any` types
- [ ] Sin `console.log` (usar logger)
- [ ] Nombres claros y descriptivos
- [ ] Funciones pequeñas (< 20 líneas)
- [ ] Sin código duplicado (DRY)
- [ ] Comentarios en lógica compleja

### Compilación
- [ ] `npm run build` funciona
- [ ] No hay warnings

### Documentación
- [ ] He actualizado README.md si es relevante
- [ ] He actualizado ARCHITECTURE.md si cambia estructura
- [ ] He agregado ejemplos en EXAMPLES.ts si es complejo
- [ ] He documentado en comentarios JSDoc

### Testing Manual
- [ ] He probado la funcionalidad manualmente
- [ ] He probado casos edge (errores, valores inválidos)
- [ ] He probado con múltiples usuarios
- [ ] El bot responde correctamente

### Git
- [ ] Commits con mensajes claros
- [ ] Commits atómicos (un cambio por commit)
- [ ] Sin archivos no necesarios (node_modules, dist, .env)
- [ ] .gitignore configurado correctamente

### PR
- [ ] Descripción clara del PR
- [ ] Enlaza el issue relacionado
- [ ] Explica QQQUÉ cambia y POR QUÉ
- [ ] Screenshots si hay cambios visuales

**Tiempo estimado:** Depende de la complejidad

---

## ✅ Code Review Checklist

Cuando revisos el código de otros:

### Arquitectura
- [ ] ¿Se respeta la separación de capas?
- [ ] ¿El dominio es puro (sin dependencias)?
- [ ] ¿Los puertos están bien definidos?
- [ ] ¿Los adaptadores implementan correctamente?

### Código
- [ ] ¿El código es legible?
- [ ] ¿Los nombres son claros?
- [ ] ¿Las funciones son pequeñas?
- [ ] ¿Hay duplicación innecesaria?
- [ ] ¿Hay código muerto?
- [ ] ¿Se usan tipos correctamente?

### Testing
- [ ] ¿Se probó manualmente?
- [ ] ¿Hay tests (si aplica)?
- [ ] ¿Se cubren casos edge?

### Documentación
- [ ] ¿La documentación está actualizada?
- [ ] ¿Hay comentarios en lógica compleja?
- [ ] ¿Los ejemplos son claros?

### Performance
- [ ] ¿Hay queries N+1?
- [ ] ¿Se usan índices adecuados?
- [ ] ¿Hay memory leaks potenciales?

---

## ✅ Before Commit Checklist

Justo antes de hacer commit:

```bash
# 1. TypeScript
npm run type-check
# Resultado esperado: "Found 0 errors"

# 2. Linting
npm run lint
# Resultado esperado: "0 errors and 0 warnings"

# 3. Compilación
npm run build
# Resultado esperado: Sin errores

# 4. Testing manual (si aplica)
npm run dev
# Resultado esperado: Todo funciona como se espera

# 5. Git
git status
# Resultado esperado: Solo los archivos que intento cambiar

# 6. Commit
git add .
git commit -m "type(scope): descripción clara"

# 7. Push
git push origin feature/mi-feature
```

---

## ✅ Daily Standup Checklist

Cada día al empezar:

- [ ] ¿Qué hice ayer?
- [ ] ¿Bloqueantes?
- [ ] ¿Qué haré hoy?
- [ ] ¿Necesito ayuda?

### Para Log:
```
# Ayer
- Implementé HandleMessageUseCase
- Agregué casos de uso para saludar

# Bloqueantes
- Ninguno

# Hoy
- Integrar BaileysWhatsAppAdapter
- Probar con mensajes reales

# Ayuda
- ¿Cómo manejo reconexiones en Baileys?
```

---

## ✅ Release Checklist (v1.1, v2.0, etc)

Antes de hacer un release:

### Código
- [ ] Todos los tests pasan
- [ ] Coverage > 80%
- [ ] Sin warnings de linting
- [ ] TypeScript strict mode

### Documentación
- [ ] README.md actualizado
- [ ] CHANGELOG.md actualizado
- [ ] API docs actualizadas
- [ ] Ejemplos funcionan

### Performance
- [ ] Benchmarks OK
- [ ] Sin memory leaks
- [ ] Sin N+1 queries

### Seguridad
- [ ] Dependencias actualizadas
- [ ] Sin vulnerabilidades conocidas
- [ ] Secrets no en repo

### Testing
- [ ] Pruebas manuales completadas
- [ ] Ambiente de staging OK
- [ ] Rollback plan listo

### Deploy
- [ ] Backup de base de datos
- [ ] Logs disponibles
- [ ] Monitoreo configurado
- [ ] Alertas activas

### Comunicación
- [ ] Release notes redactadas
- [ ] Email a stakeholders
- [ ] Post en Slack/Discord

---

## ✅ Troubleshooting Checklist

Si algo no funciona:

### Compilación
- [ ] ¿Ejecuté `npm install`?
- [ ] ¿Ejecuté `npm run build`?
- [ ] ¿Hay errores de tipo en TypeScript?
- [ ] ¿Node.js >= 18.0.0?

### Ejecución
- [ ] ¿Hay archivo `.env`?
- [ ] ¿Variables de entorno configuradas?
- [ ] ¿Puerto disponible?
- [ ] ¿Logs muestran errores?

### Tests
- [ ] ¿Mocks configurados correctamente?
- [ ] ¿Datos de test válidos?
- [ ] ¿Timeout suficiente?

### Git
- [ ] ¿Rama correcta?
- [ ] ¿Cambios guardados?
- [ ] ¿No hay conflictos?

### IDE
- [ ] ¿Cerrar y reabrir proyecto?
- [ ] ¿Invalidar cachés?
- [ ] ¿Instalar extensiones TypeScript?

---

## ✅ Security Checklist

Antes de lanzar a producción:

### Código
- [ ] Sin `eval()` o `Function()`
- [ ] Sin inyección de SQL
- [ ] Sin XSS vulnerabilities
- [ ] Input validation en todas partes
- [ ] Salida escapada correctamente

### Dependencias
- [ ] `npm audit` pasado
- [ ] Sin vulnerabilidades conocidas
- [ ] Versiones up-to-date

### Configuración
- [ ] Secrets en variables de entorno
- [ ] No en repositorio
- [ ] Permisos de archivo correctos
- [ ] HTTPS configurado

### Datos
- [ ] Contraseñas hasheadas (bcrypt, argon2)
- [ ] PII encriptada en reposo
- [ ] Conexiones encriptadas (TLS)
- [ ] Logs sin datos sensibles

### Autenticación
- [ ] JWT validado
- [ ] CORS configurado
- [ ] Rate limiting activo
- [ ] Session timeout configurado

---

## ✅ Performance Checklist

Optimización:

### Código
- [ ] Sin loops innecesarios
- [ ] Sin operaciones N+1
- [ ] Caché cuando sea apropiado
- [ ] Lazy loading de datos

### Infraestructura
- [ ] Índices de base de datos
- [ ] Queries optimizadas
- [ ] Conexión pooling
- [ ] CDN para assets estáticos

### Monitoreo
- [ ] Métricas de performance
- [ ] Alertas configuradas
- [ ] Logs rotados
- [ ] Backups regulares

---

## ✅ Team Standards Checklist

Mantener consistencia:

- [ ] Todos usan EditorConfig
- [ ] Todos usan ESLint
- [ ] Todos usan Prettier (si aplica)
- [ ] Mismo TypeScript strictness
- [ ] Mismos commits messages
- [ ] Documentación consistente

---

## Uso de estos Checklists

**Imprimir:**
```bash
# Crear un archivo imprimible
cp CHECKLISTS.md CHECKLISTS_PRINT.md
```

**Usar en GitHub:**
```markdown
## Checklist
- [ ] TypeScript type-check pasado
- [ ] Linting pasado
- [ ] Documentación actualizada
```

**Usar en IDE:**
Copiar checklist relevante a un TODO en comentarios:
```typescript
// TODO: Feature Development Checklist
// - [ ] Crear entidades
// - [ ] Crear puertos
// - [ ] Crear caso de uso
```

---

## Notas

- Adaptcar los checklists a tu proyecto
- Agregar más items según tu workflow
- Revisar regularmente
- Actualizar cuando haya cambios en el proceso

---

**Última actualización:** 2026-04-03
