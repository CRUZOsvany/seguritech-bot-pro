import { User, UserState } from '@/domain/entities';
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

  async findById(tenantId: string, id: string): Promise<User | null> {
    const user = this.users.get(id);
    return user && user.tenantId === tenantId ? user : null;
  }

  async findByPhoneNumber(tenantId: string, phoneNumber: string): Promise<User | null> {
    for (const user of this.users.values()) {
      if (user.tenantId === tenantId && user.phoneNumber === phoneNumber) {
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

  async resetUserState(tenantId: string, phoneNumber: string): Promise<void> {
    for (const user of this.users.values()) {
      if (user.tenantId === tenantId && user.phoneNumber === phoneNumber) {
        user.currentState = UserState.INITIAL;
        user.updatedAt = new Date();
        this.users.set(user.id, user);
        console.log(`[UserRepository] Estado reseteado: ${phoneNumber} -> initial`);
        return;
      }
    }
  }

  // Para tests: limpiar todos los datos
  clear(): void {
    this.users.clear();
  }
}
