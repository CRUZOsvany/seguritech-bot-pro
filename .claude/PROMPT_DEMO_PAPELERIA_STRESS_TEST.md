# PROMPT PARA CLAUDE CODE — Bot Demo "Papelería DEMO Stress Test"

> **Compañero de este prompt:** `papeleria_demo_inventario_completo.csv` (110 filas, en la raíz del repo o donde lo copies). Sin ese archivo, la Fase 3 no se puede ejecutar.
>
> **Verificado contra el repo real (rama `main`, commit `7bbe514`, 24-ago-2026) antes de escribir este prompt:** existencia y contrato exacto de `POST /api/admin/tenants`, `PUT/POST .../flows/:flowId/draft|publish`, `POST .../pos/products/import`, `POST/PATCH .../services`, `POST /api/admin/simulate`; contenido exacto de `parsePosCatalogCsv.ts`, `CatalogSearchService.ts`, `ServiceDirectoryMatcher.ts`, `FlowInterpreter.ts`, `TenantConfig` (sin campo `giro` ni `catalogSynonyms` — se agrega en la Fase 5); `SupabasePosProductRepository.search()` busca solo `name`/`sku`/`barcode`, NO `category` ni `description`; `281/281` tests pasando, `tsc --noEmit` limpio; `backend/scripts/papeleria-flow.json` (20 nodos) válido contra `validateFlow()` real. No repito esta auditoría en el prompt — donde algo no está 100% confirmado, lo digo explícitamente y doy instrucciones de verificación en vivo.

---

## 0. Objetivo

Crear un tenant de **demostración** (`Papelería DEMO Stress Test`) con:
1. El **inventario completo** de una papelería real (110 SKUs, 11 categorías, incluye servicios de impresión) cargado vía el importador CSV que ya existe.
2. El **flow de papelería completo** (`papeleria-flow.json`, 20 nodos, ya en `main`) publicado y activo.
3. Un **directorio de servicios heterogéneos** (`tenant_service_directory`) con casos que deliberadamente presionan los límites del motor: acentos, typos, colisión con nombres de producto, preguntas de negocio sin producto.
4. Un **gap real que esta auditoría encontró en el código** cerrado: `FlowInterpreter` nunca pasa el diccionario de sinónimos a `CatalogSearchService.search()`, aunque el servicio ya lo soporta. Sin esto, "desarmador" nunca encontraría "destornillador" ni "libreta" encontraría "cuaderno" — el plan original (`§2.1` de `PLAN_V1_BOT_FLOWS_SIN_IA.md`) lo daba por hecho y no está conectado.
5. Una **batería de conversaciones simuladas** contra `/api/admin/simulate` que ejercita cada caso límite del CSV y del directorio de servicios, con el resultado real documentado (no supuesto).

**Este es un tenant de prueba, no RayCruz.** No toca ningún tenant real existente. Todo lo que se crea aquí es descartable — si algo sale mal, se borra el tenant (cascade por FK) y se reintenta.

---

## 1. Reglas anti-alucinación (específicas de esta tarea)

1. **No inventes IDs.** Todo `tenantId`/`flowId`/`serviceDirectoryId` sale de la respuesta real de la API que acabas de llamar — nunca de un ejemplo de este documento. Los UUIDs de ejemplo aquí son placeholders (`<TENANT_ID>`, `<FLOW_ID>`) — sustitúyelos por lo que la API te devuelva.
2. **No asumas que `template_slug: 'papeleria_v1'` existe en la Supabase Cloud viva.** Existe en `backend/supabase/seed.sql` del repo, pero ese archivo puede no estar aplicado. Verifícalo en Fase 0 con una consulta real; si no existe, usa `'default_v1'` (`es_default = true`, garantizado por el CHECK de la migración 002) — el contenido de la plantilla es irrelevante de cualquier forma, porque la Fase 2 lo sobreescribe antes de que el tenant reciba tráfico.
3. **No mates `HandleMessageUseCase` ni toques ningún archivo fuera del alcance de este prompt.** Fuera de alcance explícito: ferretería, cerrajería, WhatsApp Flows nativo, moldes de POS para otros giros.
4. **`npm test` y `tsc --noEmit` deben quedar en verde antes de cada commit.** Si tocas `FlowInterpreter.ts` en la Fase 5 y algún test existente falla, arréglalo o revierte — no lo dejes en rojo "para después".
5. **La Fase 5 (sinónimos) es un cambio de código real en `domain/` — requiere tests nuevos, no solo el wiring.** No lo marques como hecho sin al menos 3 tests unitarios nuevos que fallen sin el fix y pasen con él.
6. **No captures ni loguees credenciales.** El login para las llamadas curl de abajo se hace interactivamente; el cookie jar (`/tmp/demo-papeleria-cookies.txt`) es local y temporal, bórralo al final si compartes terminal.
7. **Todo lo que declares "hecho" en el Reporte Final debe tener un comando verificable al lado.** Si no corriste el comando, no lo marques como hecho — dilo como pendiente.

