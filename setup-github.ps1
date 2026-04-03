#!/bin/bash
# Script para configurar Git y GitHub en Windows

Write-Host "🔧 Configurando GitHub en tu máquina..." -ForegroundColor Cyan

# Verificar si git está instalado
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Git no está instalado. Descárgalo de: https://git-scm.com/download/win" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Git detectado" -ForegroundColor Green

# Verificar credenciales
Write-Host "`n📋 Configuración de credenciales GitHub:" -ForegroundColor Cyan

$username = git config --global user.name
$email = git config --global user.email

Write-Host "Usuario: $username" -ForegroundColor Yellow
Write-Host "Email: $email" -ForegroundColor Yellow

if (-not $username -or -not $email) {
    Write-Host "`n⚠️  Falta configuración. Configura con:" -ForegroundColor Yellow
    Write-Host 'git config --global user.name "Tu Nombre"' -ForegroundColor Cyan
    Write-Host 'git config --global user.email "tu.email@gmail.com"' -ForegroundColor Cyan
    exit 1
}

# Verificar GitHub CLI
Write-Host "`n🔐 Verificando GitHub CLI..." -ForegroundColor Cyan
if (Get-Command gh -ErrorAction SilentlyContinue) {
    Write-Host "✅ GitHub CLI instalado" -ForegroundColor Green
    Write-Host "`nAutenticando con GitHub..." -ForegroundColor Cyan
    gh auth login
} else {
    Write-Host "⚠️  GitHub CLI no instalado." -ForegroundColor Yellow
    Write-Host "Opción 1: Descarga GitHub CLI https://cli.github.com/" -ForegroundColor Cyan
    Write-Host "`nOpción 2: Configura un Personal Access Token en GitHub" -ForegroundColor Cyan
    Write-Host "  1. Ve a: https://github.com/settings/tokens" -ForegroundColor Cyan
    Write-Host "  2. New token (classic)" -ForegroundColor Cyan
    Write-Host "  3. Selecciona: repo, read:user" -ForegroundColor Cyan
    Write-Host "  4. Copia el token" -ForegroundColor Cyan
    Write-Host "  5. En Git, usa el token como contraseña" -ForegroundColor Cyan
}

Write-Host "`n✅ ¡Configuración completada!" -ForegroundColor Green
Write-Host "Ahora puedes hacer push sin problemas" -ForegroundColor Green

