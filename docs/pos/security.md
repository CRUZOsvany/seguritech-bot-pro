# Seguridad del módulo POS

Documento crítico: explica las decisiones de seguridad del Sprint 5.1a. La
auditoría y la validación cross-tenant dependen de entender esto.

## 1. RLS en Supabase vs service_role

**El backend usa `service_role`. Esto BYPASEA la RLS.**

Las políticas RLS definidas en migración 011 son **defensa en profundidad**,
no la primera línea de defensa. El aislamiento real lo dan los `WHERE
tenant_id = ?` en cada query del repositorio.

Esto se alinea con la doctrina existente del proyecto (ver comentario al
inicio de migración 001).

**Implicación práctica**: si en el futuro algún endpoint expone Supabase
directo al frontend con `anon key + JWT custom`, las policies POS ya estarán
listas para proteger los datos.

## 2. Scopes JWT (discriminada unión)

El JwtService firma dos tipos de payload, distinguibles por el claim `scope`:

| `scope` | Payload | Cookie | Uso |
|---|---|---|---|
| `'admin'` (o ausente, legacy) | `AdminJwtPayload` con `email`, `role: 'super_admin' \| 'admin_operator'` | `seguritech_session` | Panel admin |
| `'pos'` | `PosJwtPayload` con `displayName`, `role: 'pos_cashier' \| 'pos_manager'`, `tenantId: string` (NO null) | `seguritech_pos_session` | App POS |

**`verify()` sobrecargado**:
- `verify(token)` → `SessionJwtPayload` (unión, narrow tú con `.scope`).
- `verify(token, 'admin')` → `AdminJwtPayload`. Lanza si el token es pos.
- `verify(token, 'pos')` → `PosJwtPayload`. Lanza si el token es admin.

**Consecuencia**: un cajero NO puede usar su cookie POS para acceder al panel
admin. Cuando `AuthMiddleware` hace `verify(cookie, 'admin')` con un token
scope='pos', lanza, se cae a CF Access / x-api-key (que no aplica al cajero),
y termina en 401. Cumple [Pattern Q3 del Plan agent].

## 3. Cookies separadas

**Por qué**: misma cookie name + mismo origin = una cookie. Si admin y POS
usaran `seguritech_session`, un cajero logueado en el mismo navegador
sobrescribiría la cookie del admin. Inaceptable.

**Solución**: cookie POS dedicada `seguritech_pos_session` (configurable vía
env var `ADMIN_POS_COOKIE_NAME`). Admin y cajero pueden coexistir en el
mismo navegador.

**Flags**: `httpOnly`, `secure` (en prod), `sameSite=strict`, `path=/`.

## 4. Lockout on-row

A diferencia de admin (que usa `login_attempts` central), POS guarda lockout
en la propia fila `pos_users`:

- `failed_attempts INT NOT NULL DEFAULT 0`
- `locked_until TIMESTAMPTZ` (si > now → bloqueado)

**Por qué**:
- Sin contaminar `login_attempts` con eventos POS.
- Más simple para piloto.

**Race condition conocida**: `recordFailedAttempt` hace read-modify-write
(Supabase no expone increment atómico desde el cliente). Acceptable porque
el lockout es best-effort — un cajero abriendo 6 pestañas en paralelo es un
caso de detección, no de carrera.

## 5. Module guard estricto

`createRequireModule(tenants, 'pos')` valida `tenants.enabled_modules` incluye
`'pos'`. **NO hay bypass para super_admin**.

Razón: un super_admin sin POS habilitado para el tenant no debería poder
operar el POS. Si lo necesita para debug, debe habilitar el módulo
explícitamente.

## 6. Audit log compartido con admin

Las acciones POS se loggean en `admin_audit_log` (no en una tabla separada):

```sql
INSERT INTO admin_audit_log
  (admin_id, admin_email, action, ip, user_agent, metadata, ...)
VALUES
  (NULL,                            -- FK constraint: pos_users.id NO está en admin_users
   'pos:Demo Cajera@<tenantId>',   -- formato sintético para filtrado
   'pos.auth.login.success',
   ...,
   '{ "posUserId": "<uuid>", "jti": "...", "role": "pos_cashier" }'::jsonb);
```

**Gotcha crítico**: `admin_audit_log.admin_id` tiene FK a `admin_users(id)`.
Pasar un `pos_users.id` viola la constraint. Por eso:
- `admin_id = NULL` siempre para eventos POS.
- `metadata.posUserId` carga el id real del cajero.
- `admin_email` lleva un identificador sintético `pos:<name>@<tenantId>`
  para que las queries de auditoría por `admin_email` aún funcionen.

**Acciones registradas en Sprint 5.1a**:
- `pos.auth.login.success`
- `pos.auth.login.fail`
- `pos.auth.login.locked`
- `pos.auth.login.not_found`
- `pos.auth.login.inactive`
- `pos.auth.login.module_disabled`
- `pos.auth.logout`

## 7. Rate limiting

`POST /api/auth/pos-login` tiene un rate limiter dedicado (no comparte estado
con `/api/auth/login`). Cada `rateLimit({...})` crea su propio `MemoryStore`,
keyed por IP. Misma ventana 15min/5 intentos.

**Limitación**: en multi-proceso (cluster), el counter diverge por worker.
No es problema hoy porque corremos single-process; cuando escalemos habrá
que migrar a Redis store.

## 8. Aislamiento del tenant en endpoints

Todos los endpoints POS leen `tenantId` de `req.posUser.tenantId` (de la
cookie). **No se acepta** vía header `x-tenant-id` ni vía body.

La PWA del Sprint 5.1b no podrá engañar al backend sobre qué tenant es —
está en el JWT firmado por el server.

## 9. PIN policy

- 4 a 8 dígitos numéricos (`/^\d{4,8}$/`).
- bcrypt cost=12 (`config.admin.bcryptCost`, mismo que admin).
- Lockout: 5 intentos fallidos → 15 minutos bloqueado.
- Sin rotation policy hardcoded (a definir por gerente en futuro Sprint).

**Anti-patrones evitados**:
- 🚫 Sin "PIN único en todo el tenant" — `pos_users` tiene unique por
  `(tenant_id, name)`, NO por PIN. Dos cajeros pueden tener el mismo PIN
  (mientras tengan nombres distintos).
- 🚫 Sin "PIN como JWT secret" — el JWT se firma con `ADMIN_JWT_SECRET`,
  no con el PIN del usuario.
