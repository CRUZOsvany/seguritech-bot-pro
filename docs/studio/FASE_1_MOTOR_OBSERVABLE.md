# Studio — Fase 1: motor observable

> **Fecha:** 2026-09-10 · **Rama:** `feat/studio-fase-1-motor-observable` · **Base:** `main` en `bcfecc7`
>
> Qué cambió, el contrato del endpoint de simulación (lo consume la Fase 3) y
> en qué se aparta de la especificación del Studio.

---

## 1. Qué cambió

**Un solo motor.** La orquestación de `BotController.processMessage` (gates de dueño, opt-out, mantenimiento, pausa por humano, sesión expirada, horario, intérprete y envío) vive ahora en `domain/conversation/ConversationEngine.ts`. Producción y simulador ejecutan ese mismo código; solo cambian los adaptadores:

| Puerto | Producción | Simulación |
|---|---|---|
| Sesiones (`UserRepository`) | `SupabaseUserRepository` (`bot_users`) | `InMemorySessionRepository` |
| Envío (`MessengerPort`) | `NotificationPortMessenger` → `MetaWhatsAppAdapter` | `CapturingMessenger` |
| Reloj (`ClockPort`) | `systemClock` | `FakeClock` (se adelanta con `advance_time`) |
| Ids (`IdGenerator`) | uuid + folio con la hora | `sim-0001`, `SIM-0001`… |
| Auditoría (`AuditPort`) | `admin_audit_log` | `noopAudit` |
| Configuración y catálogo | reales | **reales, solo lectura** |

`BotController` quedó como envoltura: arma el motor con los adaptadores de producción y devuelve el mismo último texto de siempre.

**Payloads exactos por construcción.** El JSON de la Cloud API lo arma una sola función pura, `buildMetaPayload` (`infrastructure/adapters/meta/metaPayloads.ts`), que usan el adaptador real y el simulador. El parser del webhook es ahora la función `parseMetaWebhook`, y el simulador convierte cada evento en un webhook sintético que pasa por ella.

**Traza.** El motor y el intérprete registran por turno el porqué de cada respuesta (§3). Es solo lectura: no altera ninguna decisión.

**Sin cambios de comportamiento en producción.** La suite existente pasa completa (67 suites, 576 tests). Solo se ajustó una aserción: el gate de horario le pasa ahora a `isOpenNow` la hora del reloj del motor como segundo argumento.

---

## 2. Endpoint de simulación

```
POST /api/admin/tenants/:id/studio/flows/:flowId/simulate
```

`requireTenantScope`: un `admin_operator` solo simula su propio tenant. No muta nada, así que no pasa por el audit log.

### Cuerpo

```jsonc
{
  "events": [                     // 1..100
    { "type": "text", "text": "hola" },
    { "type": "button_reply", "id": "btn_0", "title": "🚨 Emergencia" },   // tal como vienen en el payload enviado
    { "type": "list_reply", "id": "svc-engargolado", "title": "Engargolado" },
    { "type": "location", "latitude": 17.55, "longitude": -99.5 },
    { "type": "media", "mediaType": "image" },   // image | audio | video | document | sticker | contacts | reaction
    { "type": "advance_time", "minutes": 180 }
  ],
  "source": "draft",              // 'draft' (default) | 'active'
  "startAt": "2026-09-10T10:00:00-06:00",   // opcional; default: ahora
  "from": "5217471234567"          // opcional; default 5210000000000. Si es el del dueño, aplican sus reglas
}
```

Los eventos usan el vocabulario del webhook de Meta, no uno propio. Para tocar un botón, la interfaz manda el `id` y el `title` que vienen en el payload que el bot envió. El parser real decide qué llega al motor: el título si el id es sintético (`btn_N`) y el id si es una fila o una card.

### Respuesta `200`

```jsonc
{
  "source": "draft", "flowId": "…", "from": "5210000000000", "startAt": "2026-09-10T16:00:00.000Z",
  "turns": [                       // uno por evento
    {
      "at": "2026-09-10T16:00:00.000Z",            // hora simulada al terminar el paso
      "outbound": [
        {
          "to": "5210000000000",
          "audience": "customer",                  // 'customer' | 'owner'
          "payload": { "messaging_product": "whatsapp", "to": "520000000000", "type": "interactive", "…": "…" },
          "rejected": "List inválida: …"           // solo si payload es null: el adaptador real no lo enviaría
        }
      ],
      "trace": [ /* §3 */ ],
      "session": {
        "currentNodeId": "bienvenida", "context": {}, "lastInboundAt": "…",
        "humanPausedUntil": null, "optedOut": false
      },
      "billing": { "serviceMessages": 1, "templates": 0 }
    }
  ]
}
```

`payload.to` va sin el `1` legacy de México (`521…` → `52…`), porque es lo que se manda de verdad. `outbound[].to` conserva el número tal como llegó.

