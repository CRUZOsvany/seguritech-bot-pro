-- ===== SCHEMA SUPABASE PARA SEGURITECH BOT PRO =====
-- Este archivo contiene todas las tablas necesarias para el panel de control
-- Ejecutar en Supabase SQL editor para crear la estructura

-- ===== 1. TABLA: USUARIOS ADMINS / SUPER ADMINS =====
CREATE TABLE IF NOT EXISTS admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('super_admin', 'admin_operator')),
  tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
  password_hash TEXT NOT NULL,
  last_login TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Índices para búsquedas rápidas
  UNIQUE(email)
);

CREATE INDEX idx_admin_users_email ON admin_users(email);
CREATE INDEX idx_admin_users_tenant ON admin_users(tenant_id);
CREATE INDEX idx_admin_users_role ON admin_users(role);

-- ===== 2. TABLA: TENANTS (CLIENTES) =====
CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre_negocio TEXT UNIQUE NOT NULL,
  giro VARCHAR(30) NOT NULL CHECK (giro IN (
    'ferreteria', 'papeleria', 'cerrajeria', 'pizzeria',
    'salon', 'medico', 'refaccionaria', 'farmacia', 'otro'
  )),
  direccion TEXT NOT NULL,
  horario_semana TEXT,
  horario_sabado TEXT,
  abre_domingo BOOLEAN DEFAULT false,
  status VARCHAR(20) DEFAULT 'unconfigured' CHECK (status IN (
    'active', 'paused', 'unconfigured'
  )),
  webhook_verified BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Row Level Security
  -- Solo admins asignados pueden ver/editar
  UNIQUE(nombre_negocio)
);

CREATE INDEX idx_tenants_status ON tenants(status);
CREATE INDEX idx_tenants_created ON tenants(created_at);

-- ===== 3. TABLA: DATOS DEL DUEÑO Y COBRANZA =====
CREATE TABLE IF NOT EXISTS owner_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
  nombre_dueno TEXT NOT NULL,
  whatsapp_dueno TEXT NOT NULL,
  monto_mensual DECIMAL(10,2) NOT NULL,
  fecha_proximo_pago DATE NOT NULL,
  notas_internas TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_owner_data_tenant ON owner_data(tenant_id);
CREATE INDEX idx_owner_data_fecha_pago ON owner_data(fecha_proximo_pago);

-- ===== 4. TABLA: CONFIGURACIÓN DEL BOT =====
CREATE TABLE IF NOT EXISTS bot_configurations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
  numero_whatsapp_asignado TEXT NOT NULL,
  nombre_bot TEXT NOT NULL,
  tono_bot VARCHAR(20) NOT NULL CHECK (tono_bot IN ('formal', 'amigable', 'directo')),
  mensaje_bienvenida TEXT NOT NULL,
  mensaje_menu_principal TEXT NOT NULL,
  mensaje_fuera_horario TEXT NOT NULL,
  mensaje_no_entendio TEXT NOT NULL,
  mensaje_confirmacion_pedido TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_bot_config_tenant ON bot_configurations(tenant_id);

-- ===== 5. TABLA: CATÁLOGO DE PRODUCTOS =====
CREATE TABLE IF NOT EXISTS catalog_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nombre_producto TEXT NOT NULL,
  descripcion TEXT,
  precio DECIMAL(10,2) NOT NULL CHECK (precio >= 0),
  categoria TEXT NOT NULL,
  disponible BOOLEAN DEFAULT true,
  imagen_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_catalog_tenant ON catalog_items(tenant_id);
CREATE INDEX idx_catalog_disponible ON catalog_items(disponible);
CREATE INDEX idx_catalog_categoria ON catalog_items(categoria);

-- ===== 6. TABLA: CARGA DE CATÁLOGOS =====
CREATE TABLE IF NOT EXISTS catalog_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  archivo_url TEXT NOT NULL,
  tipo_upload VARCHAR(10) NOT NULL CHECK (tipo_upload IN ('pdf', 'manual')),
  items_procesados INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_catalog_uploads_tenant ON catalog_uploads(tenant_id);