---

## FASE 0 — Diagnóstico (nada de código todavía)

Correr y pegar la salida real de cada uno:

```bash
# 0.1 Confirmar rama y estado limpio
git status
git log --oneline -3

# 0.2 Confirmar que el flow de papelería sigue siendo válido tal cual está en main
cd backend
npx ts-node -r tsconfig-paths/register -e "
import { validateFlow } from '@/domain/validators/flowSchema';
import fs from 'fs';
const raw = fs.readFileSync('scripts/papeleria-flow.json','utf-8').replace(/^﻿/,'');
validateFlow(JSON.parse(raw));
console.log('FLOW VALIDO');
"

# 0.3 Suite completa en verde antes de tocar nada
npm test 2>&1 | tail -15
npm run type-check

# 0.4 Confirmar qué templates existen HOY en la Supabase Cloud real (no en el seed.sql local)
# Sustituye <SUPABASE_URL> y <SERVICE_ROLE_KEY> por las env vars reales del .env
curl -s "<SUPABASE_URL>/rest/v1/flow_templates?select=slug,es_default" \
  -H "apikey: <SERVICE_ROLE_KEY>" -H "Authorization: Bearer <SERVICE_ROLE_KEY>"
# → si 'papeleria_v1' NO aparece en el resultado, usa 'default_v1' en la Fase 1.

# 0.5 Confirmar que no existe ya un tenant con este nombre (evitar duplicados en reintentos)
curl -s "<SUPABASE_URL>/rest/v1/tenants?select=id,nombre_negocio&nombre_negocio=eq.Papeler%C3%ADa%20DEMO%20Stress%20Test" \
  -H "apikey: <SERVICE_ROLE_KEY>" -H "Authorization: Bearer <SERVICE_ROLE_KEY>"
```

**Reporta aquí:** ¿existe `papeleria_v1` en Cloud? ¿ya existe el tenant demo (de un intento previo)? Si ya existe, usa su `id` directamente y salta a la fase que corresponda en vez de recrear.

---

## FASE 1 — Login + crear el tenant DEMO (vía API real, no SQL directo)

```bash
# 1.1 Login (interactivo — no pegues la password en el prompt ni en logs)
curl -i -c /tmp/demo-papeleria-cookies.txt -X POST http://127.0.0.1:3001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"TU_EMAIL_SUPER_ADMIN","password":"TU_PASSWORD"}'

# 1.2 Crear el tenant con bot_configuration inline + template bootstrap
# (el contenido del template se sobreescribe en Fase 2 — solo nos da un flowId)
curl -s -b /tmp/demo-papeleria-cookies.txt -X POST http://127.0.0.1:3001/api/admin/tenants \
  -H 'Content-Type: application/json' \
  -d '{
    "nombre_negocio": "Papelería DEMO Stress Test",
    "giro": "papeleria",
    "direccion": "Av. Ejemplo 123, Chilpancingo, Gro.",
    "horario_semana": "09:00-20:00",
    "horario_sabado": "09:00-15:00",
    "abre_domingo": false,
    "bot_configuration": {
      "numero_whatsapp_asignado": "5217471234567",
      "nombre_bot": "Asistente RayCruz",
      "tono_bot": "amigable",
      "mensaje_bienvenida": "¡Hola! 👋 Bienvenido a Papelería DEMO. Estamos para ayudarte.",
      "mensaje_menu_principal": "¿En qué te ayudamos hoy?",
      "mensaje_fuera_horario": "En este momento estamos cerrados. Nuestro horario es Lun-Vie 9am-8pm y Sáb 9am-3pm. Te contestamos apenas abramos 🙌",
      "mensaje_no_entendio": "No entendí eso 🤔 ¿Puedes elegir una opción o escribirlo distinto?",
      "mensaje_confirmacion_pedido": "¡Gracias! Tu pedido quedó registrado."
    },
    "template_slug": "papeleria_v1"
  }'
# Guarda el "id" de la respuesta como <TENANT_ID>. Si el template_slug falló con
# "no encontrado", repite con "default_v1".
```

