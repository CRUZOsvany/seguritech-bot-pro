/**
 * Adaptadores de simulación del motor de conversación.
 *
 * Son puros: no tocan la base de datos, no llaman a Meta, no dependen de la
 * hora real ni del azar. Con ellos ConversationEngine corre una conversación
 * completa sin efectos externos (§8.3 de la especificación del Studio), y dos
 * corridas iguales producen exactamente lo mismo.
 */
import type { User } from '@/domain/entities';
import type { AuditPort, ClockPort, IdGenerator, UserRepository } from '@/domain/ports';
import type { MessengerPort, OutboundMessage } from '../OutboundMessage';

/** Reloj que solo avanza cuando se le pide. */
export class FakeClock implements ClockPort {
  private current: Date;

  constructor(start: Date) {
    this.current = new Date(start.getTime());
  }

  now(): Date {
    return new Date(this.current.getTime());
  }

  advanceMinutes(minutes: number): void {
    this.current = new Date(this.current.getTime() + minutes * 60_000);
  }
}

/** Ids predecibles: `sim-0001`, `sim-0002`… y folios `SIM-0001`… */
export class SequentialIdGenerator implements IdGenerator {
  private nextUuid = 1;
  private nextOrder = 1;

  uuid(): string {
    return `sim-${String(this.nextUuid++).padStart(4, '0')}`;
  }

  orderId(): string {
    return `SIM-${String(this.nextOrder++).padStart(4, '0')}`;
  }
}

/**
 * Sesiones en memoria, con la semántica de SupabaseUserRepository sobre
 * bot_users — no la de un mapa cualquiera:
 *
 * - Guarda y devuelve COPIAS. El motor lee al usuario, después marca su
 *   último mensaje y más tarde compara contra lo que leyó; con la misma
 *   referencia esa marca pisaría el dato viejo y la sesión no expiraría nunca.
 * - `update()` escribe solo las columnas que escribe el UPDATE real
 *   (current_state, current_node_id, context, human_paused_until). Reemplazar
 *   el registro entero borraría `lastInboundAt` y `optedOutAt`, que se
 *   guardan aparte (touchLastInbound, setOptOut).
 * - `save()` inserta con la pausa en null, como el INSERT real.
 */
export class InMemorySessionRepository implements UserRepository {
  private readonly users = new Map<string, User>();

  constructor(private readonly clock: ClockPort) {}

  async save(user: User): Promise<void> {
    this.users.set(user.id, {
      ...copy(user),
      humanPausedUntil: null,
      lastInboundAt: null,
      optedOutAt: null,
    });
  }

  async findById(tenantId: string, id: string): Promise<User | null> {
    const user = this.users.get(id);
    return user && user.tenantId === tenantId ? copy(user) : null;
  }

  async findByPhoneNumber(tenantId: string, phoneNumber: string): Promise<User | null> {
    const user = this.find(tenantId, phoneNumber);
    return user ? copy(user) : null;
  }

  async update(user: User): Promise<void> {
    const stored = this.users.get(user.id);
    if (!stored || stored.tenantId !== user.tenantId) return;
    const incoming = copy(user);
    this.users.set(user.id, {
      ...stored,
      currentState: incoming.currentState,
      currentNodeId: incoming.currentNodeId,
      context: incoming.context ?? {},
      humanPausedUntil: incoming.humanPausedUntil ?? null,
    });
  }

  async resetUserState(tenantId: string, phoneNumber: string): Promise<void> {
    this.patch(tenantId, phoneNumber, { currentNodeId: undefined, context: {} });
  }

  async setHumanHandoff(tenantId: string, phoneNumber: string, pausedUntil: Date | null): Promise<void> {
    this.patch(tenantId, phoneNumber, { humanPausedUntil: pausedUntil });
  }

  async listPaused(tenantId: string): Promise<User[]> {
    const now = this.clock.now();
    return [...this.users.values()]
      .filter((u) => u.tenantId === tenantId && !!u.humanPausedUntil && u.humanPausedUntil > now)
      .sort((a, b) => a.humanPausedUntil!.getTime() - b.humanPausedUntil!.getTime())
      .map(copy);
  }

  async touchLastInbound(tenantId: string, phoneNumber: string, at: Date): Promise<void> {
    this.patch(tenantId, phoneNumber, { lastInboundAt: at });
  }

  async setOptOut(tenantId: string, phoneNumber: string, optedOutAt: Date | null): Promise<void> {
    this.patch(tenantId, phoneNumber, { optedOutAt });
  }

  /** Estado actual de un contacto, para el panel de estado del simulador. */
  snapshot(tenantId: string, phoneNumber: string): User | null {
    const user = this.find(tenantId, phoneNumber);
    return user ? copy(user) : null;
  }

  private find(tenantId: string, phoneNumber: string): User | undefined {
    for (const user of this.users.values()) {
      if (user.tenantId === tenantId && user.phoneNumber === phoneNumber) return user;
    }
    return undefined;
  }

  private patch(tenantId: string, phoneNumber: string, changes: Partial<User>): void {
    const user = this.find(tenantId, phoneNumber);
    if (!user) return;
    this.users.set(user.id, { ...copy(user), ...changes, updatedAt: this.clock.now() });
  }
}

/** Messenger que no envía nada: solo anota lo que se habría enviado. */
export class CapturingMessenger implements MessengerPort {
  readonly sent: Array<{ tenantId: string; message: OutboundMessage }> = [];

  async send(tenantId: string, message: OutboundMessage): Promise<void> {
    this.sent.push({ tenantId, message });
  }

  /** Cada "escribiendo…" que el motor habría mostrado. No se manda nada. */
  readonly typingShown: Array<{ tenantId: string; to: string; messageId: string }> = [];

  async typing(tenantId: string, input: { to: string; messageId: string }): Promise<void> {
    this.typingShown.push({ tenantId, ...input });
  }
}

/** Auditoría de simulación: una prueba no deja rastro en admin_audit_log. */
export const noopAudit: AuditPort = { log: () => undefined };

function copy(user: User): User {
  return structuredClone(user);
}
