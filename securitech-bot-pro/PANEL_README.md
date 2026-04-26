# 🎛️ SegurITech Bot Pro - Panel de Control

**Panel de administración completo para gestionar WhatsApp Bots en modo SaaS (Done For You).**

> Estado actual: **FASE 2 Completada** ✅  
> Últimas actualizaciones: Dashboard funcional, Autenticación multi-rol, Componentes UI base  
> Próxima: Formulario de Nuevo Cliente (FASE 3-4)

---

## 📋 Índice Rápido

- [Características Implementadas](#características-implementadas)
- [Stack Tecnológico](#stack-tecnológico)
- [Instalación Rápida](#instalación-rápida)
- [Guía de Desarrollo](#guía-de-desarrollo)
- [Estructura del Proyecto](#estructura-del-proyecto)
- [Fases del Desarrollo](#fases-del-desarrollo)

---

##  ✨ Características Implementadas

### Fase 1-2 Completadas ✅

#### Infraestructura y Autenticación
- [x] Configuración NextAuth.js con roles (SuperAdmin/AdminOperador)
- [x] Multi-tenant con Row Level Security en Supabase
- [x] Middleware de protección de rutas por rol y tenantId
- [x] JWT strategy con refresh automático

#### Autenticación y Login
- [x] Página de login con validación Zod
- [x] Soporte para credenciales corporativas
- [x] Manejo de errores y redirecciones inteligentes
- [x] Dropdown de usuario con logout

#### Dashboard y Navegación
- [x] Dashboard principal con KPIs (Clientes activos, Mensajes/mes, Ingresos)
- [x] Tabla de clientes con filtros por estado y pago vencido
- [x] Header con avatar del usuario y rol badge
- [x] Sidebar con navegación según rol

#### Componentes UI Reutilizables
- [x] Button (4 variantes: primary, secondary, danger, ghost)
- [x] Input, Textarea, Select con validación integrada
- [x] Card, AccordionItem, CompleteBadge
- [x] Layout responsivo (Tailwind + mobile-first)

#### Base de Datos
- [x] 9 tablas en Supabase (tenants, admin_users, owner_data, bot_config, catalogs, etc.)
- [x] Row Level Security (RLS) en todas las tablas
- [x] Triggers para auditoría automática
- [x] Índices de performance

#### API Routes
- [x] POST `/api/auth/[...nextauth]` - Autenticación
- [x] GET `/api/auth/me` - Obtener usuario actual
- [x] GET `/api/clients` - Listar clientes (filtrado por rol/tenant)
- [x] POST `/api/clients` - Crear nuevo cliente

---

## 🛠 Stack Tecnológico

| Capa | Tecnología | Versión |
|------|-----------|---------|
| **Frontend** | Next.js 16.2 | App Router + TypeScript |
| **UI/Estilos** | Tailwind CSS 4 | Utility-first CSS |
| **Validación** | Zod | Runtime validation |
| **Formularios** | React Hook Form | Lightweight, performant |
| **Autenticación** | NextAuth.js 5 | JWT + Provider credentials |
| **BD** | Supabase (PostgreSQL) | Multi-tenant con RLS |
| **Cliente BD** | @supabase/supabase-js | Tipado TypeScript |
| **API** | Next.js API Routes | Server-side rendering |
| **Comunicación Backend** | Axios | HTTP client |

---

## 🚀 Instalación Rápida

### Prerequisitos
- Node.js 18+
- npm o yarn
- Cuenta Supabase (gratuita en [supabase.com](https://supabase.com))

### Paso 1: Clonar y entrar al directorio
```bash
cd securitech-bot-pro
```

### Paso 2: Instalar dependencias
```bash
npm install
```

### Paso 3: Configurar Supabase

**Opción A: Nueva instancia Supabase (Recomendado)**
```bash
# Ir a https://supabase.com → Create Project
# Obtener:
# - NEXT_PUBLIC_SUPABASE_URL (URL de tu proyecto)
# - NEXT_PUBLIC_SUPABASE_ANON_KEY (Anon key)
# - SUPABASE_SERVICE_ROLE_KEY (Service role)
```

**Opción B: Usar schema SQL existente**
```bash
# En Supabase SQL Editor, copiar-pegar SCHEMA_SUPABASE.sql
# Ejecutar → Esperar a que se creen todas las tablas
```

### Paso 4: Configurar variables de entorno
```bash
cp .env.local.example .env.local
```

Editar `.env.local`:
```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# NextAuth
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<generar: openssl rand -base64 32>

# Backend (opcional, para comunicación con motor Node.js)
NEXT_PUBLIC_BACKEND_API_URL=http://localhost:3001
```

### Paso 5: Crear usuario de prueba en Supabase

En **Supabase SQL Editor**, ejecutar:
```sql
INSERT INTO admin_users (user_id, email, name, role, password_hash)
VALUES ('test-id', 'admin@suivritech.test', 'Admin Test', 'super_admin', 'password123');
```

⚠️ **Nota**: En producción, usar bcrypt para hasheado.

### Paso 6: Ejecutar en desarrollo
```bash
npm run dev
```

Acceder a: http://localhost:3000

**Credenciales de prueba:**
- Email: `admin@seguritech.test`
- Password: `password123`

---

## 🧑‍💻 Guía de Desarrollo

### Estructura de Carpetas

```
app/
├── (auth)/                  # Layout para login
│   ├── login/page.tsx      # Página de login
│   └── layout.tsx
│
├── (dashboard)/             # Layout con Header + Sidebar
│   ├── dashboard/page.tsx   # Dashboard principal
│   ├── clients/             # Rutas de clientes
│   │   ├── page.tsx        # Lista de clientes (future)
│   │   ├── new/page.tsx    # Formulario nuevo (FASE 4)
│   │   └── [tenantId]/...  # Editar cliente (FASE 4)
│   │
│   └── layout.tsx          # Layout del dashboard
│
├── api/                     # API Routes
│   ├── auth/...            # NextAuth
│   └── clients/...         # CRUD de clientes
│
├── layout.tsx              # Root layout
└── page.tsx                # Home (redirige)

components/
├── ui/                     # Componentes reutilizables
│   ├── Button.tsx
│   ├── Form.tsx           # Input, Textarea, Select
│   └── Card.tsx           # Card, Accordion, Badge
│
├── layout/                # Componentes de layout
│   ├── Header.tsx
│   ├── Sidebar.tsx
│   └── DashboardLayout.tsx
│
└── forms/                 # Formularios (FASE 4)
    ├── ClientFormPage.tsx
    ├── BusinessFormSection.tsx
    └── ...

lib/
├── types.ts              # Tipos TypeScript compartidos
├── validators.ts         # Esquemas Zod
├── auth.ts              # Configuración NextAuth
├── supabase.ts          # Cliente Supabase
├── api-client.ts        # Cliente para backend Node
│
hooks/
├── useAuth.ts           # Hook para autenticación

```

### Flujos Comunes

#### Crear un nuevo componente
```tsx
// components/ui/MyComponent.tsx
'use client';  // Si usa hooks/interactividad

import React from 'react';

interface MyComponentProps {
  // tipos
}

export const MyComponent: React.FC<MyComponentProps> = ({ ...props }) => {
  return <div>{/* contenido */}</div>;
};
```

#### Usar validación Zod en formulario
```tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { BusinessDataSchema, BusinessData } from '@/lib/validators';

const {
  register,
  handleSubmit,
  formState: { errors },
} = useForm<BusinessData>({
  resolver: zodResolver(BusinessDataSchema),
});
```

#### Consumir API desde componente
```tsx
'use client';

const fetchClients = async () => {
  const response = await fetch('/api/clients');
  const data = await response.json();
  setClients(data.data);
};
```

#### Acceder a sesión del usuario
```tsx
'use client';

import { useAuth } from '@/hooks/useAuth';

const { user, isSuperAdmin, isLoading } = useAuth();
```

---

## 📊 Estructura del Proyecto

### Roles y Permisos

| Rol | Permisos |
|-----|----------|
| **SuperAdmin** | ✓ Ve todos los clientes<br/>✓ Crea/edita/elimina clientes<br/>✓ Ve facturación global<br/>✓ Crea/suspende otros admins<br/>✓ Accede a auditoría<br/>✓ Puede impersonar tenants |
| **AdminOperador** | ✓ Ve solo sus clientes asignados<br/>✓ Crea/edita bots<br/>✓ Sube catálogos<br/>✗ No ve facturación<br/>✗ No puede eliminar admins |

### Seguridad - Multi Tenant

```
┌─────────────────────────────────────┐
│ Middleware (Next.js Edge)            │
│ ✓ Verifica token JWT                │
│ ✓ Valida tenantId en ruta           │
│ ✓ Impide acceso cruzado             │
└─────────────────────────────────────┘
         ↓
┌─────────────────────────────────────┐
│ RLS (Supabase)                      │
│ ✓ Cada tabla valida auth.uid()     │
│ ✓ Filtra por tenantId automático   │
│ ✓ SuperAdmin: sin restricción      │
└─────────────────────────────────────┘
```

---

## 📅 Fases del Desarrollo

### ✅ Fase 1: Infraestructura
- Database schema (9 tablas)
- Tipos y validadores
- Autenticación NextAuth
- Supabase client + RLS
- Middleware de protección

### ✅ Fase 2: Autenticación y UI
- Pagina de login
- Dashboard con KPIs
- Header y Sidebar
- Componentes UI base
- API routes iniciales

### ⏳ Fase 3-4: Formulario Nuevo Cliente
Formulario con 5 secciones colapsables:
1. Datos del negocio
2. Datos del dueño y cobranza
3. Configuración del bot
4. Catálogo de productos (PDF + manual)
5. Alertas de servicio urgente

### ⏳ Fase 5: API Routes Completos
- PUT /api/clients/[tenantId]
- DELETE /api/clients/[tenantId]
- Catálogo CRUD
- Estadísticas y métricas
- Webhooks del backend

### ⏳ Fase 6: Vistas Especializadas
- Facturación global (SuperAdmin)
- Gestión de admins (SuperAdmin)
- Auditoría y logs (SuperAdmin)
- Vistas simplificadas (AdminOperador)

### ⏳ Fase 7: Testing y Producción
- Tests unitarios
- Tests de integración
- Testing de seguridad
- Documentación API
- Deploy a producción

---

##  Recursos Útiles

### Documentación
- [Next.js 16 Docs](https://nextjs.org/docs)
- [NextAuth.js Documentation](https://next-auth.js.org/)
- [Supabase Documentation](https://supabase.com/docs)
- [React Hook Form](https://react-hook-form.com/)
- [Zod Documentation](https://zod.dev/)

### Archivos de Especificación
- `FASE1_COMPLETED.md` - Infraestructura detallada
- `FASE2_COMPLETED.md` - UI y autenticación
- `SCHEMA_SUPABASE.sql` - Script de BD
- `.env.local.example` - Variables de entorno

### Monitoreo
```bash
# Terminal 1: Desarrollo
npm run dev

# Terminal 2: Logs en tiempo real
npm run type-check  # Verificar tipos
```

---

## 🔒 Consideraciones de Seguridad

### Implementadas ✅
- Row Level Security en todas las tablas
- JWT tokens con expiración
- Middleware de autenticación
- Validación de tipos con TypeScript
- HTTPS ready (cookies secure en prod)
- Service role key separada (nunca al cliente)

### TODO (Antes de Producción)
- [ ] Implementar bcrypt para passwords
- [ ] Agregar rate limiting
- [ ] CORS configurado
- [ ] Helmet.js para headers HTTP
- [ ] CSRF protection
- [ ] Logs de auditoría completos
- [ ] Monitoreo de errores (Sentry)

---

## 🐛 Troubleshooting

### "Page not found" en login
```bash
# Asegurate que Supabase está configurado:
echo $NEXT_PUBLIC_SUPABASE_URL
```

### "Middleware rechazó solicitud"
```bash
# Verificar RLS esté habilitado en Supabase
# Reloguear (token puede estar expirado)
```

### "Cannot find module"
```bash
npm install
npm run build  # Compilar para detectar errores
```

---

## 📞 Contacto y Soporte

- **Repositorio**: `seguritech-bot-proprueba`
- **Tipo**: SaaS interno (Done For You)
- **Responsable**: GitHub Copilot
- **Estado**: En desarrollo activo

---

**Última actualización**: 26 de Abril, 2025  
**Versión**: 1.0.0  
**Estado**: FASE 2 Completada ✅


