# 🚀 Guía de Administración Git desde IntelliJ

## 📋 Estado Actual del Proyecto
- **Rama Principal**: `plantilla-uno-`
- **Estado**: Limpio y sincronizado
- **Repositorio**: https://github.com/CRUZOsvany/seguritech-bot-pro

---

## 🎯 Flujo de Trabajo Recomendado

### 1️⃣ Estructura de Ramas

```
main (rama de producción - NO tocar directamente)
├── develop (rama de desarrollo principal)
├── feature/* (características nuevas)
└── hotfix/* (correcciones urgentes)
```

### 2️⃣ Pasos para Hacer cambios desde IntelliJ

#### A. Crear una rama para nueva funcionalidad:
```bash
git checkout develop
git pull origin develop
git checkout -b feature/descripcion-corta
```

**En IntelliJ:**
1. Click en la rama (abajo a la derecha)
2. → "New Branch"
3. Nombre: `feature/descripcion-corta`
4. Seleccionar "develop" como base

---

#### B. Hacer commits (lo correcto):
```bash
git add archivo1.ts archivo2.ts
git commit -m "feat: descripción clara y corta"
git push origin feature/descripcion-corta
```

**En IntelliJ:**
1. Click derecho en archivo → "Git" → "Add"
2. Ctrl+K para abrir "Commit"
3. Escribir mensaje en formato: `feat:` `fix:` `docs:` etc.
4. Click "Commit and Push"

---

#### C. Mergear cambios:
1. Push tu rama a GitHub
2. Crea Pull Request en GitHub
3. Revisa cambios
4. Click "Squash and merge" (más limpio)
5. Delete rama remota

**En IntelliJ (opcional):**
- Click en rama → "Delete" (después de merge en GitHub)

---

## 🔧 Comandos Git desde Terminal en IntelliJ

### Ver Estado:
```bash
git status
```

### Ver Historial:
```bash
git log --oneline -10
```

### Sincronizar:
```bash
git fetch --all
git pull origin develop
```

### Deshacer cambios locales (CUIDADO):
```bash
git checkout .
```

### Deshacer commit sin perder cambios:
```bash
git reset --soft HEAD~1
```

### Cambiar rama:
```bash
git checkout nombre-rama
```

---

## 📱 Evitar Conflictos

### ✅ SIEMPRE:
1. Pullear antes de hacer cambios: `git pull origin develop`
2. Hacer ramas separadas para cada funcionalidad
3. Hacer commits pequeños y frecuentes
4. Escribir mensajes claros

### ❌ NUNCA:
1. Trabajar directamente en `main` o `develop`
2. Hacer git force push (a menos que sepas qué haces)
3. Mezclar muchos cambios en un commit
4. Subir sin testear

---

## 🛠️ En IntelliJ: Acceso Rápido a Git

### Terminal integrada:
- Click en "Terminal" abajo o `Alt + F12`
- Aquí ejecutas todos los comandos Git

### Interfaz Gráfica:
- **VCS** (menú principal) → todas las opciones Git
- **Ctrl + K** → Commit
- **Ctrl + Shift + K** → Push
- Click en rama (abajo derecha) → cambiar ramas

---

## 📌 Pasos si Tienes Conflictos

1. **En IntelliJ**: VCS → Git → Pull
2. Si hay conflicto, te mostrará los archivos
3. Click derecho → "Resolve"
4. Elige versión o mezcla manual
5. Commit los cambios

---

## 🔄 Sincronizar Múltiples Máquinas

### Máquina 1 (escritorio):
```bash
git add .
git commit -m "feat: cambios importantes"
git push origin feature/rama
```

### Máquina 2 (otro PC):
```bash
git fetch --all
git checkout feature/rama
git pull origin feature/rama
```

---

## ✨ Mejor Práctica: Flujo Limpio

1. **Iniciar**: `git checkout -b feature/mi-funcionalidad`
2. **Desarrollar**: Varios commits pequeños
3. **Terminar**: `git push origin feature/mi-funcionalidad`
4. **Crear PR** en GitHub
5. **Mergear** en develop
6. **Eliminar rama** remota

---

## 📚 Recursos Útiles

- [Git Documentation](https://git-scm.com/doc)
- [GitHub Flow Guide](https://guides.github.com/introduction/flow/)
- [IntelliJ Git Help](https://www.jetbrains.com/help/idea/using-git-integration.html)

