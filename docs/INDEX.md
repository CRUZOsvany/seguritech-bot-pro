# 📚 Índice de Documentación

**Bienvenido a la documentación de SegurITech Bot Pro**

## 🚀 Inicio Rápido

- **[README.md](../README.md)** - Descripción general del proyecto y cómo iniciarse
- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - Arquitećtura hexagonal en detalle

## 👨‍💻 Para Desarrolladores

- **[DEVELOPER_GUIDE.md](./DEVELOPER_GUIDE.md)** - Setup, estándares, testing y debugging
- **[TEST_SUITE_DOCUMENTATION.md](./TEST_SUITE_DOCUMENTATION.md)** - Guía completa de testing

## 🛠️ Técnico

- **[DEPLOYMENT_STEPS.md](./DEPLOYMENT_STEPS.md)** - Cómo deployar a producción
- **[META_WHATSAPP_ADAPTER_GUIDE.md](./META_WHATSAPP_ADAPTER_GUIDE.md)** - Integración con Meta

## 📋 Cambios y Actualizaciones

- **[CHANGELOG_BUG_FIXES.md](./CHANGELOG_BUG_FIXES.md)** - Historial de cambios
- **[DELIVERY_FINAL.md](./DELIVERY_FINAL.md)** - Estado final del proyecto

## 📊 Arquitectura Visual

- **[ARQUITECTURA_VISUAL_MULTI_TENANT.md](./ARQUITECTURA_VISUAL_MULTI_TENANT.md)** - Diagramas visuales

## 🔍 Rutas por Rol

### 👤 Para Usuarios Nuevos
1. Lee [README.md](../README.md)
2. Lee [ARCHITECTURE.md](./ARCHITECTURE.md)
3. Sigue [DEVELOPER_GUIDE.md - Setup](./DEVELOPER_GUIDE.md#setup-del-entorno)

### 💻 Para Desarrolladores
1. [DEVELOPER_GUIDE.md](./DEVELOPER_GUIDE.md) - Completo
2. [ARCHITECTURE.md](./ARCHITECTURE.md) - Para entender el diseño
3. [TEST_SUITE_DOCUMENTATION.md](./TEST_SUITE_DOCUMENTATION.md) - Para escribir tests

### 🚀 Para DevOps / Deployment
1. [DEPLOYMENT_STEPS.md](./DEPLOYMENT_STEPS.md)
2. [docker-compose.yml](../docker-compose.yml)
3. [Dockerfile](../backend/Dockerfile)

### 🐛 Para Debugging
1. [DEVELOPER_GUIDE.md - Debugging](./DEVELOPER_GUIDE.md#debugging)
2. [CHANGELOG_BUG_FIXES.md](./CHANGELOG_BUG_FIXES.md)
3. Logs en `backend/src/config/logger.ts`

## 📁 Estructura de Docs

```
docs/
├── INDEX.md                              ← Estás aquí
├── ARCHITECTURE.md                       ← El corazón técnico
├── DEVELOPER_GUIDE.md                    ← Day-to-day development
├── DEPLOYMENT_STEPS.md                   ← Llevar a producción
├── TEST_SUITE_DOCUMENTATION.md          ← Testing strategy
├── META_WHATSAPP_ADAPTER_GUIDE.md       ← Integración WhatsApp
├── CHANGELOG_BUG_FIXES.md               ← Historial
├── DELIVERY_FINAL.md                    ← Status final
└── [otros archivos de referencia]
```

## 💡 Tips

### Buscando algo específico?

| Qué buscas | Dónde ir |
|-----------|----------|
| Cómo instalar | [README.md - Quick Start](../README.md#-inicio-rápido) |
| Cómo está hecha | [ARCHITECTURE.md](./ARCHITECTURE.md) |
| Cómo codear | [DEVELOPER_GUIDE.md](./DEVELOPER_GUIDE.md) |
| Cómo testear | [TEST_SUITE_DOCUMENTATION.md](./TEST_SUITE_DOCUMENTATION.md) |
| Cómo deployar | [DEPLOYMENT_STEPS.md](./DEPLOYMENT_STEPS.md) |
| Cómo debuggear | [DEVELOPER_GUIDE.md - Debug](./DEVELOPER_GUIDE.md#debugging) |
| Integraciones | [META_WHATSAPP_ADAPTER_GUIDE.md](./META_WHATSAPP_ADAPTER_GUIDE.md) |
| Qué cambió | [CHANGELOG_BUG_FIXES.md](./CHANGELOG_BUG_FIXES.md) |

## 📞 Ayuda

- 📧 Email: support@securitech.dev
- 💬 Discord: [Comunidad](https://discord.gg/securitech)  
- 🐛 Issues: [GitHub Issues](https://github.com/securitech/bot-pro/issues)
- 📚 Docs: https://docs.securitech.dev

## 🏗️ Plan de Lectura Sugerido

**Día 1 - Introducción** (30 min)
- [ ] [README.md](../README.md) - Quick Start
- [ ] [ARCHITECTURE.md](./ARCHITECTURE.md) - Visión General

**Día 2 - Desarrollo** (1-2 horas)
- [ ] [DEVELOPER_GUIDE.md](./DEVELOPER_GUIDE.md) - Setup
- [ ] [DEVELOPER_GUIDE.md](./DEVELOPER_GUIDE.md) - Estándares
- [ ] Clona el repo, instala y corre tests

**Día 3 - Profundidad** (2+ horas)
- [ ] [ARCHITECTURE.md](./ARCHITECTURE.md) - Completo
- [ ] [TEST_SUITE_DOCUMENTATION.md](./TEST_SUITE_DOCUMENTATION.md)
- [ ] Revisa `backend/src/domain` y `backend/src/infrastructure`

**Día 4+ - Especialización**
- [ ] Lo que necesites según tu rol (backend, frontend, DevOps)

---

**Última actualización**: Mayo 2026 | Versión 1.0.0

