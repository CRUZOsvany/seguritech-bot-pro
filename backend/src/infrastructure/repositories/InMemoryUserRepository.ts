import { User } from '@/domain/entities';
import { UserRepository } from '@/domain/ports';

/**
 * Adaptador en memoria de UserRepository
 * Implementación simple para desarrollo
 * En producción, se reemplazaría por una base de datos real (MongoDB, PostgreSQL, etc.)
 */
export class InMemoryUserRepository implements UserRepository {
  private users: Map<string, User> = new Map();

  async save(user: User): Promise<void> {
    this.users.set(user.id, user);
    console.log(`[UserRepository] Usuario guardado: ${user.phoneNumber}`);
  }

  async findById(id: string): Promise<User | null> {
    return this.users.get(id) || null;
  }

  async findByPhoneNumber(phoneNumber: string): Promise<User | null> {
    for (const user of this.users.values()) {
      if (user.phoneNumber === phoneNumber) {
        return user;
      }
    }
    return null;
  }

  async update(user: User): Promise<void> {
    if (this.users.has(user.id)) {
      this.users.set(user.id, user);
      console.log(`[UserRepository] Usuario actualizado: ${user.phoneNumber} -> ${user.currentState}`);
    }
  }
}