### Errores

| Código | Cuándo |
|---|---|
| 400 | Cuerpo inválido (`error` nombra el campo), o borrador que no pasa el schema (`issues` con el detalle de Zod) |
| 403 | `admin_operator` de otro tenant |
| 404 | El flow no existe para el tenant |
| 409 | `source: 'active'` con un flow que no es el activo |

---

## 3. Pasos de la traza

`domain/conversation/trace.ts`. En orden de aparición típico dentro de un turno:

| `kind` | Qué dice |
|---|---|
| `input` | Lo que el motor recibió, ya traducido por el parser |
| `input_ignored` | El parser descartó el mensaje (audio, imagen…): no hay respuesta (hallazgo H-8) |
| `window` | Se abrió o reinició la ventana de 24 h, y cuándo vence |
| `gate` | Una regla previa al flow decidió el turno o lo dejó pasar: `no_config`, `owner_command`, `opt_out`, `opt_in_implicit`, `human_paused`, `session_expired`, `out_of_hours`, `no_flow` |
| `escape_word` | Palabra de escape global, y si el nodo la manejó localmente |
| `session_start` | El flow arranca desde el inicio: `new`, `ended`, `unknown_node`, `escape_word` |
| `catalog_search` | Qué se buscó en `pos_products` y qué producto salió |
| `validation` | Validación de `wait_input` y su resultado |
| `transitions` | **Todas** las transiciones del nodo, con si coincidieron, su puntaje y la ganadora |
| `no_match` | Ninguna coincidió: se vuelve a mostrar el nodo |
| `context_update` | Cada variable que se guardó (o se limpió) |
| `node_entered` | Cada nodo por el que pasó el turno |
| `auto_skip` | Lista o carrusel vacío: salto al `default` |
| `wait` / `flow_ended` / `dead_end` | Cómo terminó el turno |
| `engine_error` | Ciclo, nodo inexistente o vacío sin `default` |
| `escalation` | Paso a humano: hasta cuándo se silencia el bot y si se avisó al dueño |
| `clock_advanced` | Solo simulación: el reloj se adelantó |

---

## 4. Desvíos respecto a la especificación

| La especificación | Lo que se hizo | Por qué |
|---|---|---|
| `DecisionStep` con `attempt/max`, `ambiguity`, `condition`, `escalation.reason` | Nombres del motor real (§3) | El motor no tiene contador de intentos, desambiguación ni condiciones (ADR del contador sin decidir, B-02, C-02). La traza no inventa conceptos |
| `TurnResult.outbound`: payloads exactos | `{ to, audience, payload }`, y `payload: null` con `rejected` cuando el adaptador real no enviaría | Muestra también lo que producción descartaría, en lugar de ocultarlo |
| `billing: { serviceMessages, templates }` | Cuenta **todos** los mensajes del turno, alerta al dueño incluida; `templates` siempre 0 | El motor no envía plantillas todavía. El cobro de octubre sigue sin confirmarse en la doc oficial (D-6) |
| `SessionRepository` nuevo | Se reutiliza `UserRepository` | Ya era el puerto de sesión; renombrarlo no aportaba nada |
| `HandoffNotifier` | No se creó: la alerta al dueño es un mensaje saliente con `audience: 'owner'` | Hoy es exactamente eso. Dónde deben llegar los avisos es la decisión pendiente 4, y el puerto se diseña con esa respuesta |
| `CatalogPort` | Se usan `CatalogSearchService` y `PosProductRepository`, que ya existían | Mismo motivo |
| `TemplatePort`, `ContactPreferencesRepository` | No se crearon | Son de la Fase 7 |
| Eventos "toque", "selección" | Vocabulario del webhook de Meta (`button_reply`, `list_reply` con id y título) | El evento pasa por el parser real; con otro vocabulario el simulador tendría que reimplementar sus reglas |

---

## 5. Lo que queda pendiente

- **El simulador actual del panel sigue en el camino viejo.** `WhatsAppSimulator.tsx` llama a `POST /api/admin/simulate` → `SimulateMessageUseCase`, que sigue siendo la copia paralela de H-2. El endpoint nuevo lo reemplaza. La interfaz se muda en la Fase 3; al hacerlo, se borran `SimulateMessageUseCase` y su ruta.
- **La paridad se prueba con sesiones en memoria en los dos lados.** No hay base de datos en los tests. La fidelidad del repositorio falso con `bot_users` queda fijada en `simulationFakes.test.ts`, contrastada contra `SupabaseUserRepository` por lectura de código, no contra la base real.
- **Hora de la alerta al dueño** [no verificado]: `enrichOwnerAlert` formatea la hora con la zona del proceso. Si el contenedor corre en UTC, el dueño ve la hora UTC. No se corrigió porque cambiaría lo que recibe hoy; falta confirmar la zona del contenedor en el servidor.
