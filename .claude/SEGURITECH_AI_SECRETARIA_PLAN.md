# SegurITech Bot Pro — Plan de Implementación: Secretaria Digital Semi-Autónoma

> **Propósito.** Documento operativo para que Claude Code (u otro agente de codificación) desarrolle esta evolución sin inventar arquitectura, sin alucinar interfaces que no existen, y sin duplicar lo que el proyecto ya resuelve.
>
> **Fuente de verdad.** El código de `main` manda sobre este documento. Cada referencia de "ya existe" en este plan fue verificada línea por línea contra el repo real antes de escribirse. Si algo cambió desde entonces, gana el código — pero antes de asumir que cambió, ábrelo y confírmalo.
>
> **Relación con otros documentos del repo.** Este plan es específico de la evolución "secretaria digital". No repite el estado operativo general (Supabase, VPS, Meta, dominio) — eso vive en `.claude/SEGURITECH_ESTADO_ACTUAL.md` y `docs/deployment/RUNBOOK_PRODUCCION.md`. **No empieces la Fase 1 de este plan si esos bloqueadores siguen abiertos** — construir sobre un Supabase que no resuelve DNS es trabajo que se tira.

---

## 0. Reglas no negociables (leer antes de escribir una sola línea)

Estas reglas existen porque un agente de codificación sin ellas tiende a "completar" interfaces que no existen, porque estadísticamente *deberían* existir. En este repo, no lo hagas.

1. **Nunca inventes una firma de puerto o entidad.** Antes de usar `UserRepository`, `TenantConfigPort`, `NotificationPort`, `BotFlowRepository`, `AuditPort`, `TenantServiceRepository`, o cualquier entidad (`User`, `TenantConfig`, `TenantGiro`, `TenantService`), ábrelos primero:
   - `backend/src/domain/ports/index.ts`
   - `backend/src/domain/ports/TenantRepository.ts`
   - `backend/src/domain/ports/TenantServiceRepository.ts`
   - `backend/src/domain/entities/index.ts`

   Si un método que necesitas no está ahí, **es una tarea nueva que hay que diseñar y anotar en este plan**, no un método que "seguro ya existe en otro lado".

2. **Un caso de uso, un archivo, un test.** Sigue el patrón exacto de `backend/src/domain/use-cases/SimulateMessageUseCase.ts` y su test en `backend/src/tests/unit/SimulateMessageUseCase.test.ts`. Ninguna pieza de dominio nueva se marca "hecha" sin su test unitario en el mismo commit.

3. **`tenantId` siempre, como primer argumento.** Sin excepción, replicando el patrón ya usado en `UserRepository` y `NotificationPort`. Cualquier tabla nueva sin `tenant_id` + RLS no se mergea.

4. **La IA nunca escribe directo a Supabase ni genera SQL.** El Orquestador IA solo puede invocar clases de `domain/use-cases/` (existentes o nuevas de este plan) a través del `AgentTool` que las envuelve. Nunca un repositorio directo, nunca una query armada en el momento.

5. **Definition of Done real, no percibida:**
   ```
   npm run type-check && npm run lint && npm test
   ```
   Si algo de esto falla, la tarea no está terminada, sin importar qué tan bien se vea funcionando a mano.

6. **Sigue la convención de trazabilidad ya en uso.** El código actual anota decisiones con referencias tipo `(P4, D4)`, `Sprint 6`, `ADR-012` (ver comentarios en `BotController.ts`). Cada decisión de arquitectura nueva de este plan debe anotarse igual — si `docs/adr/` no existe, créala, y agrega un ADR corto por decisión (ejemplo: "ADR-014: aislamiento de tenant en la base de conocimiento" — el `SEGURITECH_PROYECTO_MAESTRO.md` ya usa ADR-013 para "test cases del designer son gate de publicación", así que el siguiente número libre es 014, no 013).

