import sqlite3 from 'sqlite3';
import { User, UserState } from '@/domain/entities';
import { UserRepository } from '@/domain/ports';

/**
 * Repositorio SQLite en Memoria para Testing
 * Utiliza `:memory:` para garantizar aislamiento entre tests
 * y rápido rendimiento
 */
export class InMemoryTestRepository implements UserRepository {
  private db!: sqlite3.Database;

  async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(':memory:', (err: Error | null) => {
        if (err) {
          reject(err);
        } else {
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
          `, (execErr: Error | null) => {
            if (execErr) {
              reject(execErr);
            } else {
              resolve();
            }
          });
        }
      });
    });
  }

  async save(user: User): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(
        'INSERT INTO users (id, tenant_id, phone_number, current_state, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        [
          user.id,
          user.tenantId,
          user.phoneNumber,
          user.currentState,
          user.createdAt.toISOString(),
          user.updatedAt.toISOString(),
        ],
        (err: Error | null) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  async findById(tenantId: string, id: string): Promise<User | null> {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM users WHERE tenant_id = ? AND id = ?',
        [tenantId, id],
        (err: Error | null, row: Record<string, any> | undefined) => {
          if (err) reject(err);
          else resolve(row ? this.mapRowToUser(row) : null);
        }
      );
    });
  }

  async findByPhoneNumber(tenantId: string, phoneNumber: string): Promise<User | null> {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM users WHERE tenant_id = ? AND phone_number = ?',
        [tenantId, phoneNumber],
        (err: Error | null, row: Record<string, any> | undefined) => {
          if (err) reject(err);
          else resolve(row ? this.mapRowToUser(row) : null);
        }
      );
    });
  }

  async update(user: User): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(
        'UPDATE users SET current_state = ?, updated_at = ? WHERE tenant_id = ? AND id = ?',
        [user.currentState, user.updatedAt.toISOString(), user.tenantId, user.id],
        (err: Error | null) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  async resetUserState(tenantId: string, phoneNumber: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const now = new Date().toISOString();
      this.db.run(
        'UPDATE users SET current_state = ?, updated_at = ? WHERE tenant_id = ? AND phone_number = ?',
        ['initial', now, tenantId, phoneNumber],
        (err: Error | null) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  private mapRowToUser(row: Record<string, any>): User {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      phoneNumber: row.phone_number,
      currentState: row.current_state as UserState,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  async cleanup(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.close((err: Error | null) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /**
   * Obtiene todos los datos de la base para debugging
   */
  async getAllData(): Promise<any[]> {
    return new Promise((resolve, reject) => {
      this.db.all('SELECT * FROM users', (err: Error | null, rows: any[] | undefined) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }
}

