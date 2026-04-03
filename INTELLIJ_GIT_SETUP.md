# ⚙️ Configuración de IntelliJ para Git

## 🔐 Paso 1: Configurar Credenciales GitHub en IntelliJ

### Windows (Recomendado: GitHub CLI)

1. Descarga GitHub CLI: https://cli.github.com/
2. Abre PowerShell y ejecuta:
   ```bash
   gh auth login
   # Selecciona: GitHub.com
   # Luego: HTTPS
   # Authorize with your GitHub credentials
   ```

### Alternativa: Token de Acceso Personal

1. Ve a GitHub → Settings → Developer settings → Personal access tokens
2. Crea un nuevo token con permisos: `repo`, `read:user`
3. En IntelliJ:
   - File → Settings → Version Control → GitHub
   - Click "+"
   - Pega tu token
   - Click "Log In"

---

## 🌳 Paso 2: Configurar Ramas en IntelliJ

### Crear rama `develop` (rama principal de desarrollo)

1. **En Terminal (Alt + F12)**:
   ```bash
   git checkout -b develop main
   git push origin develop
   ```

2. **En IntelliJ**:
   - Click en la rama (abajo derecha)
   - Click "develop"
   - Ahora trabajas en develop

---

## 📝 Paso 3: Flujo Diario desde IntelliJ

### Morning Routine (al empezar el día)

```bash
# En Terminal de IntelliJ (Alt + F12)
git fetch --all
git pull origin develop
```

O **Gráficamente**:
- VCS → Git → Pull (Ctrl + Shift + K)

---

### Trabajar en Nueva Funcionalidad

**Crear rama**:
1. Click en la rama (abajo derecha) → "New Branch"
2. Nombre: `feature/descripcion` (ej: `feature/add-payment`)
3. Base: `develop`
4. OK

**Hacer cambios y commits**:
1. Edita los archivos
2. Ctrl + K (Commit) o VCS → Commit
3. Selecciona los archivos
4. Mensaje: `feat: descripción clara` (ver convención abajo)
5. Click "Commit and Push"

**Convención de Mensajes**:
```
feat:    nueva funcionalidad
fix:     bug fix
docs:    cambios de documentación
style:   cambios sin lógica (espacios, formato)
refactor: refactorización de código
test:    agregar tests
chore:   cambios en configuración
```

Ejemplo:
```
feat: add user authentication system
fix: resolve memory leak in bot connection
docs: update installation guide
```

---

## 🔀 Paso 4: Mergear Cambios (Pull Request)

### Opción A: Desde GitHub Web (RECOMENDADO)

1. Haz push de tu rama: `git push origin feature/mi-rama`
2. Ve a GitHub.com
3. Te verá un banner "Compare & pull request"
4. Click en él
5. Describe los cambios
6. Click "Create Pull Request"
7. Espera aprobación (si trabajas solo, auto-aprueba)
8. Click "Squash and merge"
9. Confirma
10. Click "Delete branch"

### Opción B: Desde IntelliJ (Terminal)

```bash
git checkout develop
git pull origin develop
git merge feature/mi-rama
git push origin develop
git branch -d feature/mi-rama
```

---

## 🚨 Paso 5: Si Tienes Conflictos

### En IntelliJ (Gráficamente)

1. Click en rama con conflicto
2. VCS → Git → Merge Changes
3. IntelliJ marca los conflictos
4. Click derecho → "Resolve"
5. Elige "Accept Yours", "Accept Theirs" o mezcla manual
6. Commit los cambios

### En Terminal

```bash
# Ver conflictos
git status

# Abrir archivo, buscar: <<<<<<<, =======, >>>>>>>
# Editar manualmente, guardar
git add archivo-editado.ts
git commit -m "fix: resolve merge conflict"
git push origin develop
```

---

## 🔄 Paso 6: Sincronizar Múltiples PCs

### PC 1 (Escritorio):
```bash
git add .
git commit -m "feat: importante cambio"
git push origin feature/mi-rama
```

### PC 2 (Laptop):
```bash
git fetch --all
git checkout feature/mi-rama
git pull origin feature/mi-rama
```

⚠️ **IMPORTANTE**: Siempre `fetch` y `pull` antes de empezar a trabajar

---

## 📊 Paso 7: Ver Historial de Cambios

### En IntelliJ:

- **VCS → Show Version Control**
- Click en archivo → "Git" → "Show History"
- O click en rama → "Show History"

### En Terminal:

```bash
git log --oneline -20          # Últimos 20 commits
git log --graph --oneline -20  # Con diagrama de ramas
git diff HEAD~1                # Ver cambios del último commit
```

---

## 🛡️ Paso 8: Deshacer Cambios (Si metiste la pata)

### Si NO has hecho push:

```bash
git reset --soft HEAD~1   # Deshace commit, mantiene cambios
git reset --hard HEAD~1   # Deshace commit Y cambios ⚠️
```

### Si YA hiciste push:

```bash
git revert HEAD            # Crea un nuevo commit que revierte cambios
git push origin nombre-rama
```

### Si no has commiteado (solo cambios locales):

```bash
git checkout .            # Descarta todos los cambios
```

---

## 📋 Checklist Diario

- [ ] `git fetch --all` (antes de trabajar)
- [ ] Crear rama: `feature/descripcion`
- [ ] Cambios pequeños y commits frecuentes
- [ ] Mensaje de commit claro
- [ ] `git push origin feature/descripcion`
- [ ] Crear Pull Request en GitHub
- [ ] Mergear con "Squash and merge"
- [ ] Eliminar rama remota

---

## 🎯 Problemas Comunes

### "Your branch is ahead of 'origin/main'"

```bash
git pull origin main
```

### "Changes not staged for commit"

```bash
git add .
git commit -m "commit message"
```

### "fatal: cannot read ref refs/heads/rama"

```bash
git fetch --all --prune
git branch -a
```

### "Auto merge failed; fix conflicts then commit"

Ver Paso 5 arriba.

---

## 💡 Tips & Tricks

1. **Ver cambios antes de commit**: Ctrl + Shift + K (diff)
2. **Cambiar entre ramas rápido**: Alt + Tilde (`)
3. **Stash de cambios temporales**: `git stash` y `git stash pop`
4. **Ver quién cambió una línea**: Click en línea → "Git" → "Blame"
5. **Revertir a un commit anterior**: Click en commit → "Reset Current Branch Here"

---

## 🚀 Workflow Recomendado para Tu Proyecto

```
1. Mañana:
   - git fetch --all
   - git pull origin develop

2. Durante el día:
   - Crear rama: feature/cambio
   - Hacer commits pequeños
   - Push cada 2-3 horas

3. Al terminar:
   - git push origin feature/cambio
   - Crear Pull Request
   - Mergear a develop

4. Noche:
   - Verificar que todo esté en GitHub
```

---

**¡Con esto deberías poder administrar todo desde IntelliJ sin problemas! 🎉**

