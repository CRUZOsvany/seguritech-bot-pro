## 🧹 LIMPIEZA FINAL - Comandos para Ejecutar DESPUÉS de Cerrar IDE

**Situación**: La carpeta `securitech-bot-pro` está bloqueada por procesos de Node.js/IDE

**Solución**: Ejecutar estos comandos una vez cerrado completamente el IDE

---

## PASO 1: Cerrar IDE (OBLIGATORIO)

### Si usas VS Code:
```powershell
taskkill /F /IM code.exe
```

### Si usas IntelliJ/WebStorm/Rider:
```powershell
taskkill /F /IM "idea64.exe"
# O para versión 32-bit:
taskkill /F /IM "idea.exe"
```

### Cerrar TODAS las terminales y procesos Node:
```powershell
taskkill /F /IM node.exe
taskkill /F /IM npm.cmd
```

**Esperar 3-5 segundos después de ejecutar.**

---

## PASO 2: Limpiar Carpetas Bloqueadas

### Cambiar a directorio seguro (Desktop):
```powershell
cd C:\Users\micho\Desktop
```

### Eliminar `securitech-bot-pro` (INCEPTION):
```powershell
Remove-Item -Path "C:\Users\micho\IdeaProjects\seguritech-bot-proprueba\securitech-bot-pro" -Recurse -Force -ErrorAction Stop
Write-Host "✅ securitech-bot-pro eliminada"
```

### Eliminar `.temp_subcarpeta` (backup temporal):
```powershell
Remove-Item -Path "C:\Users\micho\IdeaProjects\seguritech-bot-proprueba\.temp_subcarpeta" -Recurse -Force
Write-Host "✅ .temp_subcarpeta eliminada"
```

### Verificar que se eliminaron:
```powershell
$root = "C:\Users\micho\IdeaProjects\seguritech-bot-proprueba"
if (Test-Path "$root\securitech-bot-pro") {
    Write-Host "❌ securitech-bot-pro AÚN EXISTE"
} else {
    Write-Host "✅ securitech-bot-pro eliminada correctamente"
}

if (Test-Path "$root\.temp_subcarpeta") {
    Write-Host "❌ .temp_subcarpeta AÚN EXISTE"
} else {
    Write-Host "✅ .temp_subcarpeta eliminada correctamente"
}
```

---

## PASO 3: Limpiar node_modules (Opcional pero Recomendado)

```powershell
$root = "C:\Users\micho\IdeaProjects\seguritech-bot-proprueba"
cd $root

# Eliminar node_modules en raíz
Remove-Item -Path ".\node_modules" -Recurse -Force -ErrorAction SilentlyContinue
Write-Host "✅ node_modules raíz eliminados"

# Eliminar node_modules backend
Remove-Item -Path ".\backend\node_modules" -Recurse -Force -ErrorAction SilentlyContinue
Write-Host "✅ node_modules backend eliminados"

# Eliminar node_modules frontend
Remove-Item -Path ".\frontend\node_modules" -Recurse -Force -ErrorAction SilentlyContinue
Write-Host "✅ node_modules frontend eliminados"

# Mostrar espacio liberado
Write-Host "`n📊 Directorios limpiados. Camino libre para reinstalar."
```

---

## PASO 4: Reinstalar Dependencias (Nuevo)

```powershell
$root = "C:\Users\micho\IdeaProjects\seguritech-bot-proprueba"
cd $root

Write-Host "📦 Instalando dependencias del monorepo..."
npm install

Write-Host "`n✅ Instalación completada"
Write-Host "Verifica que todos los workspaces están OK:"
npm ls --depth=0 --workspace backend
npm ls --depth=0 --workspace frontend
```

---

## PASO 5: Validar Todo Compila

```powershell
cd C:\Users\micho\IdeaProjects\seguritech-bot-proprueba

Write-Host "🔨 Compilando backend..."
npm run build:backend

Write-Host "`n🔨 Compilando frontend..."
npm run build:frontend

Write-Host "`n✅ Ambos compilaron sin errores"
```

---

## PASO 6: Verificar Estructura Final

```powershell
$root = "C:\Users\micho\IdeaProjects\seguritech-bot-proprueba"

Write-Host "📊 Estructura final del monorepo:"
Write-Host ""

Get-ChildItem -Path $root -Directory | Where-Object { $_.Name -match "^(backend|frontend|docs|\.)" } | ForEach-Object {
    Write-Host "✅ $_"
}