**Nota sobre `mensaje_fuera_horario`:** este texto es exactamente `outOfHoursMessage`, lo que `BusinessHoursService` + `BotController` disparan cuando `isOpenNow().isOpen === false`. El formato de horario ya es el nuevo `"HH:MM-HH:MM"` que `BusinessHoursService` sabe parsear — no el texto libre viejo.

**Confirma la fila real creada:**
```bash
curl -s -b /tmp/demo-papeleria-cookies.txt http://127.0.0.1:3001/api/admin/tenants/<TENANT_ID> | jq .
curl -s -b /tmp/demo-papeleria-cookies.txt http://127.0.0.1:3001/api/admin/tenants/<TENANT_ID>/flows | jq .
# → anota el flowId del flow recién clonado como <FLOW_ID>
```

---

## FASE 2 — Publicar el flow completo de papelería (draft → publish)

```bash
cd backend

# 2.1 Empujar el JSON real (20 nodos) como draft del flow recién creado
node -e "
const fs = require('fs');
const raw = fs.readFileSync('scripts/papeleria-flow.json','utf-8').replace(/^﻿/,'');
fs.writeFileSync('/tmp/papeleria-draft-body.json', JSON.stringify({ flow: JSON.parse(raw) }));
"

curl -s -b /tmp/demo-papeleria-cookies.txt -X PUT \
  "http://127.0.0.1:3001/api/admin/tenants/<TENANT_ID>/flows/<FLOW_ID>/draft" \
  -H 'Content-Type: application/json' \
  --data @/tmp/papeleria-draft-body.json

# 2.2 Publicar (valida contra flowSchema, versiona, activa) — requiere super_admin
curl -s -b /tmp/demo-papeleria-cookies.txt -X POST \
  "http://127.0.0.1:3001/api/admin/tenants/<TENANT_ID>/flows/<FLOW_ID>/publish" \
  -H 'Content-Type: application/json' \
  -d '{"note":"Flow completo de papelería (20 nodos) — tenant demo stress test"}'
# → si devuelve 400 con "issues", el flow tiene un problema real de schema — repórtalo,
#   no lo fuerces. (No debería pasar: ya se validó en Fase 0.2.)
```

---

## FASE 3 — Cargar el inventario completo (CSV)

El CSV (`papeleria_demo_inventario_completo.csv`, 110 filas) tiene 11 categorías reales de papelería + 12 filas de casos límite marcadas con SKU `EDGE-*`, cada una documentada en el propio archivo (columna `description`) y en la sección 4 de este prompt.

```bash
# 3.1 Dry-run primero — SIEMPRE. No mutar nada hasta ver el preview.
curl -s -b /tmp/demo-papeleria-cookies.txt -X POST \
  "http://127.0.0.1:3001/api/admin/tenants/<TENANT_ID>/pos/products/import" \
  -F "file=@papeleria_demo_inventario_completo.csv" \
  -F "dryRun=true" | jq .
# Esperado: {"created":110,"updated":0,"errors":[]}

# 3.2 Import real
curl -s -b /tmp/demo-papeleria-cookies.txt -X POST \
  "http://127.0.0.1:3001/api/admin/tenants/<TENANT_ID>/pos/products/import" \
  -F "file=@papeleria_demo_inventario_completo.csv" \
  -F "dryRun=false" | jq .
# Esperado: {"created":110,"updated":0,"errors":[]}

# 3.3 Confirmar en BD real, no solo confiar en la respuesta del endpoint
curl -s "<SUPABASE_URL>/rest/v1/pos_products?tenant_id=eq.<TENANT_ID>&select=count" \
  -H "apikey: <SERVICE_ROLE_KEY>" -H "Authorization: Bearer <SERVICE_ROLE_KEY>" \
  -H "Prefer: count=exact"
```

