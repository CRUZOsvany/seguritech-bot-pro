# 🎬 TUTORIAL VISUAL: Administrar Todo Desde IntelliJ

## 📌 Tu Situación Actual

```
GitHub (Remoto)
├── main (producción)
└── develop (tu rama principal)

Tu Laptop
└── seguritech-bot-pro/
    └── local
        ├── main
        ├── develop ← TÚ TRABAJAS AQUÍ
        └── feature/* (ramas temporales)
```

---

## 🎯 Paso 1: Abre IntelliJ

```
IntelliJ IDEA
├── Tu proyecto: seguritech-bot-pro
├── File menu
└── VCS menu
```

---

## 🌳 Paso 2: Ve a tu Rama

**EN LA PANTALLA:**
```
Abajo a la derecha, verás esto:

┌─────────────────────┐
│ Git: develop [X]    │ ← Click aquí
│                     │
│ Local Branches:     │
│ ├── develop ✓       │ ← Selecciona
│ ├── main            │
│ ├── plantilla-uno-  │
│ └── feature/bot-base│
│                     │
│ Remote Branches:    │
│ ├── origin/develop  │
│ ├── origin/main     │
│ └── ...             │
└─────────────────────┘
```

**Haz Click en `develop`:**
```
Resultado: Estás en develop ✅
```

---

## 📝 Paso 3: Hacer Cambios

### Editar Archivos:
```
1. Abre archivo en editor
2. Haz cambios
3. Archivo aparece con punto: src/bot.ts •
4. Ctrl + S para guardar
```

### Ver Cambios Antes de Commit:
```
1. Ctrl + K → Se abre "Commit" dialog
2. A la izquierda ves archivos modificados
3. Click en archivo para ver diff
4. Abajo ves cambios en verde/rojo
```

---

## 💾 Paso 4: Hacer Commit

### Opción A: Atajo (RECOMENDADO)
```
1. Presiona: Ctrl + K
2. Se abre "Commit Changes" dialog
3. Verifica archivos a la izquierda
4. Escribe mensaje abajo:
   "feat: descripción clara y corta"
5. Click "Commit and Push" (naranja)
```

### Opción B: Menú
```
VCS (menú) → Commit → OK
```

---

## 📊 Paso 5: Tu Primer Commit - Ejemplo Real

```
┌─────────────────────────────────────────┐
│ Commit Changes (Ctrl + K)               │
├─────────────────────────────────────────┤
│ Files:                                  │
│ ☑ src/bot.ts                           │
│ ☑ src/config/env.ts                   │
│ ☐ node_modules/ (no incluir)           │
├─────────────────────────────────────────┤
│ Commit Message:                         │
│ [feat: add WhatsApp bot connection]    │
├─────────────────────────────────────────┤
│ [ Cancel ]  [ Commit ]  [ C&P ]◄────────┼─ CLICK AQUÍ
│                         (Commit & Push) │
└─────────────────────────────────────────┘
```

**Resultado:**
```
Commit subido a GitHub ✅
Branch: origin/develop actualizado
```

---

## 🔀 Paso 6: Crear Rama para Nueva Funcionalidad

**Método 1: Desde GUI (FÁCIL)**

```
1. Click en rama (abajo derecha)
2. Click "New Branch"
3. Nombre: feature/mi-funcionalidad
4. Base: develop
5. OK

Resultado: Estás en nueva rama
```

**Método 2: Terminal (Alt + F12)**

```bash
git checkout -b feature/descripcion
```

**Resultado:**
```
Ahora ves:
┌──────────────────────┐
│ Git: feature/...  [X]│ ← Cambió el nombre
└──────────────────────┘
```

---

## 📤 Paso 7: Push a GitHub

**Automático:**
```
Ctrl + K → Click "Commit and Push"
```

**Manual (Terminal):**
```bash
Alt + F12
git push origin feature/descripcion
```

**Verificar:**
```
1. Ve a GitHub.com
2. Tu repositorio
3. Verás "Compare & pull request" banner
4. Click ahí
```

---

## 🔀 Paso 8: Mergear en Develop

### OPCIÓN A: Desde GitHub (RECOMENDADO)

```
1. Ve a https://github.com/CRUZOsvany/seguritech-bot-pro
2. Click "Pull requests"
3. Tu PR aparecerá
4. Click "Create Pull Request" (si no existe)
5. Descripción: "Qué cambios hice"
6. Click "Create Pull Request"
7. Click "Squash and merge" (más limpio)
8. Confirma
9. Click "Delete branch" (roja)

Resultado: Cambios en develop ✅
```

