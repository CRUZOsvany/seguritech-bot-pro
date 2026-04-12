import { User, UserState } from '@/domain/entities';
import { UserRepository } from '@/domain/ports';
import sqlite3 from 'sqlite3';
import logger from '@/config/logger';

/**
 * Adaptador de SQLite para UserRepository
 * Implementa aislamiento multi-tenant mediante tenantId
 * Todas las consultas filtran por tenantId para garantizar seguridad de datos
 */
export class SqliteUserRepository implements UserRepository {
  private db!: sqlite3.Database;

  // Inicializa la conexión y crea la tabla si no existe
  async initialize(): Promise<void> {
    this.db = new sqlite3.Database('./database.sqlite', (err) => {
      if (err) {
        logger.error('Error abriendo DB:', err);
        throw err;
      }
    });

    await this.db.exec(`
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
    await this.db.run(
      'INSERT INTO users (id, tenant_id, phone_number, current_state, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [user.id, user.tenantId, user.phoneNumber, user.currentState, user.createdAt.toISOString(), user.updatedAt.toISOString()]
    );
    logger.debug(`[SqliteRepo] Nuevo usuario guardado en tenant ${user.tenantId}: ${user.phoneNumber}`);
  }

  async findById(tenantId: string, id: string): Promise<User | null> {
    const row = await this.db.get(
      'SELECT * FROM users WHERE tenant_id = ? AND id = ?',
      [tenantId, id]
    );
    return row ? this.mapRowToUser(row) : null;
  }

  async findByPhoneNumber(tenantId: string, phoneNumber: string): Promise<User | null> {
    const row = await this.db.get(
      'SELECT * FROM users WHERE tenant_id = ? AND phone_number = ?',
      [tenantId, phoneNumber]
    );
    return row ? this.mapRowToUser(row) : null;
  }

  async update(user: User): Promise<void> {
    await this.db.run(
      'UPDATE users SET current_state = ?, updated_at = ? WHERE tenant_id = ? AND id = ?',
      [user.currentState, user.updatedAt.toISOString(), user.tenantId, user.id]
    );
    logger.debug(`[SqliteRepo] Usuario actualizado en tenant ${user.tenantId}: ${user.phoneNumber} -> ${user.currentState}`);
  }

  // Helper para convertir el registro de la DB a tu Entidad de Dominio
  private mapRowToUser(row: any): User {
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