7. **No asumas infraestructura que no está confirmada.** `pgvector` no está verificado como habilitado en el proyecto Supabase actual — es lo primero que se confirma en la Fase 1, no un supuesto.

---

## 1. Tesis del producto

El bot no debe quedarse en un árbol de flows. Debe evolucionar a una **secretaria digital semi-autónoma** para WhatsApp que:

- entiende mensajes libres, no solo botones y listas,
- usa flows donde el control y la trazabilidad importan más que la flexibilidad,
- consulta conocimiento real del negocio antes de responder,
- ejecuta acciones validadas en el backend — nunca acciones "sueltas" del modelo,
- escala a un humano cuando hay riesgo, ambigüedad, o el cliente lo pide.

Modelo mental:

**Flows = esqueleto. IA = cerebro. Herramientas = manos.**

Los flows no se eliminan — se reducen a lo que ya hacen mejor que cualquier LLM: onboarding, captura estructurada de datos, confirmaciones, y el camino de fallback cuando todo lo demás falla.

---

## 2. Estado real verificado del código (`main`)

### 2.1 Lo que ya existe — con ubicación exacta

| Pieza | Archivo | Detalle relevante |
|---|---|---|
| Entrada única de mensaje | `app/controllers/BotController.ts` | `processMessage(tenantId, from, content, metaMessageId)`. Ya tiene un gate previo al `FlowInterpreter` (paso 1.5, comandos del dueño) — **este es el patrón a replicar para el enrutador de intención**, no uno nuevo. |
| Motor determinista | `domain/services/FlowInterpreter.ts` | `execute({ flow, user, message, tenantConfig })` → `InterpreterOutput` |
| Estado de conversación | `domain/entities/index.ts` → `User` | `currentNodeId`, `context: Record<string, unknown>`, `humanPausedUntil: Date \| null` |
| Config por tenant | `domain/entities/index.ts` → `TenantConfig` | incluye `ownerPhone`, mensajes por defecto, `catalog` |
| Giro del negocio | `domain/ports/TenantRepository.ts` → `TenantGiro` | **ya tipado**: `ferreteria \| papeleria \| cerrajeria \| pizzeria \| salon \| medico \| refaccionaria \| farmacia \| otro`. El punto "contexto de negocio" del análisis original no es una pieza nueva — es usar este campo, que ya vive en el tenant. |
| Servicios contratables por tenant | `domain/ports/TenantServiceRepository.ts` → `TenantService` | `serviceType: 'whatsapp_bot' \| 'messenger_bot' \| 'pos'`, con `config: Record<string, unknown>` libre y una FSM de status (`draft→configuring→active→paused→archived`). **Este es el mecanismo correcto para feature-flaggear el agente por tenant** — no crear una tabla nueva de flags. |
| Handoff humano | `User.humanPausedUntil` + `UserRepository.setHumanHandoff/listPaused` | TTL configurable por `HANDOFF_PAUSE_MINUTES` |
| Auditoría | `domain/ports/index.ts` → `AuditPort.log({ actorLabel, action, targetType?, targetId?, metadata? })` | **ya existe.** El punto "observabilidad" del análisis original no es una pieza nueva — es reusar este puerto para las decisiones del agente. |
| Envío de mensajes | `domain/ports/index.ts` → `NotificationPort` | Ya soporta texto, botones, listas, imagen, ubicación, documento, CTA URL, carrusel, reacciones, WhatsApp Flows. El Orquestador IA **no necesita un canal nuevo** — reusa este puerto tal cual. |
| Aislamiento multi-tenant | patrón `tenantId` en todos los puertos + RLS en migraciones | verificado en `SupabaseUserRepository.ts` y equivalentes |
| Migraciones | `supabase/migrations/001..017` | última: `017_human_handoff_pause.sql` → las nuevas empiezan en `018_` |
| Tests | `tests/unit/`, `tests/integration/` (Jest) | `npm test`, `npm run test:integration`, `npm run test:multiTenant` como ejemplo de test dirigido a un feature |
| Codegen de tipos Supabase | script `supabase:types` en `package.json` | correr después de cada migración nueva: `npm run supabase:types` |

