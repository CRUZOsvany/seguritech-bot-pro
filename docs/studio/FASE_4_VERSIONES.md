# Studio — Fase 4: pruebas y versiones

> **Fecha:** 2026-09-11 · **Rama:** `feat/studio-fase-4-versiones` · apilada sobre #90, #89, #88 y #87
>
> La compuerta de publicación, los casos de prueba, el explorador de ramas,
> el diff y el rollback. Cómo aplicar la migración 023 y cómo probar el
> criterio de aceptación.

---

## 1. Antes de mergear: migración 023

`backend/supabase/migrations/023_studio_publish_and_tests.sql`. Se pega entera en el SQL Editor de Supabase Cloud (el CLI no está enlazado). Es idempotente: correrla dos veces no rompe nada.

Qué hace:

1. `bot_flow_versions` gana `validation_report` y `test_report` (jsonb): con qué validación y qué pruebas se publicó cada versión.
2. `publish_flow_version(...)`: publicar en **una sola transacción**. Bloquea la fila del flow, rechaza si el borrador cambió desde que se revisó, inserta la versión, apaga los otros flows del canal y activa este. Solo la puede ejecutar `service_role`: se revoca a `public`, `anon` y `authenticated`, porque PostgREST expone las funciones por REST.
3. `flow_test_cases`, con `tenant_id` y RLS (políticas `super_all` y `admin_tenant`, las mismas que el resto del esquema).

### Verificación (regla 8: el mismo día)

```sql
-- 1. Columnas nuevas
select column_name from information_schema.columns
 where table_schema = 'public' and table_name = 'bot_flow_versions'
   and column_name in ('validation_report', 'test_report');
-- esperado: 2 filas

-- 2. La función existe y anon/authenticated NO la pueden ejecutar
select has_function_privilege('anon', 'public.publish_flow_version(uuid,uuid,jsonb,uuid,text,jsonb,jsonb,boolean,boolean,timestamptz)', 'execute') as anon,
       has_function_privilege('authenticated', 'public.publish_flow_version(uuid,uuid,jsonb,uuid,text,jsonb,jsonb,boolean,boolean,timestamptz)', 'execute') as authenticated,
       has_function_privilege('service_role', 'public.publish_flow_version(uuid,uuid,jsonb,uuid,text,jsonb,jsonb,boolean,boolean,timestamptz)', 'execute') as service_role;
-- esperado: false, false, true

-- 3. Tabla de pruebas con RLS
select relrowsecurity from pg_class where oid = 'public.flow_test_cases'::regclass;
-- esperado: true
select policyname from pg_policies where tablename = 'flow_test_cases' order by 1;
-- esperado: flow_test_cases_admin_tenant, flow_test_cases_super_all
```

Después, en el panel: publicar un cambio de texto en un tenant de prueba y revisar que la versión nueva trae los reportes:

```sql
select version_number, note, validation_report is not null as con_validacion, test_report
  from public.bot_flow_versions where flow_id = '<flow>' order by version_number desc limit 1;
```

### Si todavía no se aplica

El backend no se cae:

- **Publicar y rollback** caen al camino de antes (tres escrituras sueltas) y dejan en el log un error que menciona «migración 023». Sin la función no hay atomicidad ni revisión de «el borrador cambió».
- **Pruebas:** la lista sale vacía (con un error en el log) y crear, editar o borrar responde **503** con el motivo. Publicar funciona, sin pruebas que correr.

---

## 2. Cómo probarlo (criterio de aceptación)

> *Es imposible publicar con un error o una prueba fallida; tras publicar, el bot real responde con la versión nueva sin reiniciar el servidor; el rollback está probado.*

Automático, con el motor real (`npm test`):