Write-Host ""
Write-Host "Archivos de configuración:"
Get-ChildItem -Path $root -File | Where-Object { $_.Name -match "package\.json|README_MONOREPO" } | ForEach-Object {
    Write-Host "  ✅ $_"
}
```

---

## PASO 7: Commit a Git

```powershell
cd C:\Users\micho\IdeaProjects\seguritech-bot-proprueba

Write-Host "📝 Estado de Git:"
git status

Write-Host "`n📝 Agregando cambios..."
git add .

Write-Host "`n📝 Verificando que se agregaron correctamente:"
git status

# Commit
Write-Host "`n💾 Haciendo commit..."
git commit -m "refactor: Convert to professional monorepo with /backend /frontend /docs"

Write-Host "`n✅ Commit realizado"
Write-Host "Puedes hacer push cuando estés listo: git push origin main"
```

---

## SCRIPT COMPLETO (Todo en Uno)

Si quieres ejecutar TODO junto, copia esto en PowerShell:

```powershell
# ============================================
# LIMPIEZA COMPLETA DEL MONOREPO
# ============================================

Write-Host "🚀 Iniciando limpieza...`n" -ForegroundColor Green

# Cerrar procesos
Write-Host "⏹️  Cerrando procesos Node.js..." -ForegroundColor Yellow
taskkill /F /IM code.exe 2>$null
taskkill /F /IM "idea64.exe" 2>$null
taskkill /F /IM node.exe 2>$null
Start-Sleep -Seconds 3

# Cambiar a ruta segura
$root = "C:\Users\micho\IdeaProjects\seguritech-bot-proprueba"
cd C:\Users\micho\Desktop

# Eliminar carpetas bloqueadas
Write-Host "`n🗑️  Eliminando carpetas bloqueadas..." -ForegroundColor Yellow
Remove-Item -Path "$root\securitech-bot-pro" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path "$root\.temp_subcarpeta" -Recurse -Force -ErrorAction SilentlyContinue
Write-Host "✅ Carpetas eliminadas" -ForegroundColor Green

# Limpiar node_modules
Write-Host "`n📦 Limpiando node_modules..." -ForegroundColor Yellow
cd $root
Remove-Item -Path ".\node_modules" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path ".\backend\node_modules" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path ".\frontend\node_modules" -Recurse -Force -ErrorAction SilentlyContinue
Write-Host "✅ node_modules limpios" -ForegroundColor Green

# Reinstalar
Write-Host "`n📥 Reinstalando dependencias..." -ForegroundColor Yellow
npm install

# Compilar
Write-Host "`n🔨 Compilando..." -ForegroundColor Yellow
npm run build:backend
npm run build:frontend

# Commit
Write-Host "`n💾 Haciendo commit a Git..." -ForegroundColor Yellow
git add .
git commit -m "refactor: Convert to professional monorepo with /backend /frontend /docs"

Write-Host "`n✅ ¡LIMPIEZA COMPLETADA!" -ForegroundColor Green
Write-Host "    Próximo paso: git push origin main" -ForegroundColor Cyan
```

---

## ⚠️ Troubleshooting

### Error: "El proceso no puede obtener acceso"
**Solución**: Algunos archivos sigue bloqueados. Reinicia Windows.

### Error: "npm install falla"
**Solución**:
```powershell
npm cache clean --force
npm install
```

### Error: "package-lock.json conflictos en Git"
**Solución**:
```powershell
git checkout -- package-lock.json
git add .
git commit -m "revert lock file conflict"
```

### Build sigue fallando
**Solución completa**:
```powershell
# Nuclear option
Remove-Item -Path "dist", ".next", "backend\dist", "frontend\.next" -Recurse -Force -ErrorAction SilentlyContinue
npm run build
```

---

## ✅ Checklist Final

- [ ] IDE completamente cerrado
- [ ] Procesos Node.js terminados
- [ ] `securitech-bot-pro` eliminada
- [ ] `.temp_subcarpeta` eliminada
- [ ] `npm install` completado exitosamente
- [ ] `npm run build:backend` sin errores
- [ ] `npm run build:frontend` sin errores
- [ ] `git status` limpio
- [ ] `git commit` exitoso
- [ ] Listo para `git push origin main`

---

**Una vez completados estos pasos, tu monorepo estará 100% limpio y listo para producción.** 🎉

*Generated: 2026-04-26*
*Status: READY*

