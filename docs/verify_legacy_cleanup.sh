#!/bin/bash
# Script de verificación de movimiento de archivos legacy
# Ejecutar después de deploy para confirmar que todos los imports se actualizaron

echo "🔍 Buscando referencias al código antiguo..."
echo ""

echo "1. Buscando imports de messageHandler.ts:"
grep -r "from.*handlers/messageHandler" . --include="*.ts" --include="*.tsx" 2>/dev/null || echo "   ✅ Ninguno encontrado"

echo ""
echo "2. Buscando imports de whatsappConnectionService.ts:"
grep -r "from.*services/whatsappConnectionService" . --include="*.ts" --include="*.tsx" 2>/dev/null || echo "   ✅ Ninguno encontrado"

echo ""
echo "3. Buscando imports de entities.ts (modelo antiguo):"
grep -r "from.*models/entities" . --include="*.ts" --include="*.tsx" 2>/dev/null || echo "   ✅ Ninguno encontrado"

echo ""
echo "✨ Si todos retornan sin resultados, es seguro eliminar src/legacy/"