### OPCIÓN B: Desde IntelliJ (Terminal)

```bash
git checkout develop
git pull origin develop
git merge feature/descripcion
git push origin develop
git branch -d feature/descripcion
```

---

## 🔄 Paso 9: Sincronizar Entre PCs

### Tu Escritorio hace cambios:
```
Desktop:
1. Ctrl + K → Commit
2. Ctrl + Shift + K → Push
3. Resultado: GitHub actualizado
```

### Tu Laptop obtiene cambios:
```
Laptop:
1. Alt + F12
2. git fetch --all
3. git pull origin develop
4. Resultado: Tienes los cambios

O gráficamente en IntelliJ:
1. VCS → Git → Pull (Ctrl + T)
```

---

## 🎮 RESUMEN DE ATAJOS

| Necesito | Atajo | Alternativa |
|----------|-------|------------|
| Commit | Ctrl + K | VCS → Commit |
| Push | Ctrl + Shift + K | VCS → Git → Push |
| Pull | Ctrl + T | VCS → Git → Pull |
| Ver terminal | Alt + F12 | View → Tool Windows → Terminal |
| Cambiar rama | Click (abajo dcha) | Terminal: `git checkout` |
| Ver historial | VCS → Show Version Control | Click rama → Show History |
| Deshacer cambios | Right click archivo → Revert | Terminal: `git checkout` |

---

## 🚨 Problemas Comunes en IntelliJ

### "No me deja hacer Push"
```
1. VCS → Git → Pull primero
2. Resuelve conflictos si hay
3. VCS → Git → Push
```

### "Tengo conflicto en merge"
```
1. IntelliJ lo detecta
2. Abre "Merge" dialog
3. Elige "Accept Ours" o "Accept Theirs"
4. Ctrl + K → Commit
```

### "Cambios no se ven"
```
1. File → Reload All from Disk
2. O File → Invalidate Caches
3. Reinicia IntelliJ
```

### "Terminal no funciona"
```
Usa Alt + F12
O View → Tool Windows → Terminal
```

---

## 📊 FLUJO DIARIO VISUAL

```
┌─────────────────────────────────────────┐
│ 🌅 MAÑANA                               │
├─────────────────────────────────────────┤
│ 1. Abre IntelliJ                        │
│ 2. Alt + F12                            │
│ 3. git fetch --all                      │
│ 4. git pull origin develop              │
│ 5. Click rama "develop"                 │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│ 💼 DURANTE EL DÍA                       │
├─────────────────────────────────────────┤
│ 1. Edita archivos                       │
│ 2. Ctrl + K (Commit)                    │
│ 3. "feat: descripción"                  │
│ 4. Click "Commit and Push"              │
│ Repite 5-10 veces                       │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│ 🌙 AL TERMINAR                          │
├─────────────────────────────────────────┤
│ 1. Crea Pull Request en GitHub          │
│ 2. Squash and merge                     │
│ 3. Delete branch                        │
│ 4. git pull origin develop (local)      │
│ ¡Listo! 🎉                              │
└─────────────────────────────────────────┘
```

---

## 🎯 Ejemplo Real Paso a Paso

### Quiero agregar una función nueva

**1. Mañana:**
```bash
git fetch --all
git pull origin develop
```

**2. Crear rama:**
```
Click rama (abajo) → New Branch
feature/add-payment-integration
```

**3. Editar archivo src/models/payment.ts:**
```typescript
// ...código...
export class PaymentService {
  // Tu código aquí
}
```

**4. Commit:**
```
Ctrl + K
Mensaje: "feat: add payment service integration"
Click "Commit and Push"
```

**5. Mergear en GitHub:**
```
GitHub → Pull Requests
Click tu PR → Create → Squash and merge → Delete branch
```

**6. Actualizar local:**
```bash
git pull origin develop
```

**RESULTADO:** Tu código está en develop ✅

---

## 📚 Documentación en tu Proyecto

```
Archivo | Propósito
--------|----------
QUICK_START.md | Empezar rápido (5 min)
GIT_MANAGEMENT_GUIDE.md | Guía completa
INTELLIJ_GIT_SETUP.md | Setup en IntelliJ
GITHUB_SETUP_STATUS.md | Estado actual
```

---

**¡Ahora ya sabes administrar todo desde IntelliJ! 🚀**

**Próximo paso: Intenta hacer tu primer commit 💪**