**Activar el servicio POS y el servicio WhatsApp** (FSM de `tenant_services` exige `draft → configuring → active`, no permite saltar):

```bash
for SERVICE in whatsapp_bot pos; do
  curl -s -b /tmp/demo-papeleria-cookies.txt -X POST \
    "http://127.0.0.1:3001/api/admin/tenants/<TENANT_ID>/services" \
    -H 'Content-Type: application/json' \
    -d "{\"serviceType\":\"$SERVICE\"}"
  curl -s -b /tmp/demo-papeleria-cookies.txt -X PATCH \
    "http://127.0.0.1:3001/api/admin/tenants/<TENANT_ID>/services/$SERVICE" \
    -H 'Content-Type: application/json' -d '{"status":"configuring"}'
  curl -s -b /tmp/demo-papeleria-cookies.txt -X PATCH \
    "http://127.0.0.1:3001/api/admin/tenants/<TENANT_ID>/services/$SERVICE" \
    -H 'Content-Type: application/json' -d '{"status":"active"}'
done
```

**Owner WhatsApp para `escape_to_human`** — no hay endpoint admin para `owner_data` todavía (gap conocido, fuera de alcance arreglarlo aquí). Único paso con SQL directo de todo el prompt, mismo patrón que `seed-cerrajerias.ts`:

```sql
-- Ejecutar en el SQL Editor de Supabase (o vía script con SERVICE_ROLE_KEY)
insert into public.owner_data (tenant_id, whatsapp_dueno)
values ('<TENANT_ID>', '5217479999999')
on conflict (tenant_id) do update set whatsapp_dueno = excluded.whatsapp_dueno;
```

---

## FASE 4 — Directorio de servicios heterogéneos (casos límite deliberados)

No hay importador CSV para `tenant_service_directory` (solo CRUD uno-a-uno en el panel/API) — se siembra vía `POST /api/admin/tenants/:id/service-directory` en loop. Estas entradas están diseñadas para presionar exactamente los mecanismos que auditamos: `fuzzyIncludes` (acentos + Levenshtein distancia 1) y el **orden de precedencia real** en el nodo `buscar` (`catalog_found` se evalúa antes que `service_directory_match` — confirmado leyendo `FlowInterpreter.ts:170-207` y el orden de `transitions` en `papeleria-flow.json`).

```bash
ENTRIES='[
  {"nombre":"Métodos de pago","keywords":["aceptan tarjeta","tarjeta","aceptan tarjetas","pago con tarjeta"],"respuesta":"Aceptamos efectivo, tarjeta y transferencia 💳","precio":null},
  {"nombre":"Envíos a domicilio","keywords":["hacen envios","envio a domicilio","mandan a domicilio","reparten"],"respuesta":"Sí, hacemos envío a domicilio dentro de Chilpancingo. El costo varía según la zona.","precio":40},
  {"nombre":"Factura / CFDI","keywords":["facturan","factura","cfdi","necesito factura"],"respuesta":"Por el momento no facturamos, pero te damos tu nota de venta con todos los datos.","precio":null},
  {"nombre":"WiFi para clientes","keywords":["tienen wifi","hay wifi","internet"],"respuesta":"Sí, tenemos WiFi gratis para clientes en tienda 📶","precio":null},
  {"nombre":"Estacionamiento","keywords":["hay estacionamiento","donde me estaciono","parking"],"respuesta":"Tenemos 3 cajones justo frente al negocio.","precio":null},
  {"nombre":"Horario de temporada escolar","keywords":["horario en agosto","horario regreso a clases","abren mas tarde en agosto"],"respuesta":"En agosto extendemos horario: Lun-Sáb 8am-9pm por temporada de regreso a clases.","precio":null},
  {"nombre":"EDGE — colisión deliberada con producto real","keywords":["cuaderno"],"respuesta":"[NO DEBERÍA VERSE NUNCA — si un cliente pregunta por \"cuaderno\" debe ganar catalog_found (PAP-0001/0002/0003) porque va primero en las transitions del nodo buscar. Si este texto aparece en una simulación, es un bug real de precedencia, repórtalo.]","precio":null},
  {"nombre":"EDGE — typo/acento deliberado en respuesta simulada","keywords":["aceptan tarjeta"],"respuesta":"(duplicado intencional de la entrada #1 para probar que ServiceDirectoryMatcher.match() devuelve SIEMPRE la primera entrada activa que matchea, en el orden del arreglo — ver test ya existente `ServiceDirectoryMatcher.test.ts`)","precio":null}
]'

echo "$ENTRIES" | jq -c '.[]' | while read -r entry; do
  curl -s -b /tmp/demo-papeleria-cookies.txt -X POST \
    "http://127.0.0.1:3001/api/admin/tenants/<TENANT_ID>/service-directory" \
    -H 'Content-Type: application/json' -d "$entry"
  echo
done
```