### 2.2 Lo que NO existe — gap real, no supuesto

- Ningún SDK de IA en `package.json` (no hay `ANTHROPIC_API_KEY` en `backend/.env.example`)
- Ninguna tabla de conocimiento/embeddings en las 17 migraciones actuales
- No hay `IntentRouterPort`, `AgentOrchestrator`, ni `ToolRegistry` en el código
- No hay tablas de agenda/citas ni de tareas/recordatorios
- `pgvector` no está confirmado habilitado en el proyecto Supabase — **verificar en la Fase 1, no asumir**

---

## 3. Arquitectura objetivo, anclada al código real

### 3.1 Dónde se inserta el enrutador — el patrón ya existe

`BotController.processMessage` ya resuelve exactamente este problema una vez: interceptar un mensaje ANTES del `FlowInterpreter` cuando aplica una regla especial (paso 1.5, comandos del dueño). El `IntentRouter` se inserta como un paso equivalente, después de cargar el flow (paso 3 actual) y antes de ejecutarlo (paso 4 actual):

```typescript
// Pseudocódigo de referencia — Claude Code debe adaptarlo al código real de
// BotController.ts, no copiarlo literal. El objetivo es mostrar DÓNDE entra,
// no el código final.

// 3. (ya existe) cargar bot_flow activo → flow

// 3.5. NUEVO — mismo patrón que el gate de comandos del dueño (paso 1.5)
if (flow && this.intentRouter) {
  const route = await this.intentRouter.classify({ message, user, tenantConfig: config });

  if (route === 'agent' && this.agentOrchestrator) {
    return this.agentOrchestrator.handle({ tenantId, from, message, user, tenantConfig: config });
  }
  // route === 'flow' → sigue exactamente el camino actual (paso 4), intacto
  // route === 'human' → reusa el mismo mecanismo de handoff que ya existe
  //                      (userRepository.setHumanHandoff), no uno nuevo
}

// 4. (ya existe, sin tocar) this.flowInterpreter.execute(...)
```

**Nota de diseño:** `intentRouter` y `agentOrchestrator` se inyectan por constructor, igual que los demás puertos del `BotController` actual (ver su constructor real). Nunca se instancian dentro de la clase — eso rompería el patrón hexagonal que ya sigue todo el archivo.

### 3.2 Contratos de los puertos nuevos

A definir en `domain/ports/index.ts`, con el mismo estilo de JSDoc que ya usa el archivo (explicando *por qué*, no solo *qué*):

```typescript
/**
 * Clasifica si un mensaje debe resolverse por flow determinista, por el
 * orquestador IA, o por escalamiento directo a humano. Debe responder
 * rápido (objetivo <300ms) y barato — usar un modelo pequeño (Haiku),
 * nunca el mismo modelo que usa el orquestador para razonar.
 */
export interface IntentRouterPort {
  classify(input: {
    message: Message;
    user: User;
    tenantConfig: TenantConfig;
  }): Promise<'flow' | 'agent' | 'human'>;
}

/**
 * Conocimiento del negocio, recuperable por similaridad semántica.
 * CRÍTICO: toda implementación debe filtrar por tenant_id en la query de
 * base de datos, nunca en post-filtrado en memoria después de traer
 * resultados de varios tenants. Ver ADR-014.
 */
export interface KnowledgeBaseRepository {
  search(tenantId: string, query: string, limit?: number): Promise<KnowledgeChunk[]>;
  upsert(tenantId: string, chunks: KnowledgeChunk[]): Promise<void>;
}

export interface KnowledgeChunk {
  id: string;
  tenantId: string;
  content: string;
  sourceType: 'manual' | 'catalog' | 'faq';
  metadata?: Record<string, unknown>;
}

/**
 * Una herramienta invocable por el Orquestador IA. Cada implementación
 * DEBE envolver un caso de uso de domain/use-cases/ ya existente o nuevo
 * en este plan — nunca un repositorio directo, nunca SQL armado en el
 * momento. Ver regla 4 de la sección 0.
 */
export interface AgentTool {
  name: string;
  description: string;
  /** JSON schema — se pasa tal cual al tool use de la API de Claude. */
  inputSchema: Record<string, unknown>;
  execute(tenantId: string, input: unknown): Promise<AgentToolResult>;
}

export interface AgentToolResult {
  ok: boolean;
  data?: unknown;
  error?: string;
}
```

