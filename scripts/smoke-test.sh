#!/bin/bash

# Smoke test para validar que el servidor backend está funcionando.
# Uso: bash scripts/smoke-test.sh
#
# Corrige la deuda anotada en .claude/SEGURITECH_ESTADO_ACTUAL.md §3.5:
#   - `npm run dev:backend` no existe (el script real es `dev`, desde la raíz).
#   - `/webhook/test-tenant` no es un endpoint real ni un tenant sembrado —
#     el webhook de Meta espera el payload real de Meta (entry/changes/value)
#     resuelto por phone_number_id contra tenant_meta_credentials, no un
#     {phoneNumber, message} inventado. Probar el webhook de verdad requiere
#     un tenant con credenciales Meta reales sembradas — usa el simulador
#     (/simulator/<uuid>) para eso, no este script.
#
# Este smoke test cubre lo que SÍ se puede validar sin datos de negocio
# reales: que el server levanta, y el flujo de auth documentado en el
# README ("Smoke test post-deploy"). El bloque de login es opcional: si no
# defines ADMIN_EMAIL/ADMIN_PASSWORD, se salta con una advertencia en vez
# de fallar el smoke test completo.

set -e

echo "🔥 Iniciando smoke test..."

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

BACKEND_PORT=3001
BACKEND_URL="http://127.0.0.1:${BACKEND_PORT}"
COOKIE_JAR=$(mktemp)

cleanup() {
  if [ -n "$BACKEND_PID" ]; then
    echo "⏹️  Matando backend (PID: $BACKEND_PID)..."
    kill "$BACKEND_PID" 2>/dev/null || true
    wait "$BACKEND_PID" 2>/dev/null || true
  fi
  rm -f "$COOKIE_JAR"
}
trap cleanup EXIT

echo "🚀 Arrancando backend (npm run dev, desde la raíz)..."
( cd "$(dirname "$0")/.." && npm run dev ) &
BACKEND_PID=$!

echo "⏳ Esperando a que backend esté listo (máx 20 segundos)..."
TIMEOUT=20
ELAPSED=0
until curl -s "$BACKEND_URL/health" > /dev/null 2>&1; do
  ELAPSED=$((ELAPSED + 1))
  if [ $ELAPSED -ge $TIMEOUT ]; then
    echo -e "${RED}❌ Timeout esperando backend${NC}"
    exit 1
  fi
  sleep 1
done
echo -e "${GREEN}✅ Backend listo${NC}"

FAILED=0

# --- 1. Health check ---
echo -e "\n📡 GET /health"
HEALTH=$(curl -s -o /dev/null -w '%{http_code}' "$BACKEND_URL/health")
if [ "$HEALTH" = "200" ]; then
  echo -e "${GREEN}✅ /health -> 200${NC}"
else
  echo -e "${RED}❌ /health -> $HEALTH (esperaba 200)${NC}"
  FAILED=1
fi

# --- 2. Endpoint protegido SIN cookie (debe rechazar) ---
echo -e "\n🔒 GET /api/admin/tenants sin sesión"
NOAUTH=$(curl -s -o /dev/null -w '%{http_code}' "$BACKEND_URL/api/admin/tenants")
if [ "$NOAUTH" = "401" ]; then
  echo -e "${GREEN}✅ Sin cookie -> 401 (correcto, protegido)${NC}"
else
  echo -e "${RED}❌ Sin cookie -> $NOAUTH (esperaba 401)${NC}"
  FAILED=1
fi

# --- 3. Login + endpoint protegido CON cookie (opcional, requiere credenciales) ---
if [ -n "$ADMIN_EMAIL" ] && [ -n "$ADMIN_PASSWORD" ]; then
  echo -e "\n🔑 POST /api/auth/login"
  LOGIN_STATUS=$(curl -s -o /dev/null -w '%{http_code}' -c "$COOKIE_JAR" \
    -X POST "$BACKEND_URL/api/auth/login" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}")

  if [ "$LOGIN_STATUS" = "200" ]; then
    echo -e "${GREEN}✅ Login -> 200${NC}"

    echo -e "\n🔓 GET /api/admin/tenants con cookie"
    AUTH_STATUS=$(curl -s -o /dev/null -w '%{http_code}' -b "$COOKIE_JAR" "$BACKEND_URL/api/admin/tenants")
    if [ "$AUTH_STATUS" = "200" ]; then
      echo -e "${GREEN}✅ Con cookie -> 200${NC}"
    else
      echo -e "${RED}❌ Con cookie -> $AUTH_STATUS (esperaba 200)${NC}"
      FAILED=1
    fi
  else
    echo -e "${RED}❌ Login -> $LOGIN_STATUS (esperaba 200)${NC}"
    FAILED=1
  fi
else
  echo -e "\n${YELLOW}⚠️  ADMIN_EMAIL/ADMIN_PASSWORD no definidos — se salta login + endpoint autenticado.${NC}"
  echo -e "${YELLOW}   Uso completo: ADMIN_EMAIL=... ADMIN_PASSWORD=... bash scripts/smoke-test.sh${NC}"
fi

if [ "$FAILED" -eq 0 ]; then
  echo -e "\n${GREEN}✅ SMOKE TEST PASSED${NC}"
  exit 0
else
  echo -e "\n${RED}❌ SMOKE TEST FAILED${NC}"
  exit 1
fi
