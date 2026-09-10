# CLAUDE.md — punto de entrada

Contexto para cualquier sesión de agente que abra este repo. Léelo entero antes de tocar nada; son dos minutos y evitan reconstruir el proyecto desde cero.

## Qué es esto

**SegurITech Bot Pro** — plataforma propietaria (no SaaS público) que opera bots de WhatsApp y punto de venta para negocios locales de Chilpancingo, Guerrero. Modelo MSP: el cliente final nunca toca un panel, solo ve resultados en su WhatsApp. Solo el equipo interno opera el sistema.

## Qué leer, en este orden

| Documento | Responde |
|---|---|
| `.claude/SEGURITECH_PROYECTO_MAESTRO.md` | Qué es, por qué está así, ADRs, reglas, flujo de trabajo |
| `.claude/SEGURITECH_ESTADO_ACTUAL.md` | Cómo está hoy, con verificación real. Deuda y decisiones abiertas |
| `.claude/SEGURITECH_ROADMAP_OPERATIVO.md` | Qué sigue y en qué orden |

Referencia, se consultan cuando aplica:

- `.claude/REGLAS_FLOW.md` — las 36 reglas que validan un flow, con archivo:línea, repartidas en cuatro capas que no se contienen entre sí
- `.claude/BLOQUES_COMPUESTOS.md` — los seis bloques que el operador arma en vez de nodos sueltos
- `.claude/CONTRATOS_API_ADMIN.md` — shapes reales de `/api/admin/*`. Varios difieren de lo que parece obvio
- `.claude/AUDITORIA_2026-08-26_TRACKING.md` — registro de decisiones DEC-01…DEC-14, cerrado
- `.claude/PLAN_V1_BOT_FLOWS_SIN_IA.md` — diseño del motor de flows por giro
- `.claude/SEGURITECH_AI_SECRETARIA_PLAN.md` — plan de IA, **pausado** (ADR-015)
- `.claude/TABLERO_2026-09-08.md` — instantánea fechada para tomar decisiones ([versión navegable](https://claude.ai/code/artifact/80ed138c-0158-46f1-915b-c351a7222d74))
- `docs/INDEX.md` — documentación técnica
- `docs/deployment/RUNBOOK_PRODUCCION.md` — despliegue

**Jerarquía:** si dos documentos se contradicen, gana el código de `main`. Entre documentos: el `ESTADO` manda sobre estado, el `MAESTRO` sobre arquitectura y decisiones.

## Arquitectura en diez líneas

Monorepo npm con dos workspaces. `backend/` es Node + TypeScript estricto + Express 5, arquitectura hexagonal — `domain/` no importa de `infrastructure/`, y un import que apunte hacia afuera desde domain es un bug. `frontend/` es Vite + React 19 + TanStack + shadcn/ui, se compila a `backend/public/app/` y lo sirve el mismo Express: una URL, una cookie, cero CORS. Supabase Postgres es la única persistencia. El núcleo del producto es `FlowInterpreter`: ejecuta un grafo de nodos JSON por tenant sin tocar código, con 14 tipos de nodo y transiciones resueltas por especificidad.

## Reglas que no se rompen

1. `npm install` solo desde la raíz.
2. Nunca `supabase db reset` contra Cloud.
3. Credenciales interactivas. Nunca en prompts, nunca en logs.
4. `BACKEND_API_KEY` y demás secretos nunca llegan al browser.
5. `META_TOKEN_ENCRYPTION_KEY` no se rota jamás.
6. `NODE_ENV` no se lee desde domain, solo desde `config/env.ts`.
7. Toda mutación bajo `/api/admin/*` va al audit log.
8. Toda migración mergeada se aplica y **se verifica** el mismo día.
9. `tenantId` siempre, como primer argumento. Tabla nueva sin `tenant_id` + RLS no se mergea.
10. El cliente final no toca el panel. Nunca.

La lista completa, con el porqué de cada una, está en el MAESTRO §6.

## Cómo se trabaja aquí

- Una tarea, una rama corta (`feat/` `fix/` `chore/` `docs/`), un PR pequeño. Se borra la rama al mergear.
- Conventional commits. `main` protegida: PR obligatorio y CI en verde.
- Un caso de uso, un archivo, un test. Sin test en el mismo commit, no está hecho.
- **Verifica antes de afirmar.** Este proyecto ya pagó el costo de reportes que describían ramas y hallazgos sin abrirlos; una descripción incorrecta casi provoca un merge que habría revertido meses de trabajo. Un hallazgo sin evidencia se marca como no verificado, no se redondea a hecho.
- **Nunca inventes una firma de puerto o entidad.** Ábrela primero. Si el método no existe, es tarea nueva a diseñar, no algo que "seguro está en otro lado".

## Comandos

```bash
npm install                                   # siempre desde la raíz
npm run dev                                   # backend en 127.0.0.1:3001
npm test                                      # suite completa del backend
npm run type-check --workspace backend
npm run type-check --workspace frontend
npm run build                                 # frontend build:panel + backend build
npm run lint
```

Panel React en `/app/`, panel HTML legacy en `/panel/`, simulador en `/simulator/<uuid>`, webhook en `/webhook`, salud en `/health`.

## Entorno

Desarrollo en Windows con Git Bash y en Fedora. El servicio corre hoy en Docker sobre un servidor Ubuntu de la LAN; el VPS con dominio público sigue pendiente. El CLI de Supabase no está enlazado, así que las migraciones se pegan a mano en el SQL Editor.

**Trampa conocida:** `curl` desde Git Bash contra endpoints con acentos corrompe UTF-8 si usas `-d '...'` inline. Escribe el JSON a un archivo y usa `--data-binary @archivo.json`.
