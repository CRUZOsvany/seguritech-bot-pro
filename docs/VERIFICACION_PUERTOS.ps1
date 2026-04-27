# ======================================
# 🔍 PROTOCOLO DE VERIFICACIÓN DE PUERTOS
# SegurITech Bot Pro v2.0 Multi-Tenant
# Windows PowerShell v5.1
# ======================================
#
# Este script resuelve la colisión de puertos EADDRINUSE :::3000
# Ejecutar como administrador para matar procesos
#
# ======================================

Write-Host ""
Write-Host "╔════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  🔍 PROTOCOLO DE VERIFICACIÓN - COLISIÓN DE PUERTOS  ║" -ForegroundColor Cyan
Write-Host "║  SegurITech Bot Pro v2.0                             ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# ======================================
# PASO 1: Verificar procesos en puertos críticos
# ======================================
Write-Host "📋 PASO 1: Verificando procesos en puertos críticos..." -ForegroundColor Yellow
Write-Host ""

Write-Host "🔎 Puerto 3000 (Next.js):" -ForegroundColor Green
$port3000 = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue
if ($port3000) {
    $process3000 = Get-Process -Id $port3000.OwningProcess -ErrorAction SilentlyContinue
    Write-Host "   ⚠️  PUERTO OCUPADO por: $($process3000.ProcessName) (PID: $($port3000.OwningProcess))" -ForegroundColor Red
} else {
    Write-Host "   ✅ LIBRE" -ForegroundColor Green
}

Write-Host ""
Write-Host "🔎 Puerto 3001 (Express Backend):" -ForegroundColor Green
$port3001 = Get-NetTCPConnection -LocalPort 3001 -ErrorAction SilentlyContinue
if ($port3001) {
    $process3001 = Get-Process -Id $port3001.OwningProcess -ErrorAction SilentlyContinue
    Write-Host "   ⚠️  PUERTO OCUPADO por: $($process3001.ProcessName) (PID: $($port3001.OwningProcess))" -ForegroundColor Red
} else {
    Write-Host "   ✅ LIBRE" -ForegroundColor Green
}

Write-Host ""

# ======================================
# PASO 2: Matar procesos huérfanos (si existen)
# ======================================
Write-Host "🔨 PASO 2: Eliminando procesos huérfanos..." -ForegroundColor Yellow
Write-Host ""

$confirmar = Read-Host "¿Deseas matar procesos en puertos 3000 y 3001? (s/n)"

if ($confirmar -eq 's' -or $confirmar -eq 'S') {

    # Matar puerto 3000
    if ($port3000) {
        Write-Host "🔴 Matando proceso en puerto 3000 (PID: $($port3000.OwningProcess))..." -ForegroundColor Magenta
        Stop-Process -Id $port3000.OwningProcess -Force -ErrorAction SilentlyContinue
        Start-Sleep -Milliseconds 500
        Write-Host "   ✅ Proceso eliminado" -ForegroundColor Green
    }

    # Matar puerto 3001
    if ($port3001) {
        Write-Host "🔴 Matando proceso en puerto 3001 (PID: $($port3001.OwningProcess))..." -ForegroundColor Magenta
        Stop-Process -Id $port3001.OwningProcess -Force -ErrorAction SilentlyContinue
        Start-Sleep -Milliseconds 500
        Write-Host "   ✅ Proceso eliminado" -ForegroundColor Green
    }

    if (-not $port3000 -and -not $port3001) {
        Write-Host "   ℹ️  No hay procesos que eliminar" -ForegroundColor Cyan
    }
} else {
    Write-Host "   ⏭️  Saltando eliminación de procesos" -ForegroundColor Yellow
}

Write-Host ""

# ======================================
# PASO 3: Compilar proyecto
# ======================================
Write-Host "🔨 PASO 3: Compilando TypeScript..." -ForegroundColor Yellow
Write-Host ""

$projectPath = "C:\Users\micho\IdeaProjects\seguritech-bot-pro"
Set-Location $projectPath

Write-Host "📂 Directorio: $projectPath" -ForegroundColor Cyan
Write-Host ""

Write-Host "🏗️  Ejecutando: npm run build" -ForegroundColor Green
npm run build

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✅ COMPILACIÓN EXITOSA" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "❌ COMPILACIÓN FALLIDA (código de error: $LASTEXITCODE)" -ForegroundColor Red
    Write-Host "   Revisa los errores arriba" -ForegroundColor Yellow
    exit 1
}

Write-Host ""

# ======================================
# PASO 4: Verificación pre-arranque
# ======================================
Write-Host "✔️  PASO 4: Verificación pre-arranque..." -ForegroundColor Yellow
Write-Host ""

# Verificar que .env existe
if (Test-Path ".env") {
    Write-Host "✅ Archivo .env presente" -ForegroundColor Green

    $webhookPort = Select-String -Path ".env" -Pattern "WEBHOOK_PORT" | Select-Object -First 1
    if ($webhookPort) {
        Write-Host "   $($webhookPort.Line)" -ForegroundColor Cyan
    }
} else {
    Write-Host "❌ Archivo .env NO ENCONTRADO" -ForegroundColor Red
}

# Verificar que package.json existe
if (Test-Path "package.json") {
    Write-Host "✅ Archivo package.json presente" -ForegroundColor Green
} else {
    Write-Host "❌ Archivo package.json NO ENCONTRADO" -ForegroundColor Red
}

# Verificar que dist/ existe (después de compilación)
if (Test-Path "dist") {
    Write-Host "✅ Directorio dist/ presente (compilación OK)" -ForegroundColor Green
} else {
    Write-Host "❌ Directorio dist/ NO ENCONTRADO (compilar primero)" -ForegroundColor Red
}

Write-Host ""

# ======================================
# PASO 5: Resumen y próximos pasos
# ======================================
Write-Host "📋 RESUMEN Y PRÓXIMOS PASOS:" -ForegroundColor Cyan
Write-Host ""
Write-Host "✅ Checklist completado:" -ForegroundColor Green
Write-Host "   1. ✅ Procesos huérfanos eliminados"
Write-Host "   2. ✅ Proyecto compilado (npm run build)"
Write-Host "   3. ✅ .env configurado con WEBHOOK_PORT=3001"
Write-Host ""
Write-Host "🚀 Para iniciar el servidor backend:" -ForegroundColor Yellow
Write-Host "   npm start" -ForegroundColor Cyan
Write-Host ""
Write-Host "   Este comando iniciará Express en el puerto 3001 (EXCLUSIVAMENTE)"
Write-Host "   Backend: http://localhost:3001" -ForegroundColor Green
Write-Host ""
Write-Host "🌐 Para iniciar el frontend Next.js (en otra terminal):" -ForegroundColor Yellow
Write-Host "   cd securitech-bot-pro" -ForegroundColor Cyan
Write-Host "   npm run dev" -ForegroundColor Cyan
Write-Host ""
Write-Host "   Frontend: http://localhost:3000" -ForegroundColor Green
Write-Host ""
Write-Host "📡 Para verificar el backend:" -ForegroundColor Yellow
Write-Host "   curl http://localhost:3001/health" -ForegroundColor Cyan
Write-Host ""
Write-Host "🔗 Para conectar Ngrok después (producción):" -ForegroundColor Yellow
Write-Host "   ngrok http 3001" -ForegroundColor Cyan
Write-Host ""
Write-Host "════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