-- ===== 7. TABLA: CONFIGURACIÓN DE SERVICIO URGENTE =====
CREATE TABLE IF NOT EXISTS urgent_service_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
  tiene_servicio_urgente BOOLEAN DEFAULT false,
  whatsapp_alertas_urgentes TEXT,
  mensaje_alerta_admin TEXT,
  tiempo_respuesta_prometido TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_urgent_tenant ON urgent_service_config(tenant_id);

-- ===== 8. TABLA: MENSAJES REGISTRADOS =====
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  from_phone TEXT NOT NULL,
  content TEXT NOT NULL,
  message_type VARCHAR(20) DEFAULT 'text',
  processed BOOLEAN DEFAULT false,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_messages_tenant ON messages(tenant_id);
CREATE INDEX idx_messages_timestamp ON messages(timestamp);
CREATE INDEX idx_messages_month ON messages(tenant_id, date_trunc('month', timestamp));

-- ===== 9. TABLA: AUDITORÍA =====
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  action VARCHAR(50) NOT NULL,
  entity_type VARCHAR(50),
  entity_id TEXT,
  tenant_id UUID,
  old_values JSONB,
  new_values JSONB,
  ip_address TEXT,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_audit_timestamp ON audit_logs(timestamp);
CREATE INDEX idx_audit_tenant ON audit_logs(tenant_id);
CREATE INDEX idx_audit_user ON audit_logs(user_id);

-- ===== ROW LEVEL SECURITY (RLS) =====

-- Habilitar RLS en todas las tablas
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE owner_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE urgent_service_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- ===== POLÍTICAS DE RLS =====

-- admin_users: El usuario solo puede ver/editar su propio registro
CREATE POLICY "admin_users_select" ON admin_users
  FOR SELECT
  USING (
    auth.uid()::text = user_id OR
    (SELECT role FROM admin_users WHERE user_id = auth.uid()::text LIMIT 1) = 'super_admin'
  );

-- tenants: Accesible solo si tienes relación admin_users
CREATE POLICY "tenants_select" ON tenants
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.tenant_id = tenants.id
      AND admin_users.user_id = auth.uid()::text
    ) OR
    (SELECT role FROM admin_users WHERE user_id = auth.uid()::text LIMIT 1) = 'super_admin'
  );

CREATE POLICY "tenants_insert" ON tenants
  FOR INSERT
  WITH CHECK (true); -- Controlado a nivel aplicación

CREATE POLICY "tenants_update" ON tenants
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.tenant_id = tenants.id
      AND admin_users.user_id = auth.uid()::text
    ) OR
    (SELECT role FROM admin_users WHERE user_id = auth.uid()::text LIMIT 1) = 'super_admin'
  );

-- owner_data: Accesible según tenant
CREATE POLICY "owner_data_select" ON owner_data
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.tenant_id = owner_data.tenant_id
      AND admin_users.user_id = auth.uid()::text
    ) OR
    (SELECT role FROM admin_users WHERE user_id = auth.uid()::text LIMIT 1) = 'super_admin'
  );

CREATE POLICY "owner_data_update" ON owner_data
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.tenant_id = owner_data.tenant_id
      AND admin_users.user_id = auth.uid()::text
    ) OR
    (SELECT role FROM admin_users WHERE user_id = auth.uid()::text LIMIT 1) = 'super_admin'
  );

-- bot_configurations: Accesible según tenant
CREATE POLICY "bot_config_select" ON bot_configurations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.tenant_id = bot_configurations.tenant_id
      AND admin_users.user_id = auth.uid()::text
    ) OR
    (SELECT role FROM admin_users WHERE user_id = auth.uid()::text LIMIT 1) = 'super_admin'
  );

CREATE POLICY "bot_config_update" ON bot_configurations
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.tenant_id = bot_configurations.tenant_id
      AND admin_users.user_id = auth.uid()::text
    ) OR
    (SELECT role FROM admin_users WHERE user_id = auth.uid()::text LIMIT 1) = 'super_admin'
  );

