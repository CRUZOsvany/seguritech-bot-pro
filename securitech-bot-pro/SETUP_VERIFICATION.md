# ✅ CHECKLIST DE SETUP Y VERIFICACIÓN

## Pre-Setup (Antes de comenzar)

- [ ] Node.js 18+ instalado (`node --version`)
- [ ] Git clonado/sincronizado
- [ ] Cuenta Supabase creada (gratuita en supabase.com)
- [ ] Terminal abierta en `securitech-bot-pro/`

---

## Paso 1: Instalar Dependencias

```bash
npm install
```

**Verifica**:
- [ ] `node_modules/` creada
- [ ] `package-lock.json` actualizado
- [ ] Sin errores de instalación
- [ ] Tiempo estimado: 2-3 minutos

---

## Paso 2: Configurar Supabase

### 2.1 Obtener credenciales

1. Ir a https://supabase.com → Sign up si no tienes cuenta
2. Click "New Project"
3. Llenar form:
   - Project name: "seguritech-bot-pro"
   - Database password: (generar)
   - Region: Seleccionar más cercana (Ejemplo: us-east-1)
4. Esperar ~30 segundos a que se cree el proyecto
5. Cuando esté listo, ir a **Settings → API**
6. Copiar:
   - `URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role secret` → `SUPABASE_SERVICE_ROLE_KEY`

**Verifica**:
- [ ] URLs tienen formato `https://xxxxx.supabase.co`
- [ ] Keys comienzan con `eyJ...` (son JWT)
- [ ] Todas las 3 credenciales obtenidas

### 2.2 Crear schema en Supabase

En Supabase Dashboard:
1. Click "SQL Editor" (lado izquierdo)
2. Click "New query"
3. Copiar TODO el contenido de `SCHEMA_SUPABASE.sql`
4. Pegar en el editor
5. Click "Run"
6. Esperar a que se ejecute (puede tomar 30-60 segundos)

**Verifica**:
- [ ] No hay errores rojos (solo output)
- [ ] En "Database → Tables" aparecen 9 tablas:
  - [ ] admin_users
  - [ ] tenants
  - [ ] owner_data
  - [ ] bot_configurations
  - [ ] catalog_items
  - [ ] catalog_uploads
  - [ ] urgent_service_config
  - [ ] messages
  - [ ] audit_logs

---

## Paso 3: Variables de Entorno

### 3.1 Crear archivo .env.local

```bash
cp .env.local.example .env.local
```

### 3.2 Llenar .env.local

Abre `.env.local` y reemplaza:

```env
# ===== SUPABASE (Obtenidas en Paso 2) =====
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# ===== NextAuth.js =====
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<GENERAR AQUÍ>

# ===== Backend Node.js (opcional, dejar por ahora) =====
NEXT_PUBLIC_BACKEND_API_URL=http://localhost:3001
```

### 3.3 Generar NEXTAUTH_SECRET

En terminal (macOS/Linux):
```bash
openssl rand -base64 32
```

En terminal (Windows PowerShell):
```powershell
[Convert]::ToBase64String((1..32 | ForEach-Object {Get-Random -Maximum 256}) -as [byte[]])
```

Copiar resultado → Pegar en `NEXTAUTH_SECRET=`

**Verifica**:
- [ ] `NEXT_PUBLIC_SUPABASE_URL` lleno
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY` lleno
- [ ] `SUPABASE_SERVICE_ROLE_KEY` lleno
- [ ] `NEXTAUTH_SECRET` lleno (cadena aleatoria)
- [ ] Archivo `.env.local` NO fue comiteado a Git

---

## Paso 4: Crear Usuario de Prueba

### 4.1 En Supabase SQL Editor

1. Click "New query"
2. Copiar y ejecutar:

```sql
INSERT INTO admin_users (
  user_id,
  email,
  name,
  role,
  password_hash,
  is_active
) VALUES (
  'test-admin-001',
  'admin@seguritech.test',
  'Administrador Test',
  'super_admin',
  'password123',
  true
);
```

3. Click "Run"

**Verifica**:
- [ ] Ejecutó sin errores
- [ ] En "Table Editor" → "admin_users" aparece 1 fila

---

## Paso 5: Compilar y Ejecutar

### 5.1 Verificar compilación

```bash
npm run build
```

**Verifica**:
- [ ] Sin errores en compilación
- [ ] Output dice "✓ Ready for production"
- [ ] Carpeta `.next/` creada

### 5.2 Ejecutar desarrollo

```bash
npm run dev
```

**Verifica**:
- [ ] Output dice "Ready in X ms"
- [ ] URL disponible en http://localhost:3000
- [ ] NO hay errores en consola

---

## Paso 6: Test de Funcionalidad

### 6.1 Verificar redireccionamiento

1. Abrir http://localhost:3000 en navegador
2. Debe redirigir automáticamente a http://localhost:3000/auth/login

**Verifica**:
- [ ] Redirige a /auth/login
- [ ] Página de login carga correctamente

### 6.2 Test de login

1. Email: `admin@seguritech.test`
2. Password: `password123`
3. Click "Iniciar Sesión"

**Verifica**:
- [ ] Se redirige a /dashboard
- [ ] Dashboard muestra tabla de clientes (vacía inicialmente)
- [ ] Header muestra nombre "Administrador Test"
- [ ] Sidebar visible con navegación
- [ ] Rol "SuperAdmin" visible en badge

### 6.3 Test de logout

1. Click en avatar arriba a la derecha
2. Click "Cerrar sesión"

**Verifica**:
- [ ] Se redirige a /auth/login
- [ ] Sesión terminada

### 6.4 Test de acceso denegado

1. Loguear como antes (`admin@seguritech.test`)
2. En barra de dirección, ir a http://localhost:3000/admin/billing
3. Debe redirigir (este usuario es SuperAdmin, así que sí puede)
4. Crear otro usuario para test de acceso denegado (OPCIONAL)

**Verifica**:
- [ ] SuperAdmin puede acceder a /admin/*
- [ ] AdminOperador no puede (si lo pruebas después)

---

## Paso 7: Verificar API

### 7.1 Test GET /api/clients

```bash
# Con curl (macOS/Linux)
curl http://localhost:3000/api/clients

