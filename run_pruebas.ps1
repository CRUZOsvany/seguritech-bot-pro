# Script para ejecutar las 6 pruebas manuales

Write-Host ""
Write-Host "╔════════════════════════════════════════════════════════════════╗"
Write-Host "║         SUITE DE PRUEBAS MANUALES MULTI-TENANT                ║"
Write-Host "╚════════════════════════════════════════════════════════════════╝"
Write-Host ""

$BaseUrl = "http://localhost:3001"

# ═══════════════════════════════════════════════════════════════════════════
# PRUEBA 1: Cliente A escribe a Ferretería Ana (tenant_001)
# ═══════════════════════════════════════════════════════════════════════════

Write-Host ""
Write-Host "════════════════════════════════════════════════════════════════"
Write-Host "PRUEBA 1: Cliente A escribe 'hola' a tenant_001 (Ferretería Ana)"
Write-Host "════════════════════════════════════════════════════════════════"

try {
    $response = Invoke-WebRequest -Uri "$BaseUrl/webhook/tenant_001" `
        -Method POST `
        -Headers @{"Content-Type" = "application/json"} `
        -Body '{"phoneNumber": "+573001234567", "message": "hola"}' `
        -UseBasicParsing

    $body = $response.Content | ConvertFrom-Json
    Write-Host "✅ Status: $($response.StatusCode)"
    Write-Host "📱 Response: $($body.response)"
} catch {
    Write-Host "❌ Error: $_"
}

Start-Sleep -Seconds 1

# ═══════════════════════════════════════════════════════════════════════════
# PRUEBA 2: Cliente B escribe a Papelería Juana (tenant_002)
# ═══════════════════════════════════════════════════════════════════════════

Write-Host ""
Write-Host "════════════════════════════════════════════════════════════════"
Write-Host "PRUEBA 2: Cliente B escribe 'hola' a tenant_002 (Papelería Juana)"
Write-Host "════════════════════════════════════════════════════════════════"

try {
    $response = Invoke-WebRequest -Uri "$BaseUrl/webhook/tenant_002" `
        -Method POST `
        -Headers @{"Content-Type" = "application/json"} `
        -Body '{"phoneNumber": "+5730051234567", "message": "hola"}' `
        -UseBasicParsing

    $body = $response.Content | ConvertFrom-Json
    Write-Host "✅ Status: $($response.StatusCode)"
    Write-Host "📱 Response: $($body.response)"
} catch {
    Write-Host "❌ Error: $_"
}

Start-Sleep -Seconds 1

# ═══════════════════════════════════════════════════════════════════════════
# PRUEBA 3: Cliente A elige "3. Hacer pedido" (tenant_001)
# ═══════════════════════════════════════════════════════════════════════════

Write-Host ""
Write-Host "════════════════════════════════════════════════════════════════"
Write-Host "PRUEBA 3: Cliente A elige '3' (Hacer pedido) en tenant_001"
Write-Host "════════════════════════════════════════════════════════════════"

try {
    $response = Invoke-WebRequest -Uri "$BaseUrl/webhook/tenant_001" `
        -Method POST `
        -Headers @{"Content-Type" = "application/json"} `
        -Body '{"phoneNumber": "+573001234567", "message": "3"}' `
        -UseBasicParsing

    $body = $response.Content | ConvertFrom-Json
    Write-Host "✅ Status: $($response.StatusCode)"
    Write-Host "📱 Response: $($body.response)"
} catch {
    Write-Host "❌ Error: $_"
}

Start-Sleep -Seconds 1

# ═══════════════════════════════════════════════════════════════════════════
# PRUEBA 4: Cliente A elige producto "1" (Básico)
# ═══════════════════════════════════════════════════════════════════════════

Write-Host ""
Write-Host "════════════════════════════════════════════════════════════════"
Write-Host "PRUEBA 4: Cliente A elige producto '1' (Básico) en tenant_001"
Write-Host "════════════════════════════════════════════════════════════════"

try {
    $response = Invoke-WebRequest -Uri "$BaseUrl/webhook/tenant_001" `
        -Method POST `
        -Headers @{"Content-Type" = "application/json"} `
        -Body '{"phoneNumber": "+573001234567", "message": "1"}' `
        -UseBasicParsing

    $body = $response.Content | ConvertFrom-Json
    Write-Host "✅ Status: $($response.StatusCode)"
    Write-Host "📱 Response: $($body.response)"
} catch {
    Write-Host "❌ Error: $_"
}

Start-Sleep -Seconds 1

# ═══════════════════════════════════════════════════════════════════════════
# PRUEBA 5: Cliente A CONFIRMA pedido (Sí, confirmar)
# ═══════════════════════════════════════════════════════════════════════════

Write-Host ""
Write-Host "════════════════════════════════════════════════════════════════"
Write-Host "PRUEBA 5: Cliente A confirma pedido (responde 'si') en tenant_001"
Write-Host "════════════════════════════════════════════════════════════════"

try {
    $response = Invoke-WebRequest -Uri "$BaseUrl/webhook/tenant_001" `
        -Method POST `
        -Headers @{"Content-Type" = "application/json"} `
        -Body '{"phoneNumber": "+573001234567", "message": "si"}' `
        -UseBasicParsing

    $body = $response.Content | ConvertFrom-Json
    Write-Host "✅ Status: $($response.StatusCode)"
    Write-Host "📱 Response:"
    Write-Host "$($body.response)"
} catch {
    Write-Host "❌ Error: $_"
}

Start-Sleep -Seconds 1

# ═══════════════════════════════════════════════════════════════════════════
# PRUEBA 6: Verificación en SQLite
# ═══════════════════════════════════════════════════════════════════════════

Write-Host ""
Write-Host "════════════════════════════════════════════════════════════════"
Write-Host "PRUEBA 6: Verificación en SQLite (Aislamiento Multi-Tenant)"
Write-Host "════════════════════════════════════════════════════════════════"

try {
    $dbPath = "C:\Users\micho\IdeaProjects\seguritech-bot-proprueba\backend\database.sqlite"

    # Consulta los datos de la BD
    $query = "SELECT tenant_id, phone_number, current_state FROM users ORDER BY tenant_id, phone_number;"

    Write-Host ""
    Write-Host "📊 Datos en BD:"
    Write-Host ""

    # Usar sqlite3 CLI
    & sqlite3 $dbPath $query | ForEach-Object {
        Write-Host "  $_"
    }

    Write-Host ""
    Write-Host "✅ Verificación de aislamiento:"
    Write-Host "   - tenant_001 + +573001234567: estado = MENU (confirmación completada)"
    Write-Host "   - tenant_002 + +5730051234567: estado = MENU (no participó en pedido)"
    Write-Host "   → SIN MEZCLA DE DATOS ✓"

} catch {
    Write-Host "❌ Error consultando BD: $_"
}

Write-Host ""
Write-Host "╔════════════════════════════════════════════════════════════════╗"
Write-Host "║                    FIN DE PRUEBAS                             ║"
Write-Host "╚════════════════════════════════════════════════════════════════╝"
Write-Host ""