-- catalog_items: Accesible según tenant (lectura y escritura)
CREATE POLICY "catalog_items_select" ON catalog_items
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.tenant_id = catalog_items.tenant_id
      AND admin_users.user_id = auth.uid()::text
    ) OR
    (SELECT role FROM admin_users WHERE user_id = auth.uid()::text LIMIT 1) = 'super_admin'
  );

CREATE POLICY "catalog_items_insert" ON catalog_items
  FOR INSERT
  WITH CHECK (true); -- Controlado a nivel aplicación

CREATE POLICY "catalog_items_update" ON catalog_items
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.tenant_id = catalog_items.tenant_id
      AND admin_users.user_id = auth.uid()::text
    ) OR
    (SELECT role FROM admin_users WHERE user_id = auth.uid()::text LIMIT 1) = 'super_admin'
  );

-- catalog_uploads: Accesible según tenant
CREATE POLICY "catalog_uploads_select" ON catalog_uploads
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.tenant_id = catalog_uploads.tenant_id
      AND admin_users.user_id = auth.uid()::text
    ) OR
    (SELECT role FROM admin_users WHERE user_id = auth.uid()::text LIMIT 1) = 'super_admin'
  );

-- urgent_service_config: Accesible según tenant
CREATE POLICY "urgent_service_select" ON urgent_service_config
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.tenant_id = urgent_service_config.tenant_id
      AND admin_users.user_id = auth.uid()::text
    ) OR
    (SELECT role FROM admin_users WHERE user_id = auth.uid()::text LIMIT 1) = 'super_admin'
  );

CREATE POLICY "urgent_service_update" ON urgent_service_config
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.tenant_id = urgent_service_config.tenant_id
      AND admin_users.user_id = auth.uid()::text
    ) OR
    (SELECT role FROM admin_users WHERE user_id = auth.uid()::text LIMIT 1) = 'super_admin'
  );

-- messages: Solo lectura, RLS según tenant
CREATE POLICY "messages_select" ON messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.tenant_id = messages.tenant_id
      AND admin_users.user_id = auth.uid()::text
    ) OR
    (SELECT role FROM admin_users WHERE user_id = auth.uid()::text LIMIT 1) = 'super_admin'
  );

-- ===== FUNCIONES DE TRIGGER =====

-- Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Aplicar trigger a tablas con updated_at
CREATE TRIGGER update_admin_users_timestamp BEFORE UPDATE ON admin_users
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER update_tenants_timestamp BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER update_owner_data_timestamp BEFORE UPDATE ON owner_data
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER update_bot_config_timestamp BEFORE UPDATE ON bot_configurations
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER update_catalog_items_timestamp BEFORE UPDATE ON catalog_items
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER update_urgent_service_timestamp BEFORE UPDATE ON urgent_service_config
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- Función para auditoría automática
CREATE OR REPLACE FUNCTION log_audit()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_logs (
    user_id,
    action,
    entity_type,
    entity_id,
    tenant_id,
    old_values,
    new_values
  ) VALUES (
    COALESCE(auth.uid()::text, 'system'),
    TG_OP,
    TG_TABLE_NAME,
    (NEW.id)::text,
    COALESCE(NEW.tenant_id, (OLD.tenant_id)),
    CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Aplicar auditoría a tablas críticas
CREATE TRIGGER audit_tenants AFTER INSERT OR UPDATE OR DELETE ON tenants
  FOR EACH ROW EXECUTE FUNCTION log_audit();

CREATE TRIGGER audit_owner_data AFTER INSERT OR UPDATE OR DELETE ON owner_data
  FOR EACH ROW EXECUTE FUNCTION log_audit();

CREATE TRIGGER audit_bot_config AFTER INSERT OR UPDATE OR DELETE ON bot_configurations
  FOR EACH ROW EXECUTE FUNCTION log_audit();