### 3.3 Migraciones nuevas propuestas (siguiente número libre: `018`)

Antes de escribir cualquiera de estas, lee `supabase/migrations/001_full_schema.sql` completo para copiar el estilo exacto de RLS e índices ya en uso — no inventes una convención distinta a la del resto del proyecto.

- **`018_tenant_knowledge_base.sql`** — tabla `tenant_knowledge_chunks` (`id`, `tenant_id` FK, `content`, `embedding vector`, `source_type`, `metadata jsonb`, `created_at`) + índice `ivfflat` + RLS por `tenant_id`. Primer paso real: confirmar `create extension if not exists vector;` funciona en el proyecto Supabase actual.
- **`019_agent_tool_calls.sql`** — tabla `agent_tool_calls` (`id`, `tenant_id`, `user_phone`, `tool_name`, `input jsonb`, `output jsonb`, `success bool`, `created_at`). Esto complementa `AuditPort` (que ya existe) con el detalle específico de qué herramienta se llamó y con qué resultado — no lo reemplaza.
- **`020_agenda_citas.sql`** — tabla `appointments` (`id`, `tenant_id`, `phone`, `service`, `scheduled_at`, `status` enum, `reminder_sent_at`, `created_at`).

Después de cada migración: `npm run supabase:types` para regenerar `src/infrastructure/services/supabase.types.ts` — no editar ese archivo a mano.

### 3.4 Feature flag por tenant — reusar lo que ya existe

No crear una tabla ni columna nueva para "¿este tenant tiene el agente activo?". `TenantService.config` ya es `Record<string, unknown>` sobre el `serviceType: 'whatsapp_bot'` existente. Guardar ahí `{ agentEnabled: boolean, agentPhaseUnlocked: 'faq' | 'agenda' | 'full' }` es suficiente y no requiere migración nueva ni tocar `TenantServiceRepository`.

---

## 4. Guardrails — ejecutables, no solo principios

| Regla | Cómo se verifica en code review |
|---|---|
| La IA no inventa precios ni datos del negocio | Toda respuesta del agente que mencione precio, horario o disponibilidad debe venir de un `KnowledgeChunk` recuperado o de un `AgentTool`, nunca de texto libre generado sin fuente |
| La IA no confirma acciones sin validar | Cada `AgentTool.execute` que mute datos (agendar, cancelar, crear tarea) revalida las precondiciones (¿el horario sigue libre?, ¿el tenant existe?) dentro del caso de uso — nunca confía en que el modelo ya lo revisó |
| Nunca se mezcla conocimiento entre tenants | Todo `KnowledgeBaseRepository.search` incluye `tenant_id` en la cláusula `WHERE`/`match` de la query vectorial, no en un filtro posterior en JS |
| Timeout obligatorio | Llamada al modelo con timeout corto (2-3s); si expira, cae a una respuesta de reserva o al flow — el bot nunca se queda mudo esperando al modelo |
| Sin SQL dinámico | `grep -r "supabase.rpc\|\.from(" ` sobre el código del agente no debe aparecer fuera de las implementaciones de `KnowledgeBaseRepository` y los repositorios ya existentes |

---

## 5. Fases con Definition of Done verificable

