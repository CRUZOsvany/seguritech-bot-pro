import Database from 'better-sqlite3';
import logger from '@/config/logger';
import { randomUUID } from 'crypto';
import { config } from '@/config/env';

/**
 * Interfaz para representar un Tenant (Cliente)
 */
export interface Tenant {
  id: string;
  business_name: string;
  business_type: string;
  whatsapp_number: string;
  monthly_fee: number;
  owner_name: string;
  status: 'ACTIVE' | 'PAUSED' | 'SUSPENDED';
  next_payment_date: string;
  created_at: string;
  updated_at: string;
  messages_count: number;
}

/**
 * Repositorio para gestionar la tabla de Tenants en SQLite
 * Centraliza todas las operaciones CRUD de clientes
 */
export class TenantRepository {
  private db!: Database.Database;

  /**
   * Inicializa la conexión a SQLite y crea la tabla si no existe
   */
  async initialize(): Promise<void> {
    const dbPath = config.database?.url || './database.sqlite';
    this.db = new Database(dbPath);

    // Habilitar WAL para mejor concurrencia
    this.db.pragma('journal_mode = WAL');

    // Crear tabla si no existe
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tenants (
        id TEXT PRIMARY KEY,
        business_name TEXT NOT NULL,
        business_type TEXT NOT NULL,
        whatsapp_number TEXT NOT NULL UNIQUE,
        monthly_fee REAL NOT NULL,
        owner_name TEXT NOT NULL,
        status TEXT DEFAULT 'ACTIVE',
        next_payment_date DATE NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        messages_count INTEGER DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status);
      CREATE INDEX IF NOT EXISTS idx_tenants_payment_date ON tenants(next_payment_date);
    `);

    logger.info('📦 Tabla de tenants inicializada correctamente');
  }

  /**
   * Crear un nuevo tenant
   */
  async create(tenant: Omit<Tenant, 'id' | 'created_at' | 'updated_at' | 'messages_count'>): Promise<Tenant> {
    const id = randomUUID();
    const now = new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO tenants (id, business_name, business_type, whatsapp_number, monthly_fee, owner_name, status, next_payment_date, created_at, updated_at, messages_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      tenant.business_name,
      tenant.business_type,
      tenant.whatsapp_number,
      tenant.monthly_fee,
      tenant.owner_name,
      tenant.status,
      tenant.next_payment_date,
      now,
      now,
      0
    );

    logger.info(`Tenant creado: ${tenant.business_name} (${id})`);
    return {
      ...tenant,
      id,
      created_at: now,
      updated_at: now,
      messages_count: 0,
    };
  }

  /**
   * Obtener todos los tenants
   */
  async getAll(): Promise<Tenant[]> {
    const stmt = this.db.prepare('SELECT * FROM tenants ORDER BY created_at DESC');
    const rows = stmt.all() as Tenant[];
    return rows;
  }

  /**
   * Obtener un tenant por ID
   */
  async getById(id: string): Promise<Tenant | null> {
    const stmt = this.db.prepare('SELECT * FROM tenants WHERE id = ?');
    const row = stmt.get(id) as Tenant | undefined;
    return row || null;
  }

  /**
   * Actualizar un tenant
   */
  async update(id: string, updates: Partial<Omit<Tenant, 'id' | 'created_at'>>): Promise<Tenant | null> {
    const set: string[] = [];
    const values: any[] = [];

    // Construir dinámicamente el SET
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        set.push(`${key} = ?`);
        values.push(value);
      }
    }

    if (set.length === 0) {
      return this.getById(id);
    }

    set.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(id);

    const stmt = this.db.prepare(`UPDATE tenants SET ${set.join(', ')} WHERE id = ?`);
    stmt.run(...values);

    logger.info(`Tenant actualizado: ${id}`);
    return this.getById(id);
  }

  /**
   * Cambiar el estado de un tenant (ACTIVE, PAUSED, SUSPENDED)
   */
  async updateStatus(id: string, status: 'ACTIVE' | 'PAUSED' | 'SUSPENDED'): Promise<Tenant | null> {
    return this.update(id, { status });
  }

  /**
   * Obtener tenants con pago vencido
   */
  async getOverduePayments(): Promise<Tenant[]> {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const stmt = this.db.prepare(
      'SELECT * FROM tenants WHERE next_payment_date < ? ORDER BY next_payment_date ASC'
    );
    const rows = stmt.all(today) as Tenant[];
    return rows;
  }

  /**
   * Obtener estadísticas de tenants
   */
  async getStats(): Promise<{
    total: number;
    active: number;
    paused: number;
    suspended: number;
    totalMessages: number;
  }> {
    const stmt = this.db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'ACTIVE' THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN status = 'PAUSED' THEN 1 ELSE 0 END) as paused,
        SUM(CASE WHEN status = 'SUSPENDED' THEN 1 ELSE 0 END) as suspended,
        COALESCE(SUM(messages_count), 0) as totalMessages
      FROM tenants
    `);
    const row = stmt.get() as any;
    return {
      total: row?.total || 0,
      active: row?.active || 0,
      paused: row?.paused || 0,
      suspended: row?.suspended || 0,
      totalMessages: row?.totalMessages || 0,
    };
  }

  /**
   * Incrementar el contador de mensajes para un tenant
   */
  async incrementMessageCount(id: string, count: number = 1): Promise<void> {
    const stmt = this.db.prepare(
      'UPDATE tenants SET messages_count = messages_count + ? WHERE id = ?'
    );
    stmt.run(count, id);
  }

  /**
   * Crear tabla de configuración de bot para cada tenant
   */
  async createBotConfigTable(): Promise<void> {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS bot_configurations (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL UNIQUE,
        welcome_message TEXT DEFAULT 'Bienvenido a nuestro servicio',
        catalog_json TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id)
      );
      CREATE INDEX IF NOT EXISTS idx_bot_config_tenant ON bot_configurations(tenant_id);
    `);

    logger.info('📦 Tabla de configuraciones de bot inicializada');
  }

  /**
   * Guardar configuración de bienvenida para un tenant
   */
  async setBotWelcomeMessage(tenantId: string, message: string): Promise<void> {
    const id = randomUUID();
    const now = new Date().toISOString();

    // Primero intentar actualizar
    const updateStmt = this.db.prepare(
      'UPDATE bot_configurations SET welcome_message = ?, updated_at = ? WHERE tenant_id = ?'
    );
    updateStmt.run(message, now, tenantId);

    // Si no hubo actualización, crear nuevo registro
    const insertStmt = this.db.prepare(
      'INSERT OR IGNORE INTO bot_configurations (id, tenant_id, welcome_message, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
    );
    insertStmt.run(id, tenantId, message, now, now);

    logger.info(`Mensaje de bienvenida actualizado para tenant ${tenantId}`);
  }

  /**
   * Obtener configuración de bienvenida para un tenant
   */
  async getBotWelcomeMessage(tenantId: string): Promise<string> {
    const stmt = this.db.prepare(
      'SELECT welcome_message FROM bot_configurations WHERE tenant_id = ?'
    );
    const row = stmt.get(tenantId) as any | undefined;
    return row?.welcome_message || 'Bienvenido a nuestro servicio';
  }

  /**
   * Obtener tabla de mensajes del día para un tenant
   */
  async createMessageLogTable(): Promise<void> {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS message_logs (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        phone_number TEXT NOT NULL,
        message TEXT NOT NULL,
        response TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id)
      );
      CREATE INDEX IF NOT EXISTS idx_logs_tenant_date ON message_logs(tenant_id, created_at);
    `);

    logger.info('📦 Tabla de logs de mensajes inicializada');
  }

  /**
   * Registrar un mensaje en el log del día
   */
  async logMessage(tenantId: string, phoneNumber: string, message: string, response?: string): Promise<void> {
    const id = randomUUID();
    const stmt = this.db.prepare(
      'INSERT INTO message_logs (id, tenant_id, phone_number, message, response) VALUES (?, ?, ?, ?, ?)'
    );
    stmt.run(id, tenantId, phoneNumber, message, response || null);
  }

  /**
   * Obtener logs del día para un tenant específico
   */
  async getMessagesForToday(tenantId: string): Promise<any[]> {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const stmt = this.db.prepare(`
      SELECT * FROM message_logs 
      WHERE tenant_id = ? AND DATE(created_at) = ? 
      ORDER BY created_at DESC
    `);
    const rows = stmt.all(tenantId, today) as any[];
    return rows;
  }

  /**
   * Cerrar la conexión a la base de datos
   */
  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
    }
  }
}

