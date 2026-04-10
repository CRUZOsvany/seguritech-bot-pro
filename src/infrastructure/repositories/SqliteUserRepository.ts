import { User, UserState } from '@/domain/entities';
import { UserRepository } from '@/domain/ports';
import sqlite3 from 'sqlite3';
import logger from '@/config/logger';

/**
 * Adaptador de SQLite para UserRepository
 * Mantiene los datos seguros aunque el servidor se reinicie.
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
        id TEXT PRIMARY KEY,
        phone_number TEXT UNIQUE,
        current_state TEXT,
        created_at DATETIME,
        updated_at DATETIME
      )
    `);

    logger.info('📦 Base de datos SQLite inicializada y tabla "users" lista.');
  }

  async save(user: User): Promise<void> {
    await this.db.run(
      'INSERT INTO users (id, phone_number, current_state, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      [user.id, user.phoneNumber, user.currentState, user.createdAt.toISOString(), user.updatedAt.toISOString()]
    );
    logger.debug(`[SqliteRepo] Usuario nuevo guardado: ${user.phoneNumber}`);
  }

  async findById(id: string): Promise<User | null> {
    const row = await this.db.get('SELECT * FROM users WHERE id = ?', [id]);
    return row ? this.mapRowToUser(row) : null;
  }

  async findByPhoneNumber(phoneNumber: string): Promise<User | null> {
    const row = await this.db.get('SELECT * FROM users WHERE phone_number = ?', [phoneNumber]);
    return row ? this.mapRowToUser(row) : null;
  }

  async update(user: User): Promise<void> {
    await this.db.run(
      'UPDATE users SET current_state = ?, updated_at = ? WHERE id = ?',
      [user.currentState, user.updatedAt.toISOString(), user.id]
    );
    logger.debug(`[SqliteRepo] Usuario actualizado: ${user.phoneNumber} -> ${user.currentState}`);
  }

  // Helper para convertir el registro de la DB a tu Entidad de Dominio
  private mapRowToUser(row: any): User {
    return {
      id: row.id,
      phoneNumber: row.phone_number,
      currentState: row.current_state as UserState,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };
  }
}
