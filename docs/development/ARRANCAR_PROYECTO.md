# Cómo arrancar el proyecto en local

> Guía verificada el 2026-06-05 (Windows 11 + PowerShell). Dos formas de
> levantarlo. Ambas sirven el panel bajo **`/app`** (el router usa basepath
> `/app` y Vite compila con `base: '/app/'`).

## Requisitos

- **Node 22** + **npm 9+**, monorepo con npm workspaces (`backend`, `frontend`).
- `backend/.env` configurado (Supabase Cloud, secretos). No se versiona.
- Credenciales de un **admin** para hacer login en el panel.

## Setup (una sola vez)

Siempre desde la **raíz** del repo. NO uses `--prefix` ni entres a `backend/` o
`frontend/`: rompe la resolución de workspaces (`No workspaces found`).

```powershell
cd C:\Users\micho\IdeaProjects\seguritech-bot-proprueba
npm ci
```

---

## Forma A — Integrada (recomendada para usar/demostrar)

Igual que producción: un solo proceso, un solo origen, cookie real. El backend
sirve el panel **ya compilado** desde `backend/public/app`.

```powershell
# 1) Compilar el frontend → backend/public/app  (repetir tras CADA cambio de frontend)
npm run build:panel --workspace frontend

# 2) Levantar el backend (API + panel)
npm run dev --workspace backend
```

Abrir: **http://127.0.0.1:3001/app**

Login → entrar a un tenant → pestaña **WhatsApp** → botón **“Abrir Bot Designer”**.

- **Sin hot-reload:** si tocas el frontend, repite `build:panel` y refresca el navegador.
- El backend en dev también abre un **CLI interactivo del bot** en la terminal
  (prompt `Tú:`). Es normal — el servidor HTTP corre en paralelo. Ignóralo y usa
  el navegador. Para detener todo: **Ctrl+C**.

---

## Forma B — Vite con hot-reload (recomendada para desarrollar frontend)

Dos terminales. Vite recarga al instante y proxya `/api` al backend.

```powershell
# Terminal 1 — backend (API en 3001). NECESARIO: Vite proxya /api aquí.
npm run dev --workspace backend
```
```powershell
# Terminal 2 — frontend con HMR (Vite en 5173)
npm run dev --workspace frontend
```

Abrir: **http://localhost:5173/app/**  ← el `/app` importa (basepath del router).

---

## Detener

- En cada terminal: **Ctrl+C**.
- Si quedó un proceso huérfano, liberar por puerto:

```powershell
Get-NetTCPConnection -LocalPort 3001 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
Get-NetTCPConnection -LocalPort 5173 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

---

## Troubleshooting

| Síntoma | Causa / arreglo |
|---|---|
| **Pantalla en blanco** en `/app`, consola con `404` de `/assets/...` | El build se hizo sin `base: '/app/'`. Verifica que `frontend/vite.config.ts` tenga `base: '/app/'` y vuelve a `build:panel`. Los assets deben referenciarse como `/app/assets/...`. |
| `No workspaces found: --workspace=...` | Estás usando `npm --prefix` o corriendo desde una subcarpeta. Corre npm **desde la raíz**, sin `--prefix`. |
| El designer muestra “Asigna un molde primero” | Ese tenant no tiene flow con draft. Es el estado vacío esperado (A2.1). Asigna un molde desde la pantalla WhatsApp o usa un tenant que ya tenga bot. |
| `EADDRINUSE :3001` / `:5173` | Puerto ocupado por un proceso anterior. Mátalo con el bloque de “Detener”. |
| Cambié frontend y no se refleja (Forma A) | Falta `npm run build:panel --workspace frontend` + refrescar. Forma A sirve el bundle estático, no el código fuente. |

## Comandos útiles

```powershell
npm run type-check --workspace frontend   # tsc del front
npm run type-check --workspace backend    # tsc del back
npm run lint --workspace frontend
npm test --workspace backend              # suite Jest del back
```
