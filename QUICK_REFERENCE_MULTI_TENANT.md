# 🚀 Quick Reference - Multi-Tenant SegurITech Bot Pro

## Compilación

```bash
# Limpiar y compilar
npm run build

# ✅ Esperado: Sin errores
```

## Ejecutar Simulador Local

```bash
npm start
```

**Primer prompt**:
```
[papeleria_01|+56912345678] Tú: 
```

## Comandos de Terminal

| Comando | Ejemplo | Descripción |
|---------|---------|-------------|
| `/tenant <id>` | `/tenant ferreteria_01` | Cambiar tenant actual |
| `/phone <número>` | `/phone +56987654321` | Cambiar cliente simulado |
| `/tenants` | `/tenants` | Listar tenants utilizados |
| `/history` | `/history` | Ver historial del tenant |
| `/help` | `/help` | Mostrar ayuda |
| `exit` | `exit` | Salir del simulador |

## Flujo de Prueba Rápido

```bash
# Terminal 1: Iniciar bot
npm start

# En la terminal:
hola                        # Mensaje normal
/tenant ferreteria_01       # Cambiar a ferretería
hola                        # Mensaje en ferretería
/phone +56987654321         # Cambiar cliente
hola                        # Nuevo cliente en ferretería
/history                    # Ver conversaciones
/tenants                    # Ver tenants
exit                        # Salir
```

## Testing con cURL

### Papelería
```bash
curl -X POST http://localhost:3000/webhook/papeleria_01 \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": "+56912345678", "message": "hola"}'
```

### Ferretería
```bash
curl -X POST http://localhost:3000/webhook/ferreteria_01 \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": "+56912345678", "message": "hola"}'
```

### Health Check
```bash
curl http://localhost:3000/health
```

## Ver Base de Datos

```bash
sqlite3 database.sqlite "SELECT tenant_id, phone_number, current_state FROM users;"
```

## Archivosprincipales modificados

- `src/domain/entities/index.ts` - Agregado `tenantId`
- `src/domain/ports/index.ts` - Puertos con `tenantId`
- `src/infrastructure/repositories/SqliteUserRepository.ts` - Aislamiento BD
- `src/infrastructure/adapters/ReadlineAdapter.ts` - Terminal multi-tenant
- `src/infrastructure/server/ExpressServer.ts` - Webhooks multi-tenant
- `src/app/controllers/BotController.ts` - Controlador con `tenantId`
- `src/domain/use-cases/HandleMessageUseCase.ts` - Lógica multi-tenant
- `src/Bootstrap.ts` - Inicialización actualizada

## URLs Webhooks

```
POST /webhook/:tenantId          ← USAR ESTA
POST /webhook                    ← Legacy
GET  /webhook/:tenantId          ← Meta verification
GET  /webhook                    ← Meta verification
GET  /health                     ← Health check
```

## Troubleshooting

| Error | Solución |
|-------|----------|
| Puerto 3000 en uso | `npm start` con puerto diferente en .env |
| Compilación falla | `rm -rf dist; npm run build` |
| BD corrupta | `rm database.sqlite` (se recreará) |
| Imports no resuelven | `npm install` |

## Status

✅ Código compilado sin errores  
✅ Listo para testing local  
✅ Preparado para integración con API WhatsApp Cloud  

---
**v2.0 - Multi-Tenant Ready**