**Nota sobre la entrada #7 (colisión con "cuaderno"):** esto NO es un error de captura, es intencional — sembramos una entrada del directorio que compite por la misma palabra que un producto real. La Fase 6 tiene el caso de prueba exacto para confirmar en vivo que gana el catálogo, no el directorio.

---

## FASE 5 — Cerrar el gap real: sinónimos por giro no llegan a `CatalogSearchService`

**Verificado, no supuesto:** `FlowInterpreter.ts` línea ~166 llama:
```ts
catalogMatch = await this.catalogSearchService.search(user.tenantId, message.content.trim());
```
`CatalogSearchService.search()` acepta un tercer parámetro opcional `synonyms: CatalogSynonyms` — nunca se lo pasan. Resultado real: si un cliente escribe "libreta" y el producto en catálogo se llama "Cuaderno...", **no hay match**, aunque el plan V1 (`§2.1`) asumía que esto ya funcionaba vía "diccionario de sinónimos por giro". El diccionario nunca se escribió ni se conectó.

### 5.1 Diccionario de sinónimos de papelería (nuevo archivo, Molde — no Core)

```typescript
// backend/src/domain/moulds/papeleria.synonyms.ts
import type { CatalogSynonyms } from '@/domain/services/CatalogSearchService';

/**
 * Alias léxico → término canónico, papelería (§3.2 / §2.1 del plan V1 —
 * PLAN_V1_BOT_FLOWS_SIN_IA.md). Cierra el gap real encontrado en la auditoría
 * de 2026-08-24: CatalogSearchService.search() acepta synonyms pero
 * FlowInterpreter nunca lo pasaba.
 *
 * Solo mapea a un término que SÍ existe como palabra en algún `name` real
 * del catálogo (ver papeleria_demo_inventario_completo.csv) — un sinónimo
 * que apunta a nada no sirve de nada.
 */
export const PAPELERIA_SYNONYMS: CatalogSynonyms = {
  libreta: 'cuaderno',
  boligrafo: 'pluma',
  bolígrafo: 'pluma',
  marcador: 'plumon',
  plumon: 'plumón',
  borrador: 'goma',
  tajador: 'sacapuntas',
  afilador: 'sacapuntas',
  folder: 'folder',
  carpeta: 'carpeta',
  copias: 'fotocopia',
  impresiones: 'impresión',
  mochilas: 'mochila',
  calculadora: 'calculadora',
};
```

### 5.2 Exponer el diccionario correcto vía `TenantConfig` (por `giro`, no por nombre de tenant)

```typescript
// backend/src/domain/entities/index.ts — agregar al final de TenantConfig:
export interface TenantConfig {
  // ...todo lo existente sin tocar...
  /**
   * Sinónimos léxicos para search_catalog, resueltos por giro del tenant
   * (§2.1 plan V1 — gap cerrado 2026-08-24). Vacío = búsqueda solo por
   * nombre real, comportamiento actual sin regresión.
   */
  catalogSynonyms: CatalogSynonyms;
}
```

Import `CatalogSynonyms` desde `@/domain/services/CatalogSearchService` en ese mismo archivo.