# Resultado esperado (requiere autenticación):
# {"error": "No autenticado", "status": 401}
```

Este es el comportamiento correcto (la API requiere token JWT).

**Verifica**:
- [ ] Retorna JSON
- [ ] Status 401 (no autenticado)
- [ ] Mensajes sensatos

### 7.2 Test desde el navegador

1. Loguear en http://localhost:3000/dashboard
2. Abrir Developer Tools (F12 → Network)
3. Refrescar página
4. Buscar llamada a `clients`
5. Debe mostrar `Status: 200`

**Verifica**:
- [ ] Request a `GET /api/clients` completó
- [ ] Response contiene `{"status":"success","data":[],"total":0}`

---

## Paso 8: Verificaciones Finales de Seguridad

### 8.1 Verificar RLS en Supabase

En Supabase Dashboard → Authentication → Policies:
1. Seleccionar tabla "tenants"
2. Debe mostrar varias políticas RLS

**Verifica**:
- [ ] RLS está "Enabled" (candado cerrado)
- [ ] Hay al menos 3-4 políticas listadas

### 8.2 Verificar Middleware

En carpeta raíz, archivo `middleware.ts` debe existir.

**Verifica**:
- [ ] File: `middleware.ts` existe
- [ ] Contiene protecciones de ruta

### 8.3 Verificar Variables de Entorno

```bash
# En terminal, NO debe retornar valores reales:
echo $NEXTAUTH_SECRET
```

**Verifica**:
- [ ] Variables NO están en consola (privadas)
- [ ] `.env.local` está en `.gitignore`

---

## Checklist de Deployment (Antes de Producción)

- [ ] Implementar bcrypt en `lib/auth.ts`
- [ ] Cambiar NEXTAUTH_URL a dominio real
- [ ] Variables de entorno en plataforma de hosting
- [ ] HTTPS habilitado en servidor
- [ ] Logs de auditoría revisados
- [ ] Tests de seguridad pasados
- [ ] Rate limiting implementado
- [ ] CORS configurado
- [ ] Backups de Supabase configurados

---

## Troubleshooting

### Error: "Cannot GET /auth/login"
**Solución**: Verificar que Next.js está corriendo (`npm run dev`)

### Error: "NEXTAUTH_SECRET is not set"
**Solución**: Generar con `openssl rand -base64 32` y agregar a `.env.local`

### Error: "Supabase connection refused"
**Solución**: Verificar `NEXT_PUBLIC_SUPABASE_URL` es correcto

### Error: "Email o contraseña incorrectos"
**Solución**: Verificar usuario existe en Supabase:
```sql
SELECT * FROM admin_users WHERE email = 'admin@seguritech.test';
```

### Error: "RLS violated"
**Solución**: Ejecutar `SCHEMA_SUPABASE.sql` completo nuevamente

### Página carga pero sin estilos
**Solución**: 
```bash
npm run build
npm run dev
```

### Build falla con TypeScript errors
**Solución**:
```bash
npm run type-check  # Ver errores
# Arreglar según output
```

---

## Siguiente Paso

Una vez verificado TODO, proceder con:

### 📋 FASE 3-4: Formulario Nuevo Cliente

Archivos a crear:
- `app/(dashboard)/clients/new/page.tsx` ← Página del formulario
- `components/forms/ClientFormPage.tsx` ← Componente container
- 5 secciones de formulario colapsables
- Parser PDF para catálogos
- Vista previa del bot

Estimado: 1-2 semanas

---

## Registro de Verificación

```
Fecha: [AQUÍ]
Usuario que verifica: [AQUÍ]
Resultado final: [ ] TODO FUNCIONA [ ] ERRORES (listar)

Errores encontrados (si aplica):
1. ...
2. ...
3. ...

Próximo paso recomendado:
[ ] FASE 3-4: Formulario Nuevo Cliente
[ ] Revisar código de FASE 2
[ ] Optimizaciones de performance
```

---

**Duración estimada de setup**: 15-30 minutos  
**Soporte**: Revisa docume ntación en `PANEL_README.md`