### Fase 0 — Prerrequisito de infraestructura (no es trabajo de este plan)

Bloqueada por: Supabase confirmado sano + runbook de despliegue mergeado (ver `.claude/SEGURITECH_ESTADO_ACTUAL.md`). No arrancar Fase 1 sin esto — construir sobre infraestructura inestable es trabajo que se descarta.

### Fase 1 — Enrutador + conocimiento (solo lectura, cero mutaciones)

Alcance deliberadamente angosto: el agente puede *responder*, no puede *hacer* nada todavía.

| Ticket | Entregable | DoD |
|---|---|---|
| 1.1 | ✅ Confirmar `pgvector` disponible + migración `018` | `create extension vector` corre sin error; test de insertar y buscar un chunk de prueba pasa — **CUMPLIDO 2026-08-19.** Verificado contra Supabase Cloud (`aakbliewttiuqhyfyqwn`) vía REST API con `service_role`: tabla `tenant_knowledge_chunks` ya existe con el esquema exacto de la migración 018 (columnas + `embedding vector(1024)`); smoke test real: insert de un chunk con embedding de 1024 dims → 201, búsqueda filtrada por `id`+`tenant_id` → 200 con los datos correctos, delete de limpieza → 204. `docs/adr/ADR-014` (aislamiento por tenant_id) sigue pendiente de crear antes de escribir código que use esta tabla (regla 6, §0). Pendiente opcional: `npm run supabase:types` requiere `supabase link` (login interactivo) o Docker local — el CLI (`npx supabase`, v2.115.0) sí funciona desde Git Bash, pero falla vía PowerShell por policy de ejecución de scripts. |
| 1.2 | ✅ `IntentRouterPort` + implementación con Haiku | Test unitario con mensajes reales de un tenant piloto (papelería, cerrajería) clasificando correctamente flow vs. agente — **CUMPLIDO 2026-08-20.** `IntentRouterPort` en `domain/ports/index.ts`; `AnthropicIntentRouter` en `infrastructure/adapters/` (fetch directo a la API de Messages con `tool_choice` forzado a `classify_intent`, sin SDK — mismo patrón que `MetaWhatsAppAdapter`). 10 tests unitarios (`AnthropicIntentRouter.test.ts`) con mensajes reales de papelería y cerrajería + los 5 guardrails del §4 (sin key, error HTTP, timeout, red caída, tool_use inválido → siempre `'flow'`). `npm run type-check && npm run lint && npm test` limpio (153 passed, 0 failed, 0 errores de lint). Smoke test contra la API real de Anthropic: la key autentica correctamente, pero **la cuenta no tiene crédito** (`400 invalid_request_error: credit balance too low`) — hasta que se cargue crédito en console.anthropic.com/settings/billing, cualquier llamada real cae al guardrail `'flow'` (verificado que ESE fallback funciona bien, no es un bug). **NO wireado a `BotController` todavía** — eso es el gate de la Fase 1.4, deliberadamente fuera de este ticket. |
| 1.3 | `KnowledgeBaseRepository` + carga de conocimiento por tenant | Endpoint admin (siguiendo el patrón de `infrastructure/server/admin`) para cargar/editar conocimiento; test de aislamiento entre dos tenants distintos |
| 1.4 | Gate 3.5 en `BotController`, detrás del flag `agentEnabled` (§3.4) | Con el flag apagado, cero cambio de comportamiento — test de regresión sobre `multiTenantFlow.test.ts` sigue en verde |
| 1.5 | Prueba end-to-end en un tenant piloto real | Demo funcionando vía `/simulator` respondiendo una pregunta libre con datos reales del negocio |

**DoD de la fase completa:** los 5 tickets con test verde, `npm run type-check && npm run lint && npm test` limpio, flag apagado por defecto en producción.

### Fase 2 — Herramientas con mutación (agenda, tareas)