### 5.3 Resolver el diccionario por `giro` en `SupabaseTenantConfigService`

```typescript
// backend/src/infrastructure/services/SupabaseTenantConfigService.ts
// (mismo archivo donde hoy se arma el objeto TenantConfig completo, con
// cache de 5 min — busca dónde se construye el retorno y agrega esto)

import { PAPELERIA_SYNONYMS } from '@/domain/moulds/papeleria.synonyms';
import type { CatalogSynonyms } from '@/domain/services/CatalogSearchService';

const SYNONYMS_BY_GIRO: Record<string, CatalogSynonyms> = {
  papeleria: PAPELERIA_SYNONYMS,
  // ferreteria / cerrajeria: pendiente (fuera de alcance de este prompt,
  // ver §3.1 y §3.3 de PLAN_V1_BOT_FLOWS_SIN_IA.md) — {} por ahora, sin
  // romper nada: CatalogSearchService ya soporta synonyms={} como default.
};

function resolveCatalogSynonyms(giro: string | null | undefined): CatalogSynonyms {
  return SYNONYMS_BY_GIRO[giro ?? ''] ?? {};
}

// Dentro de la función que arma TenantConfig, donde ya tienes `tenant.giro`
// disponible (viene de la fila de `tenants`), agrega:
//   catalogSynonyms: resolveCatalogSynonyms(tenant.giro),
```

**Nota de implementación:** busca el punto EXACTO donde hoy se construye el objeto `TenantConfig` en `SupabaseTenantConfigService.ts` — no reescribas el archivo completo, es un solo campo nuevo en un objeto que ya se arma con `serviceDirectory`, `horarioSemana`, etc. Verifica con `grep -n "serviceDirectory:" src/infrastructure/services/SupabaseTenantConfigService.ts` para ubicar el bloque exacto.

### 5.4 Pasar el diccionario en `FlowInterpreter.ts`

```typescript
// backend/src/domain/services/FlowInterpreter.ts, línea ~166 — reemplazar:
//
//   catalogMatch = await this.catalogSearchService.search(user.tenantId, message.content.trim());
//
// por:
      catalogMatch = await this.catalogSearchService.search(
        user.tenantId,
        message.content.trim(),
        tenantConfig.catalogSynonyms,
      );
```

### 5.5 Tests nuevos obligatorios (mínimo 3, deben fallar sin el fix)

```typescript
// backend/src/tests/unit/CatalogSearchService.synonyms.test.ts (nuevo archivo)
// o agregar describe() al CatalogSearchService.test.ts existente:
//
// 1. "libreta" con PAPELERIA_SYNONYMS debe encontrar un producto llamado
//    "Cuaderno..." — falla hoy sin el fix, pasa después.
// 2. FlowInterpreter con tenantConfig.catalogSynonyms={} (tenant sin giro
//    mapeado) debe comportarse IGUAL que antes del cambio — no regresión.
// 3. SupabaseTenantConfigService: tenant con giro='papeleria' debe traer
//    catalogSynonyms === PAPELERIA_SYNONYMS; giro='cerrajeria' (u otro sin
//    entrada en SYNONYMS_BY_GIRO) debe traer {} — no undefined, no throw.
```

Después de escribir el código y los tests:
```bash
npm test 2>&1 | tail -20
npm run type-check
# Ambos deben quedar en verde. Si algún test PREEXISTENTE de FlowInterpreter
# o SupabaseTenantConfigService rompe por el campo nuevo, es porque construye
# un TenantConfig a mano en el test sin el campo — agrégalo ahí también
# (catalogSynonyms: {}), no lo hagas opcional en la interfaz para evitarlo.
```

---

## FASE 6 — Batería de conversaciones límite (`/api/admin/simulate`)

`persist:false` en todas — son simulaciones, no deben crear `bot_users`/`messages` reales. El `state` se encadena manualmente entre turnos (el endpoint es stateless por llamada; `nextNodeId`/`context` de la respuesta anterior son el `state` del siguiente).

