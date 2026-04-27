-- Tabla de mapeo de números de teléfono a tenants
-- Permite resolver tenantId desde un número de teléfono de negocio
-- Usado por webhook POST /webhook cuando llega mensaje de Meta sin tenantId en URL

CREATE TABLE IF NOT EXISTS phone_tenant_map (
  phone_number TEXT PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índice para búsquedas eficientes
CREATE INDEX IF NOT EXISTS idx_phone_tenant_map_tenant_id ON phone_tenant_map(tenant_id);
CREATE INDEX IF NOT EXISTS idx_phone_tenant_map_is_active ON phone_tenant_map(is_active);

-- Comentario de tabla para documentación
COMMENT ON TABLE phone_tenant_map IS 'Mapeo de números de teléfono de Business a tenants para resolver tenantId en webhooks de Meta';
COMMENT ON COLUMN phone_tenant_map.phone_number IS 'Número de teléfono de negocio (ej: 573123456789)';
COMMENT ON COLUMN phone_tenant_map.tenant_id IS 'ID del tenant propietario de este número';
COMMENT ON COLUMN phone_tenant_map.is_active IS 'Flag para desactivar sin borrar';