| Qué | Test |
|---|---|
| Error del validador → no publica | `studioPublish.test.ts`, `studioVersionsRouter.test.ts` |
| Prueba fallida → no publica, dice cuál y por qué | ídem |
| Publicar → el siguiente mensaje del bot real usa la versión nueva, sin reiniciar | `studioPublish.test.ts` (el mismo `BotController` antes y después) |
| Rollback → vuelve a contestar con la versión vieja | `studioPublish.test.ts`, `studioVersionsRouter.test.ts` |
| La función de Postgres: parámetros, `draft_changed`, camino de antes si falta | `SupabaseBotFlowRepository.publishVersion.test.ts` |

En el panel, **[no verificado]**: no se probó en un navegador (falta el panel levantado contra Supabase con la 023 aplicada). Pasos:

1. Studio de un tenant de prueba → platicar en el simulador hasta un caso (p. ej. emergencia → servicio → dirección).
2. **Guardar como prueba.** Salta al paso 8 con la prueba armada: nombre, paso donde tiene que terminar y, opcional, textos que el bot tiene que decir o no. **Guardar prueba.**
3. Cambiar la opción para que esa conversación termine en otro paso → Guardar → **Publicar**. Tiene que rechazarse con el nombre de la prueba y «Terminó en «x» y se esperaba «y»».
4. Deshacer el cambio → **Correr todas** → verde → **Publicar**. Mandar un WhatsApp real: contesta con lo nuevo.
5. En **Versiones publicadas**, «Volver a esta» sobre la anterior. El bot contesta con ella al siguiente mensaje; el borrador no se toca.

---

## 3. Cómo funciona

| Pieza | Dónde |
|---|---|
| Compuerta de publicación | `backend/src/domain/use-cases/PublishFlowUseCase.ts` |
| Casos de prueba (expectativas y evaluación) | `backend/src/domain/studio/testCases.ts` |
| Corredor de pruebas y explorador (motor real con adaptadores falsos) | `backend/src/infrastructure/studio/` |
| Diff legible | `backend/src/domain/studio/diff.ts` |
| Publicación atómica | `SupabaseBotFlowRepository.publishVersion` → `publish_flow_version` |
| Panel | `frontend/src/apps/panel/studio/StudioQuality.tsx` + `testing-model.ts` |

### Publicar

`POST /api/admin/tenants/:id/flows/:flowId/publish` (el de siempre; super_admin):

1. **Validar:** errores del validador de la Fase 2 y el schema de siempre. Un solo error y no se publica (400 con la lista).
2. **Correr las pruebas** guardadas del flow con el motor real, con reloj fijo (un lunes a las 11:00 de México si la prueba no trae hora). Una sola que falle y no se publica (400 con cuáles y por qué).
3. **Publicar en una transacción** con los dos reportes, pasando el `draft_updated_at` con que se revisó. Si alguien guardó el borrador entremedio: 409, «vuelve a intentarlo».
4. **Auditar:** `flow.publish` con número de versión, avisos y cuántas pruebas pasaron. `created_by` queda en la versión.

Sin borrador (lo editable es igual a lo publicado): 409.

**Caché:** no hay que invalidar nada. El bot lee el flow activo de la base en cada mensaje (`findActiveByTenant`, sin caché), así que la versión nueva contesta desde el siguiente mensaje en todas las instancias. El test de aceptación lo comprueba con el mismo `BotController` antes y después.

### Rollback

`POST …/flows/:flowId/rollback { versionNumber }` (super_admin) republica esa versión como una **versión nueva** (nota `rollback a vN`) y no toca el borrador. Pasa por el validador; **no** corre las pruebas (ver §5, D-4.2).

### Pruebas

Una prueba es una conversación guardada (los mismos eventos del simulador, en el vocabulario del webhook de Meta) y lo que tiene que pasar al final:

| Expectativa | Qué revisa |
|---|---|
| `node` | Paso donde queda la conversación |
| `vars` | Variables guardadas, con su valor exacto |
| `contains` / `notContains` | Textos que el bot manda o no (sin distinguir mayúsculas) |
| `maxMessages` | Tope de mensajes del bot en toda la conversación |

Endpoints, bajo `/api/admin/tenants/:id/studio/flows/:flowId/` y con `requireTenantScope`:

