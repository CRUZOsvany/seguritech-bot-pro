# 🏢 SegurITech Bot Pro - Monorepo

**Estructura Moderna de Monorepo con Backend (Node.js/Express) + Frontend (Next.js)**

## 📁 Estructura del Proyecto

```
seguritech-bot-pro-monorepo/
├── backend/                          # Backend del chatbot
│   ├── src/                          # Código TypeScript
│   │   ├── app/
│   │   ├── config/
│   │   ├── domain/
│   │   ├── infrastructure/
│   │   ├── handlers/
│   │   ├── services/
│   │   ├── models/
│   │   ├── tests/
│   │   ├── utils/
│   │   ├── index.ts
│   │   └── Bootstrap.ts
│   ├── bin/                          # Scripts ejecutables
│   ├── supabase/                     # Migraciones SQL
│   ├── package.json                  # Deps backend
│   ├── tsconfig.json
│   ├── jest.config.js
│   └── .eslintrc.json
│
├── frontend/                         # Dashboard Next.js
│   ├── app/                          # Rutas de App Router
│   ├── components/                   # Componentes React
│   ├── hooks/                        # Custom hooks
│   ├── lib/                          # Utilidades frontend
│   ├── public/                       # Assets estáticos
│   ├── package.json                  # Deps frontend
│   ├── next.config.ts
│   ├── tsconfig.json
│   └── postcss.config.mjs
│
├── docs/                             # Documentación centralizada
│   ├── 01_ARQUITECTURA.md
│   ├── 02_TESTING.md
│   ├── ...
│   └── README.md
│
├── package.json                      # Root package (workspaces)
├── .gitignore
└── .env.example
```

---

## 🚀 Instalación

### Instalar todas las dependencias:

```bash
npm install
```

O manualmente en cada workspace:

```bash
npm install --workspace backend
npm install --workspace frontend
```

---

## 🛠️ Scripts Disponibles

### **Backend**
```bash
npm run dev                    # Ejecutar backend en modo desarrollo
npm run build:backend          # Compilar TypeScript
npm start                      # Ejecutar backend en producción
npm run test                   # Ejecutar tests
npm run test:multiTenant       # Tests de multi-tenant
npm run lint                   # Hacer lint
```

### **Frontend**
```bash
npm run dev:frontend           # Ejecutar Next.js en desarrollo
npm run build:frontend         # Build Next.js
npm run start:frontend         # Ejecutar frontend en producción
```

### **Ambos (Monorepo)**
```bash
npm run dev:both               # Ejecutar backend + frontend juntos
npm run build                  # Build de todo (backend + frontend)
npm run install:all            # Instalar todas las deps
```

---

## 📋 Estructura Git

- **Monorepo Root** → `package.json` con `workspaces`
- **Backend** → `backend/package.json` (deps Node.js)
- **Frontend** → `frontend/package.json` (deps Next.js)
- **Docs** → `docs/` (toda la documentación centralizada)
- **Backups** → `.gitignore` excluye `OLD_*` y `.temp_*`

---

## 🔗 Referencias Internas

### Backend → Frontend
Si el backend necesita comunicarse con el frontend:
```typescript
// backend/src/...
const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
```

### Frontend → Backend
Si el frontend necesita llamar al backend:
```typescript
// frontend/lib/api-client.ts
const apiUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';
```

---

## 📦 Dependencias Compartidas

Para dependencias que usan ambos (ej: TypeScript):
- Instalar en **root** si es DevDep global
- Instalar en **workspace específico** si es para ese workspace

```bash
# Global (root)
npm install --workspace=. -D typescript

# Específico
npm install --workspace backend -D jest
npm install --workspace frontend -D next
```

---

## 🗂️ Documentación

Toda la documentación está centralizada en `/docs`:
- Arquitectura del sistema
- Guías de testing
- Integración con Meta
- Configuración de Supabase
- Guías de deployment

Léelas en orden: `01_`, `02_`, etc.

---

## 🔐 Variables de Entorno

### Backend (`.env`)
```env
NODE_ENV=development
WEBHOOK_PORT=3001
META_VERIFY_TOKEN=...
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

### Frontend (`.env.local`)
```env
NEXT_PUBLIC_BACKEND_URL=http://localhost:3001
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

---

## 🐛 Debugging

### Visual Studio Code
Agregar a `.vscode/launch.json`:
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Backend",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/backend/src/index.ts",
      "preLaunchTask": "tsc: build"
    }
  ]
}
```

---

## 📝 Versionado

- Backend: `backend/package.json` → version
- Frontend: `frontend/package.json` → version
- Root: `package.json` → version del monorepo

Mantenciones sincronizadas en releases.

---

## ✨ Checklist Post-Refactorización

- [ ] Backend tests pasan: `npm run test`
- [ ] Frontend compila: `npm run build:frontend`
- [ ] Ambos corren juntos: `npm run dev:both`
- [ ] Git commits sin archivos OLD_*
- [ ] .env.example actualizado
- [ ] Documentación en /docs completa

---

## 🤝 Contribuir

1. Branch desde `main`
2. Haz cambios en `backend/` o `frontend/`
3. Instala deps si es necesario
4. Testa localmente
5. PR con descripción clara

---

**Última actualización**: 2026-04-26
**Estructura**: Monorepo moderno con Yarn/NPM workspaces

