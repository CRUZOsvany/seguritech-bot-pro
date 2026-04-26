# 🎨 FLUJO DE AUTENTICACIÓN VISUAL

## FLUJO COMPLETO

```
┌─────────────────────────────────────────────────────────────┐
│                                                               │
│  Usuario abre: http://localhost:3000                        │
│                                                               │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
         ┌───────────────────────┐
         │  app/page.tsx         │
         │  (HomePage)           │
         └───────────┬───────────┘
                     │
                     │ ¿Autenticado?
                     │
         ┌───────────┴───────────┐
         │                       │
        SÍ                       NO
         │                       │
         ▼                       ▼
    ┌─────────────┐      ┌──────────────────┐
    │ /dashboard  │      │ /auth/login      │
    │ (protegida) │      │ (formulario)     │
    └─────────────┘      └────────┬─────────┘
                                  │
                                  ▼
                         ┌────────────────────┐
                         │ app/(auth)/login/  │
                         │ page.tsx           │
                         └────────┬───────────┘
                                  │
                ┌─────────────────┴─────────────────┐
                │                                   │
       Credenciales                    Credenciales
       inválidas                       válidas
                │                                   │
                ▼                                   ▼
         ┌─────────────┐                    ┌─────────────┐
         │ Mostrar     │                    │ nextAuth    │
         │ error       │                    │ validadas   │
         └────────┬────┘                    └────────┬────┘
                  │                                  │
                  └──────────────┬───────────────────┘
                                 │
                                 ▼
                          ┌──────────────┐
                          │ Redirigir a  │
                          │ /dashboard   │
                          └──────────────┘
```

---

## ARCHIVOS INVOLUCRADOS

### Capa de Enrutamiento
```
app/page.tsx
├─ Detecta autenticación
├─ Si sí → /dashboard
├─ Si no → /auth/login
└─ (usa hook useAuth)

app/(auth)/layout.tsx
├─ Contenedor para rutas de auth
├─ Estilo: gradient fondo azul
└─ Sin sidebar (a diferencia de dashboard)

app/(auth)/login/page.tsx
├─ Formulario de login
├─ Email + Password
├─ Validación con Zod + React Hook Form
├─ Llama a nextAuth signIn()
├─ Redirige a /dashboard si OK
└─ Muestra error si falla

app/(auth)/error/page.tsx
└─ Página para errores de auth
```

### Capa de Seguridad
```
proxy.ts (antes middleware.ts)
├─ Intercepta TODAS las rutas
├─ Valida token de sesión
├─ Protege:
│  ├─ /dashboard/* → requiere login
│  ├─ /admin/* → requiere SuperAdmin
│  └─ /clients/* → requiere AdminOperador
├─ Redirige a login si no autenticado
└─ Verifica roles
```

### Capa de Configuración
```
Providers (SessionProvider)
├─ Envuelve toda la app
├─ Proporciona sesión a React Context
└─ Necesario para useAuth()

NextAuth.js
├─ Valida credenciales en Supabase
├─ Crea sesión JWT
└─ Proporciona token

Supabase
├─ Base de datos de usuarios
├─ Valida email + password
└─ Retorna user data + rol
```

---

## VARIABLES DE FLUJO

### Usuario.json (después de login)
```json
{
  "id": "user-uuid",
  "email": "admin@seguritech.test",
  "role": "super_admin" o "admin_operator",
  "tenantId": "tenant-uuid",
  "iat": 1704067200,
  "exp": 1704150600
}
```

### Request Flow en proxy.ts
```
1. Obtiene token JWT de la cookie
2. Valida que sea válido
3. Lee token.role
4. Si ruta = /admin → verifica role == SUPER_ADMIN
5. Si ruta = /dashboard → verifica role en [SUPER_ADMIN, ADMIN_OPERATOR]
6. Si acceso válido → NextResponse.next()
7. Si no → redirige a login
```

---

## COMPONENTES UTILIZADOS

### Formulario
```
<Input> - Como en: @/components/ui/Form
  ├─ Integrada con React Hook Form
  ├─ Validación en tiempo real
  └─ Mensajes de error

<Button> - Como en: @/components/ui/Button
  ├─ type="submit"
  ├─ isLoading prop
  └─ Variantes: primary, secondary
```

### Validación
```
LoginSchema (Zod)
├─ email: string + valid email
├─ password: string + min 6 chars
└─ Retorna errores si no cumple

zodResolver (react-hook-form)
└─ Integra Zod con el formulario
```

---

## CHECKLIST DE FUNCIONAMIENTO

Después de completar setup:

- [ ] http://localhost:3000 → redirige a /auth/login
- [ ] Formulario de login carga sin errores
- [ ] Campos email y password validan input
- [ ] Botón "Iniciar Sesión" funciona
- [ ] Credenciales correctas → redirige a /dashboard
- [ ] Credenciales incorrectorecta → muestra error
- [ ] /dashboard sin login → redirige a /auth/login
- [ ] /admin sin SuperAdmin → redirige a /dashboard
- [ ] Las rutas están protegidas por proxy.ts

---

## DIAGRAMA DE SEGURIDAD (proxy.ts)

```
Todas las requests
     │
     ▼
¿Ruta pública? (/auth/login, /)
├─ SÍ → pasar
└─ NO → continuar

     │
     ▼
¿Tiene token válido?
├─ NO → redirigir a /auth/login
└─ SÍ → continuar

     │
     ▼
¿Es ruta /admin?
├─ SÍ → ¿role == SUPER_ADMIN?
│       ├─ NO → redirigir a /dashboard
│       └─ SÍ → pasar
└─ NO → continuar

     │
     ▼
¿Es ruta /dashboard o /clients?
├─ SÍ → ¿role en [SUPER_ADMIN, ADMIN_OPERATOR]?
│       ├─ NO → redirigir a /auth/login
│       └─ SÍ → pasar
└─ NO → pasar

     │
     ▼
Usuario puede acceder
```

---

**Ejemplo de uso típico:**
1. Usuario abre navegador → /
2. useAuth() detecta no autenticado
3. Redirige a /auth/login
4. Usuario ingresa email + password
5. Valida contra Supabase
6. Si OK → crea JWT en cookie
7. Redirige a /dashboard
8. Proxy.ts valida JWT
9. Deja acceder a /dashboard ✅
10. Si intenta /admin sin rol → redirige a /dashboard

