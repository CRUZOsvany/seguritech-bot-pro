#!/bin/bash

# Smoke test para validar que el servidor backend está funcionando
# Uso: bash scripts/smoke-test.sh

set -e

echo "🔥 Iniciando smoke test..."

# Definir colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Puertos
BACKEND_PORT=3001
BACKEND_URL="http://localhost:${BACKEND_PORT}"

# Función para limpiar (matar proceso de background)
cleanup() {
  if [ ! -z "$BACKEND_PID" ]; then
    echo "⏹️  Matando backend (PID: $BACKEND_PID)..."
    kill $BACKEND_PID 2>/dev/null || true
    wait $BACKEND_PID 2>/dev/null || true
  fi
}

# Registrar trap para limpiar en caso de error o salida
trap cleanup EXIT

# Iniciar backend en background
echo "🚀 Arrancando backend..."
npm run dev:backend &
BACKEND_PID=$!

# Esperar a que el servidor esté listo
echo "⏳ Esperando a que backend esté listo (máx 10 segundos)..."
TIMEOUT=10
ELAPSED=0
until curl -s "$BACKEND_URL/health" > /dev/null 2>&1; do
  ELAPSED=$((ELAPSED + 1))
  if [ $ELAPSED -ge $TIMEOUT ]; then
    echo -e "${RED}❌ Timeout esperando backend${NC}"
    exit 1
  fi
  echo "  Intento $ELAPSED/$TIMEOUT..."
  sleep 1
done

echo -e "${GREEN}✅ Backend listo${NC}"

# Hacer smoke test
echo -e "\n📨 Enviando mensaje de prueba..."
RESPONSE=$(curl -s -X POST "$BACKEND_URL/webhook/test-tenant" \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumber": "+5217471234567",
    "message": "hola"
  }')

echo "Respuesta del servidor:"
echo "$RESPONSE"

# Validar respuesta
if echo "$RESPONSE" | grep -q '"success":true'; then
  echo -e "\n${GREEN}✅ SMOKE TEST PASSED${NC}"
  exit 0
else
  echo -e "\n${RED}❌ SMOKE TEST FAILED${NC}"
  echo "Respuesta esperaba success:true pero recibió:"
  echo "$RESPONSE"
  exit 1
fi

