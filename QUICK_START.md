# ⚡ QUICK START - 5 Minutos para Empezar

## 🎯 Objetivo
Administrar tu repositorio GitHub sin conflictos, desde múltiples máquinas, todo controlado desde IntelliJ.

---

## ⏰ PASO 1: AHORA (2 minutos)

### En PowerShell:
```powershell
# Descarga GitHub CLI
# Ve a: https://cli.github.com/ y descárgalo

# O usa este comando (si tienes Chocolatey):
choco install gh

# Luego autentica:
gh auth login
# Selecciona: GitHub.com → HTTPS → Autoriza en navegador
```

**Resultado**: GitHub sabe quién eres ✅

---

## ⏰ PASO 2: AHORA + 1 MINUTO (1 minuto)

### En IntelliJ (Alt + F12):
```bash
git checkout develop
git push origin develop -u
```

**Resultado**: Tu rama develop está en GitHub ✅

---

## ⏰ PASO 3: AHORA + 3 MINUTOS (2 minutos)

### En IntelliJ:

1. Click en la rama (abajo a la derecha)
2. Click en `develop`
3. Espera a que cambie

**Resultado**: Estás trabajando en develop ✅

---

## 📊 VERIFICAR

### En IntelliJ (Alt + F12):
```bash
git branch -a
```

Deberías ver:
```
* develop
  main
  remotes/origin/develop
  remotes/origin/main
```

---

## 🚀 AHORA SÍ: FLUJO DIARIO

### Cada mañana:
```bash
git fetch --all
git pull origin develop
```

### Hacer cambios:
1. Creas rama: `feature/mi-cambio`
2. Haces cambios
3. Commit: `feat: descripción`
4. Push: `git push origin feature/mi-cambio`

### Terminar:
1. GitHub: Click "Compare & pull request"
2. Click "Create Pull Request"
3. Click "Squash and merge"
4. Click "Delete branch"

---

## 🎮 ATAJOS MÁS IMPORTANTES

| Necesito | Hazlo |
|----------|-------|
| Abrir terminal | Alt + F12 |
| Hacer commit | Ctrl + K |
| Ver todas las ramas | Click en rama (abajo dcha) |
| Cambiar de rama | Click en rama → selecciona |
| Ver cambios antes de commit | Ctrl + Shift + K |
| Ver historial | VCS → Show Version Control |

---

## 🆘 PROBLEMAS RÁPIDOS

### "No puedo hacer push"
```bash
git fetch --all
git pull origin develop
git push origin feature/rama
```

### "Tengo conflicto"
- IntelliJ → VCS → Git → Resolve
- Elige la versión correcta
- Commit y push

### "Quiero deshacer cambios"
```bash
git checkout .
```

### "Quiero deshacer último commit"
```bash
git reset --soft HEAD~1
```

---

## 📱 MÚLTIPLES PCs

**PC 1 (Desktop)** → Push cambios
```bash
git push origin feature/cambio
```

**PC 2 (Laptop)** → Obtener cambios
```bash
git fetch --all
git checkout feature/cambio
git pull origin feature/cambio
```

---

## ✅ CHECKLIST AHORA

- [ ] Descargar e instalar GitHub CLI
- [ ] `gh auth login`
- [ ] `git checkout develop`
- [ ] `git push origin develop -u`
- [ ] Verificar ramas con `git branch -a`
- [ ] Leer INTELLIJ_GIT_SETUP.md (referencia completa)

---

## 🎉 ¡LISTO!

**Tu repositorio está configurado. Ahora:**

1. Abre IntelliJ
2. Alt + F12 para terminal
3. Sigue el "Flujo Diario" arriba
4. ¡Listo para trabajar!

---

## 📚 SI NECESITAS MÁS

- **Workflow completo**: Lee `GIT_MANAGEMENT_GUIDE.md`
- **Setup en IntelliJ**: Lee `INTELLIJ_GIT_SETUP.md`
- **Status del repositorio**: Lee `GITHUB_SETUP_STATUS.md`

---

**¿Preguntas? Revisa los archivos .md en el proyecto** 📖