```bash
SIM() {
  curl -s -b /tmp/demo-papeleria-cookies.txt -X POST http://127.0.0.1:3001/api/admin/simulate \
    -H 'Content-Type: application/json' \
    -d "$1"
}

# CASO 1 — Producto exacto, camino feliz completo
SIM '{"tenantId":"<TENANT_ID>","phoneNumber":"5210000000001","content":"hola","persist":false}'
# → toma nextNodeId/context de la respuesta y pásalos como "state" en la
#   siguiente llamada, encadenando: botón "buscar" → "cuaderno profesional" → "agregar" → "3" → "correcto"

# CASO 2 — Typo + acento sobre keyword de servicios ("impresion" sin acento vs "impresión")
SIM '{"tenantId":"<TENANT_ID>","phoneNumber":"5210000000002","content":"necesito una impresion","persist":false}'
# Esperado: matchea el keyword del nodo bienvenida (values incluye "impresion" e "impresión")
#   → menu_servicios

# CASO 3 — Búsqueda de producto SIN STOCK (EDGE-NOSTOCK-01, stock_qty=0)
#   Encadenar: bienvenida → botón "buscar" → contenido "cuaderno edicion limitada"
# Esperado observado en la respuesta real: el bot SÍ lo ofrece (search() no
#   filtra por stock_qty). Documenta el output tal cual salga — esto es
#   evidencia del gap, no algo que debas "arreglar" para que parezca bonito.

# CASO 4 — Nombre con 3 caracteres exactos (EDGE-SHORTNAME-01 "USB")
#   Encadenar: bienvenida → "buscar" → contenido "usb"
# Esperado: normalizeText("usb").length === 3, es la frase completa (no una
#   palabra tokenizada descartada por <3 chars) — debe SÍ encontrar el
#   producto porque la frase completa se prueba primero en extractSearchTerms.

# CASO 5 — Colisión deliberada: "cuaderno" existe como keyword de
#   service_directory (Fase 4, entrada #7) Y como producto real.
#   Encadenar: bienvenida → "buscar" → contenido "cuaderno"
# Esperado (para confirmar la precedencia real del código, no la supuesta):
#   debe devolver el PRODUCTO (catalog_found → buscar_encontrado), NUNCA el
#   texto de la entrada #7 del directorio. Si sale el texto de la entrada
#   #7, hay un bug real de orden de evaluación — repórtalo con el output
#   completo, no lo ignores.

# CASO 6 — Pregunta de negocio pura, sin producto (service_directory)
SIM '{"tenantId":"<TENANT_ID>","phoneNumber":"5210000000006","content":"aceptan tarjeta","state":{"currentNodeId":"buscar"},"persist":false}'
# (asumiendo que ya lo llevaste manualmente a currentNodeId="buscar" en un
#  turno previo, o arranca desde bienvenida y navega ahí primero)
# Esperado: matched_service_response de la entrada #1, NO escala a humano
#   directo — la respuesta ya resuelve la pregunta en el flow.

# CASO 7 — Fuera de horario (requiere correr esto realmente fuera de 09:00-20:00,
#   o mockear temporalmente; documenta la hora real a la que corriste la prueba)
SIM '{"tenantId":"<TENANT_ID>","phoneNumber":"5210000000007","content":"hola","persist":false}'
# Esperado si corre fuera de horario: mensaje_fuera_horario en vez del flow normal.

# CASO 8 — Sinónimo "libreta" (requiere Fase 5 completada)
#   Encadenar: bienvenida → "buscar" → contenido "libreta profesional"
# Esperado DESPUÉS de la Fase 5: encuentra un Cuaderno Profesional real.
# Esperado ANTES de la Fase 5 (para comparar, documenta ambos): catalog_not_found.

# CASO 9 — Producto no existe en absoluto
#   Encadenar: bienvenida → "buscar" → contenido "impresora laser nueva"
# Esperado: catalog_not_found → buscar_no_encontrado → escape_to_human, con
#   owner_alert_template incluyendo el texto exacto "impresora laser nueva".
```

Para cada caso, pega el `outputs` real de la respuesta (no lo resumas) en el Reporte Final.

---

## Criterios de aceptación

