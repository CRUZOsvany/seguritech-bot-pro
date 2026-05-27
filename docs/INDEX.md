# Índice de Documentación

> Punto de entrada para navegar `docs/`. Para overview del producto, ver [`../README.md`](../README.md).

## Estructura

```
docs/
├── INDEX.md              ← estás aquí
├── README.md             ← overview de la documentación
├── architecture/         ← arquitectura hexagonal, multi-tenancy, estructura del proyecto
├── meta-adapter/         ← integración Meta WhatsApp Cloud API
├── testing/              ← estrategia y suite de tests
├── deployment/           ← deploy a producción
├── development/          ← guías de desarrollo y referencia del equipo
├── troubleshooting/      ← problemas conocidos y soluciones
├── pos/                  ← POS Papelería (Sprint 5.1)
└── history/              ← sprints, entregas y refactors pasados (referencia)
```

## Por rol

### Desarrollador nuevo
1. [`../README.md`](../README.md) — overview del proyecto
2. [`architecture/ARCHITECTURE.md`](./architecture/ARCHITECTURE.md) — diseño hexagonal
3. [`development/DEVELOPER_GUIDE.md`](./development/DEVELOPER_GUIDE.md) — setup y estándares
4. [`testing/QUICK_START_TESTS.md`](./testing/QUICK_START_TESTS.md) — correr tests

### Trabajando en integración Meta WhatsApp
- [`meta-adapter/META_QUICKSTART.md`](./meta-adapter/META_QUICKSTART.md)
- [`meta-adapter/META_WHATSAPP_ADAPTER_GUIDE.md`](./meta-adapter/META_WHATSAPP_ADAPTER_GUIDE.md)
- [`meta-adapter/META_NAVIGATION_MAP.md`](./meta-adapter/META_NAVIGATION_MAP.md)

### Trabajando en POS Papelería
- [`pos/README.md`](./pos/README.md)
- [`pos/api.md`](./pos/api.md) — endpoints
- [`pos/schema.md`](./pos/schema.md) — BD
- [`pos/security.md`](./pos/security.md) — auth y permisos

### DevOps / Deploy
- [`deployment/DEPLOYMENT_STEPS.md`](./deployment/DEPLOYMENT_STEPS.md)
- [`../docker-compose.yml`](../docker-compose.yml)

### Debugging / Troubleshooting
- [`troubleshooting/SOLUCION_DEPENDENCIAS.md`](./troubleshooting/SOLUCION_DEPENDENCIAS.md)
- [`troubleshooting/SOLUCION_REACT_CONTEXT.md`](./troubleshooting/SOLUCION_REACT_CONTEXT.md)

## Referencia histórica

`docs/history/` contiene documentos de sprints, entregas y refactors pasados. Sirven como bitácora pero no reflejan necesariamente el estado actual del código — verificar siempre contra el código vivo antes de actuar sobre algo que lees ahí.