| Ticket | Entregable |
|---|---|
| 2.1 | Migración `020_agenda_citas.sql` |
| 2.2 | Casos de uso `CreateAppointmentUseCase`, `CancelAppointmentUseCase`, `RescheduleAppointmentUseCase` en `domain/use-cases/`, cada uno con su test — siguiendo el patrón de `CreateTenantUseCase.ts` |
| 2.3 | `AgentTool` que envuelve cada caso de uso anterior (§3.2) + registro en `agent_tool_calls` (migración `019`) |
| 2.4 | Guardrail de doble validación: el tool revisa disponibilidad real antes de confirmar, nunca confía en lo que dijo el modelo |
| 2.5 | Recordatorios: job que consulta `appointments` próximas y llama `NotificationPort.sendMessage` — reusa el puerto existente, no un canal nuevo |

### Fase 3 — Secretaria digital completa

Seguimiento proactivo, captura de leads, cola de handoff con prioridad (extiende `listPaused` ya existente), notas internas para el dueño.

### Fase 4 — Autonomía incremental

Solo después de tener datos reales de uso de las fases anteriores: qué acciones se repiten sin pedir confirmación, dónde el agente se equivoca, qué reglas del giro (`TenantGiro`) hacen falta. No se diseña en abstracto — se diseña con los `agent_tool_calls` reales como evidencia.

---

## 6. Preguntas abiertas — con default explícito

Para que el agente no se quede bloqueado esperando respuesta humana, cada pregunta trae un default razonable que puede usar si nadie decide antes:

| Pregunta | Default si no se decide |
|---|---|
| ¿Qué acciones son autónomas vs. piden confirmación? | Todo lo que mute datos (agendar, cancelar) pide confirmación explícita del cliente en el mismo hilo de WhatsApp hasta la Fase 4 |
| ¿Qué datos son editables por panel vs. por ingesta automática? | Panel únicamente hasta que exista un flujo de ingesta con revisión humana |
| ¿Qué fuentes externas se conectan primero? | Ninguna fuera de Supabase hasta cerrar Fase 2 — evita acoplar el proyecto a una integración externa antes de tener el core sólido |
| ¿Qué fallos requieren fallback inmediato? | Cualquier error del modelo o timeout → cae al flow o a handoff humano, nunca a silencio |
| ¿Qué métricas definen calidad? | Tasa de resolución sin escalar, tiempo de respuesta, y tasa de error en `agent_tool_calls` — medibles desde el día 1 de la Fase 1 |

---

## 7. Checklist anti-alucinación por ticket

Pegar esto en cada ticket antes de marcarlo listo:

- [ ] Abrí el puerto/entidad real antes de usarlo (puedo citar el archivo y la línea)
- [ ] `tenantId` es el primer argumento en todo método nuevo
- [ ] No hay SQL crudo generado dinámicamente por el modelo
- [ ] La herramienta nueva llama a un caso de uso existente o creado en este mismo ticket — nunca a un repositorio directo
- [ ] Hay test unitario y, si aplica, de integración
- [ ] `npm run type-check && npm run lint && npm test` pasan limpios
- [ ] Si la acción muta datos: hay guardrail de validación server-side antes de confirmar al cliente
- [ ] Si cambia arquitectura: hay un ADR corto en `docs/adr/`

---

## 8. Orden recomendado de implementación

1. Confirmar `pgvector` + migración `018` (Fase 1.1)
2. `IntentRouterPort` (Fase 1.2)
3. `KnowledgeBaseRepository` + carga por tenant (Fase 1.3)
4. Gate en `BotController` detrás de flag (Fase 1.4)
5. Piloto real en al menos un tenant (Fase 1.5)
6. Recién entonces: agenda, tareas, y el resto de Fase 2 en adelante

No saltar al Orquestador IA completo antes de tener el enrutador y el conocimiento funcionando con datos reales de un cliente piloto — es la diferencia entre diseñar con evidencia y diseñar adivinando.