| | |
|---|---|
| `GET tests` · `POST tests` · `PUT tests/:testId` · `DELETE tests/:testId` | CRUD. Cualquier admin de su tenant (§13). Auditado: `flow.test.create/update/delete` |
| `POST tests/run { source }` | Corre todas contra el borrador, lo activo o una versión. No publica |
| `POST explore { depth, source }` | Explorador de ramas |
| `GET diff?against=<n>` | Qué cambió contra la versión `n` (default: la más nueva) |

«Guardar como prueba» toma la conversación del simulador con **su** reloj y **su** teléfono, para que se repita idéntica, y propone como expectativa el paso donde quedó.

### Explorador

Recorre el bot solo, con el motor real: toca cada botón y fila, escribe la primera palabra clave de cada salida, un dato genérico en los pasos que piden datos y un texto que nadie espera. Expande cada paso una vez (búsqueda en anchura), con tope de profundidad (1 a 8) y de corridas (150). Reporta cobertura, pasos sin alcanzar, dónde se corta la conversación, errores del motor (ciclos, pasos inexistentes) y el turno con más mensajes.

Cobertura con los moldes del repo: cerrajería y securitech 100 %; papelería 75 %, porque a los pasos del catálogo se llega escribiendo un producto que el explorador no adivina.

### Diff

Pasos agregados y quitados, cambio de paso inicial y, por paso, qué cambió en español: textos (««A» → «B»»), tipo («cambió de botones a lista»), botones, filas y a dónde lleva cada salida. Los metadatos del asistente (`studio`) no cuentan: el diff es de lo que el bot hace.

---

## 4. Desvíos de la especificación

| Especificación (§11) | Qué se hizo | Por qué |
|---|---|---|
| Tabla nueva `flow_versions` con `status` draft/published/archived | Se reusan `bot_flows` (`draft_json`, `json_definition`, `is_active`) y `bot_flow_versions`; se agregan las columnas de reportes | El esquema real ya separa borrador, publicado e historial y todo el backend lo usa. Una tabla paralela duplicaría el estado |
| «Archivar la publicada, marcar la nueva» | Insertar versión + activar, en una transacción | Lo «archivado» es cualquier versión que no es la más nueva |
| «Invalidar la caché de flujos en todas las instancias» | Nada que invalidar | No hay caché de flows (ver §3) |
| Expectativas `state`, `outboundContains`, `maxServiceMessages` | `node`, `vars`, `contains`, `notContains`, `maxMessages` | `state` no tiene equivalente único en la sesión real; se agregó `notContains` |
| Endpoints `/studio/flows/:flowId/...` | `/tenants/:id/studio/flows/:flowId/...`; publicar, versiones y rollback siguen en `/tenants/:id/flows/...` | Tenant scoping por URL, como el resto de `/api/admin/*`. El Designer ya usa publicar y rollback |

---

## 5. Decisiones para OVY

- **D-4.1 · Conversaciones en curso al publicar.** La especificación propone que terminen en la versión con la que empezaron, «decisión final en Fase 4». **Hoy no es así:** la sesión solo guarda el paso actual, así que al siguiente mensaje sigue en la versión nueva desde ese paso. Si el paso ya no existe, vuelve al saludo. Fijar la versión por sesión necesita una columna en `bot_users` y que el motor cargue esa versión: es una tarea aparte. Recomiendo dejarlo así y documentarlo; los cambios de texto, que son la mayoría, no se notan.
- **D-4.2 · ¿El rollback corre las pruebas?** Hoy solo valida. Las pruebas se escriben para el borrador actual: una versión vieja puede fallarlas con razón, y un rollback es justo para cuando algo salió mal. La especificación dice «pasando por las mismas validaciones». Si se quiere, es una línea en `PublishFlowUseCase.rollback`.
- **D-4.3 · Quién publica.** Publicar y rollback siguen siendo de super_admin. Sigue abierta la pregunta de si un admin_operator puede publicar cambios que solo tocan textos.
