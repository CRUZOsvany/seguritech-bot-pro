#requires -Version 7.0
<#
  Nivel 3 — Smoke test del flujo auth real contra backend dev.

  Lo que hace:
    1. Pide tu password con Read-Host -AsSecureString (NO se ve mientras
       tipeas, NO se guarda en historial de PowerShell, se libera al final).
    2. POST /api/auth/login → guarda cookie en $session.
    3. GET /api/auth/me → confirma sesión.
    4. GET /api/admin/tenants → imprime el JSON exacto que renderiza el
       dashboard (con esto validamos el contrato cliente↔backend).
    5. POST /api/auth/logout → limpia.

  Requiere backend corriendo en http://127.0.0.1:3001 (npm run --workspace
  backend dev).
#>

$ErrorActionPreference = 'Stop'
$email = 'osvanycruz2@gmail.com'
$base  = 'http://127.0.0.1:3001'

Write-Host ""
Write-Host "Nivel 3 — smoke test de auth+tenants contra $base" -ForegroundColor Cyan
Write-Host "Email: $email" -ForegroundColor DarkGray
Write-Host ""

# --- Password secure input ------------------------------------------------
$sec  = Read-Host -AsSecureString "Password de $email"
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
$pw   = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)

try {
    # --- 1. Login ---------------------------------------------------------
    Write-Host ""
    Write-Host "==[POST /api/auth/login]==" -ForegroundColor Cyan
    $body = @{ email = $email; password = $pw } | ConvertTo-Json -Compress
    $r = Invoke-WebRequest `
        -Uri "$base/api/auth/login" `
        -Method POST `
        -ContentType 'application/json' `
        -Body $body `
        -SessionVariable s `
        -SkipHttpErrorCheck
    Write-Host "HTTP $($r.StatusCode)"
    Write-Host $r.Content

    if ($r.StatusCode -ne 200) {
        Write-Host "Login falló — abortando." -ForegroundColor Red
        return
    }

    # --- 2. /me -----------------------------------------------------------
    Write-Host ""
    Write-Host "==[GET /api/auth/me]==" -ForegroundColor Cyan
    $r = Invoke-WebRequest -Uri "$base/api/auth/me" -WebSession $s -SkipHttpErrorCheck
    Write-Host "HTTP $($r.StatusCode)"
    Write-Host $r.Content

    # --- 3. /tenants (lo que renderiza el dashboard) ---------------------
    Write-Host ""
    Write-Host "==[GET /api/admin/tenants]==" -ForegroundColor Cyan
    Write-Host "  ↳ Este JSON es lo que TenantsTable consume."
    $r = Invoke-WebRequest -Uri "$base/api/admin/tenants" -WebSession $s -SkipHttpErrorCheck
    Write-Host "HTTP $($r.StatusCode)"
    if ($r.StatusCode -eq 200) {
        $obj = $r.Content | ConvertFrom-Json
        $count = if ($obj.tenants) { $obj.tenants.Count } else { 0 }
        Write-Host "tenants.length = $count" -ForegroundColor Yellow
        $obj | ConvertTo-Json -Depth 6
    } else {
        Write-Host $r.Content
    }

    # --- 4. Logout --------------------------------------------------------
    Write-Host ""
    Write-Host "==[POST /api/auth/logout]==" -ForegroundColor Cyan
    $r = Invoke-WebRequest `
        -Uri "$base/api/auth/logout" `
        -Method POST `
        -WebSession $s `
        -SkipHttpErrorCheck
    Write-Host "HTTP $($r.StatusCode)"
    Write-Host $r.Content
}
finally {
    # Liberar password de memoria
    if ($pw) { Remove-Variable pw -ErrorAction SilentlyContinue }
    if ($sec) { $sec.Dispose() }
    [System.GC]::Collect()
}

Write-Host ""
Write-Host "Done." -ForegroundColor Green