```bash
# Todos deben salir en verde/exitoso antes de dar por cerrado el prompt.

npm test 2>&1 | tail -5              # debe seguir en 100% (281 + los nuevos de Fase 5)
npm run type-check                    # 0 errores

grep -rn "catalogSynonyms" backend/src/domain/entities/index.ts \
  backend/src/domain/services/FlowInterpreter.ts \
  backend/src/infrastructure/services/SupabaseTenantConfigService.ts
# debe aparecer en los 3 archivos

curl -s -b /tmp/demo-papeleria-cookies.txt \
  "http://127.0.0.1:3001/api/admin/tenants/<TENANT_ID>" | jq '.tenant.status'
# tenant debe existir y responder 200

curl -s "<SUPABASE_URL>/rest/v1/pos_products?tenant_id=eq.<TENANT_ID>&select=count" \
  -H "apikey: <SERVICE_ROLE_KEY>" -H "Authorization: Bearer <SERVICE_ROLE_KEY>" \
  -H "Prefer: count=exact"
# debe reportar 110

curl -s "<SUPABASE_URL>/rest/v1/tenant_service_directory?tenant_id=eq.<TENANT_ID>&select=count" \
  -H "apikey: <SERVICE_ROLE_KEY>" -H "Authorization: Bearer <SERVICE_ROLE_KEY>" \
  -H "Prefer: count=exact"
# debe reportar 8

curl -s -b /tmp/demo-papeleria-cookies.txt \
  "http://127.0.0.1:3001/api/admin/tenants/<TENANT_ID>/flows/<FLOW_ID>/versions" | jq '.versions | length'
# debe ser >= 1 (el publish de Fase 2 creó una versión)
```

---

## REPORTE FINAL (llenar literalmente, sin resumir)

```markdown
## Reporte — Bot Demo Papelería Stress Test

**Fecha:** ___
**tenantId:** ___
**flowId:** ___
**Template usado en Fase 1:** papeleria_v1 | default_v1 (tachar el que no aplique)

### Fase 0 — Diagnóstico
- npm test antes de empezar: ___/___ passing
- tsc --noEmit antes de empezar: limpio | errores (pegar cuáles)
- flowSchema validó papeleria-flow.json: SÍ | NO (pegar error si NO)
- papeleria_v1 existe en Cloud: SÍ | NO

### Fase 1-3 — Tenant + flow + inventario
- Tenant creado: SÍ | NO (pegar respuesta completa)
- Publish del flow: versionNumber = ___
- Import CSV dry-run: created=___ updated=___ errors=___
- Import CSV real: created=___ updated=___ errors=___
- Conteo real en pos_products (query directa): ___
- tenant_services whatsapp_bot: draft→configuring→active confirmado (SÍ/NO)
- tenant_services pos: draft→configuring→active confirmado (SÍ/NO)
- owner_data.whatsapp_dueno seteado: SÍ | NO

### Fase 4 — Directorio de servicios
- Entradas creadas: ___/8
- IDs reales: (pegar lista)

### Fase 5 — Gap de sinónimos cerrado
- Archivos tocados: (lista real de paths)
- Tests nuevos: ___ (nombres literales)
- npm test después del cambio: ___/___ passing
- tsc --noEmit después del cambio: limpio | errores

### Fase 6 — Casos límite (pegar el `outputs` REAL de cada uno, no resumido)
1. Camino feliz completo: ___
2. Typo/acento en "impresión": ___
3. Producto sin stock (EDGE-NOSTOCK-01) — ¿el bot lo ofreció igual?: ___
4. Nombre de 3 chars "USB": ___
5. Colisión "cuaderno" — ¿ganó el producto o el directorio?: ___
6. Pregunta de negocio pura ("aceptan tarjeta"): ___
7. Fuera de horario (hora real de la prueba: ___): ___
8. Sinónimo "libreta" ANTES de Fase 5: ___ / DESPUÉS de Fase 5: ___
9. Producto inexistente → escalación a humano: ___

### Hallazgos NO pedidos explícitamente pero encontrados en el camino
(cualquier cosa rara que haya salido al simular — repórtala aunque no estuviera en la lista de casos)

### Pendiente / no se pudo verificar
(sé honesto — mejor un pendiente marcado que un "hecho" sin evidencia)
```
