import Database from 'better-sqlite3';
import { User, UserState } from '@/domain/entities';
import { UserRepository } from '@/domain/ports';
import logger from '@/config/logger';
import { config } from '@/config/env';

/**
 * Adaptador de SQLite para UserRepository
 * Implementa aislamiento multi-tenant mediante tenantId
 * Todas las consultas filtran por tenantId para garantizar seguridad de datos
 */
export class SqliteUserRepository implements UserRepository {
  private db!: Database.Database;

  // Inicializa la conexión y crea la tabla si no existe
  async initialize(): Promise<void> {
    const dbPath = config.database?.url || './database.sqlite';
    this.db = new Database(dbPath);

    // Habilitar WAL para mejor concurrencia
    this.db.pragma('journal_mode = WAL');

    // Crear tabla si no existe
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT,
        tenant_id TEXT NOT NULL,
        phone_number TEXT NOT NULL,
        current_state TEXT,
        created_at DATETIME,
        updated_at DATETIME,
        PRIMARY KEY (tenant_id, id),
        UNIQUE (tenant_id, phone_number)
      );
      CREATE INDEX IF NOT EXISTS idx_users_tenant_id ON users(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_users_tenant_phone ON users(tenant_id, phone_number);
    `);

    logger.info('📦 Base de datos SQLite inicializada con aislamiento multi-tenant');
  }

  async save(user: User): Promise<void> {
    const stmt = this.db.prepare(
      'INSERT INTO users (id, tenant_id, phone_number, current_state, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
    );
    stmt.run(user.id, user.tenantId, user.phoneNumber, user.currentState, user.createdAt.toISOString(), user.updatedAt.toISOString());
    logger.debug(`[SqliteRepo] Nuevo usuario guardado en tenant ${user.tenantId}: ${user.phoneNumber}`);
  }

  async findById(tenantId: string, id: string): Promise<User | null> {
    const stmt = this.db.prepare(
      'SELECT * FROM users WHERE tenant_id = ? AND id = ?'
    );
    const row = stmt.get(tenantId, id) as Record<string, any> | undefined;
    return row ? this.mapRowToUser(row) : null;
  }

  async findByPhoneNumber(tenantId: string, phoneNumber: string): Promise<User | null> {
    const stmt = this.db.prepare(
      'SELECT * FROM users WHERE tenant_id = ? AND phone_number = ?'
    );
    const row = stmt.get(tenantId, phoneNumber) as Record<string, any> | undefined;
    return row ? this.mapRowToUser(row) : null;
  }

  async update(user: User): Promise<void> {
    const stmt = this.db.prepare(
      'UPDATE users SET current_state = ?, updated_at = ? WHERE tenant_id = ? AND id = ?'
    );
    stmt.run(user.currentState, user.updatedAt.toISOString(), user.tenantId, user.id);
    logger.debug(`[SqliteRepo] Usuario actualizado en tenant ${user.tenantId}: ${user.phoneNumber} -> ${user.currentState}`);
  }

  async resetUserState(tenantId: string, phoneNumber: string): Promise<void> {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(
      'UPDATE users SET current_state = ?, updated_at = ? WHERE tenant_id = ? AND phone_number = ?'
    );
    stmt.run('initial', now, tenantId, phoneNumber);
    logger.debug(`[SqliteRepo] Estado reseteado para usuario en tenant ${tenantId}: ${phoneNumber} -> initial`);
  }

  // Helper para convertir el registro de la DB a tu Entidad de Dominio
  private mapRowToUser(row: Record<string, any>): User {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      phoneNumber: row.phone_number,
      currentState: row.current_state as UserState,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };
  }
}

