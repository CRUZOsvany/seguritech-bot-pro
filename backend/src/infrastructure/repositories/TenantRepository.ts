import sqlite3 from 'sqlite3';
import logger from '@/config/logger';
import { randomUUID } from 'crypto';

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
  private db!: sqlite3.Database;

  /**
   * Inicializa la conexión a SQLite y crea la tabla si no existe
   */
  async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database('./database.sqlite', (err: Error | null) => {
        if (err) {
          logger.error('Error abriendo DB:', err);
          reject(err);
        } else {
          this.db.exec(
            `
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
          `,
            (execErr: Error | null) => {
              if (execErr) {
                logger.error('Error creando tabla tenants:', execErr);
                reject(execErr);
              } else {
                logger.info('📦 Tabla de tenants inicializada correctamente');
                resolve();
              }
            }
          );
        }
      });
    });
  }

  /**
   * Crear un nuevo tenant
   */
  async create(tenant: Omit<Tenant, 'id' | 'created_at' | 'updated_at' | 'messages_count'>): Promise<Tenant> {
    return new Promise((resolve, reject) => {
      const id = randomUUID();
      const now = new Date().toISOString();

      this.db.run(
        `INSERT INTO tenants (id, business_name, business_type, whatsapp_number, monthly_fee, owner_name, status, next_payment_date, created_at, updated_at, messages_count)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
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
          0,
        ],
        (err: Error | null) => {
          if (err) {
            logger.error(`Error creating tenant:`, err);
            reject(err);
          } else {
            logger.info(`Tenant creado: ${tenant.business_name} (${id})`);
            resolve({
              ...tenant,
              id,
              created_at: now,
              updated_at: now,
              messages_count: 0,
            });
          }
        }
      );
    });
  }

  /**
   * Obtener todos los tenants
   */
  async getAll(): Promise<Tenant[]> {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM tenants ORDER BY created_at DESC',
        (err: Error | null, rows: any[] | undefined) => {
          if (err) {
            logger.error('Error fetching tenants:', err);
            reject(err);
          } else {
            resolve(rows || []);
          }
        }
      );
    });
  }

  /**
   * Obtener un tenant por ID
   */
  async getById(id: string): Promise<Tenant | null> {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM tenants WHERE id = ?',
        [id],
        (err: Error | null, row: any | undefined) => {
          if (err) {
            logger.error('Error fetching tenant:', err);
            reject(err);
          } else {
            resolve(row || null);
          }
        }
      );
    });
  }

  /**
   * Actualizar un tenant
   */
  async update(id: string, updates: Partial<Omit<Tenant, 'id' | 'created_at'>>): Promise<Tenant | null> {
    return new Promise((resolve, reject) => {
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
        resolve(await this.getById(id));
        return;
      }

      set.push('updated_at = ?');
      values.push(new Date().toISOString());
      values.push(id);

      this.db.run(
        `UPDATE tenants SET ${set.join(', ')} WHERE id = ?`,
        values,
        (err: Error | null) => {
          if (err) {
            logger.error('Error updating tenant:', err);
            reject(err);
          } else {
            logger.info(`Tenant actualizado: ${id}`);
            this.getById(id).then(resolve).catch(reject);
          }
        }
      );
    });
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
    return new Promise((resolve, reject) => {
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      this.db.all(
        'SELECT * FROM tenants WHERE next_payment_date < ? ORDER BY next_payment_date ASC',
        [today],
        (err: Error | null, rows: any[] | undefined) => {
          if (err) {
            logger.error('Error fetching overdue payments:', err);
            reject(err);
          } else {
            resolve(rows || []);
          }
        }
      );
    });
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
    return new Promise((resolve, reject) => {
      this.db.get(
        `SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN status = 'ACTIVE' THEN 1 ELSE 0 END) as active,
          SUM(CASE WHEN status = 'PAUSED' THEN 1 ELSE 0 END) as paused,
          SUM(CASE WHEN status = 'SUSPENDED' THEN 1 ELSE 0 END) as suspended,
          COALESCE(SUM(messages_count), 0) as totalMessages
        FROM tenants`,
        (err: Error | null, row: any | undefined) => {
          if (err) {
            logger.error('Error fetching stats:', err);
            reject(err);
          } else {
            resolve({
              total: row?.total || 0,
              active: row?.active || 0,
              paused: row?.paused || 0,
              suspended: row?.suspended || 0,
              totalMessages: row?.totalMessages || 0,
            });
          }
        }
      );
    });
  }

  /**
   * Incrementar el contador de mensajes para un tenant
   */
  async incrementMessageCount(id: string, count: number = 1): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(
        'UPDATE tenants SET messages_count = messages_count + ? WHERE id = ?',
        [count, id],
        (err: Error | null) => {
          if (err) {
            logger.error('Error incrementing message count:', err);
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });
  }

  /**
   * Crear tabla de configuración de bot para cada tenant
   */
  async createBotConfigTable(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.exec(
        `
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
      `,
        (execErr: Error | null) => {
          if (execErr) {
            logger.error('Error creating bot_configurations table:', execErr);
            reject(execErr);
          } else {
            logger.info('📦 Tabla de configuraciones de bot inicializada');
            resolve();
          }
        }
      );
    });
  }

  /**
   * Guardar configuración de bienvenida para un tenant
   */
  async setBotWelcomeMessage(tenantId: string, message: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const id = randomUUID();
      const now = new Date().toISOString();

      // Primero intentar actualizar
      this.db.run(
        'UPDATE bot_configurations SET welcome_message = ?, updated_at = ? WHERE tenant_id = ?',
        [message, now, tenantId],
        (err: Error | null) => {
          if (err) {
            logger.error('Error updating welcome message:', err);
            reject(err);
          } else {
            // Si no hubo actualización, crear nuevo registro
            this.db.run(
              'INSERT OR IGNORE INTO bot_configurations (id, tenant_id, welcome_message, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
              [id, tenantId, message, now, now],
              (insertErr: Error | null) => {
                if (insertErr && !insertErr.message.includes('UNIQUE constraint failed')) {
                  logger.error('Error creating bot config:', insertErr);
                  reject(insertErr);
                } else {
                  logger.info(`Mensaje de bienvenida actualizado para tenant ${tenantId}`);
                  resolve();
                }
              }
            );
          }
        }
      );
    });
  }

  /**
   * Obtener configuración de bienvenida para un tenant
   */
  async getBotWelcomeMessage(tenantId: string): Promise<string> {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT welcome_message FROM bot_configurations WHERE tenant_id = ?',
        [tenantId],
        (err: Error | null, row: any | undefined) => {
          if (err) {
            logger.error('Error fetching welcome message:', err);
            reject(err);
          } else {
            resolve(row?.welcome_message || 'Bienvenido a nuestro servicio');
          }
        }
      );
    });
  }

  /**
   * Obtener tabla de mensajes del día para un tenant
   */
  async createMessageLogTable(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.exec(
        `
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
      `,
        (execErr: Error | null) => {
          if (execErr) {
            logger.error('Error creating message_logs table:', execErr);
            reject(execErr);
          } else {
            logger.info('📦 Tabla de logs de mensajes inicializada');
            resolve();
          }
        }
      );
    });
  }

  /**
   * Registrar un mensaje en el log del día
   */
  async logMessage(tenantId: string, phoneNumber: string, message: string, response?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const id = randomUUID();
      this.db.run(
        'INSERT INTO message_logs (id, tenant_id, phone_number, message, response) VALUES (?, ?, ?, ?, ?)',
        [id, tenantId, phoneNumber, message, response || null],
        (err: Error | null) => {
          if (err) {
            logger.error('Error logging message:', err);
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });
  }

  /**
   * Obtener logs del día para un tenant específico
   */
  async getMessagesForToday(tenantId: string): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      this.db.all(
        `SELECT * FROM message_logs 
         WHERE tenant_id = ? AND DATE(created_at) = ? 
         ORDER BY created_at DESC`,
        [tenantId, today],
        (err: Error | null, rows: any[] | undefined) => {
          if (err) {
            logger.error('Error fetching message logs:', err);
            reject(err);
          } else {
            resolve(rows || []);
          }
        }
      );
    });
  }

  /**
   * Cerrar la conexión a la base de datos
   */
  async close(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.db) {
        this.db.close((err: Error | null) => {
          if (err) reject(err);
          else resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

