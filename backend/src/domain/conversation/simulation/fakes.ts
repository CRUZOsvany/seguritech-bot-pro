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

  /** Adelanta hasta `at`. Nunca atrasa. */
  advanceTo(at: Date): void {
    if (at.getTime() > this.current.getTime()) this.current = new Date(at.getTime());
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
      inactivityRemindedAt: null,
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

  async listAwaitingReply(tenantId: string, lastInboundFrom: Date, lastInboundTo: Date): Promise<User[]> {
    return [...this.users.values()]
      .filter(
        (u) =>
          u.tenantId === tenantId &&
          !!u.currentNodeId &&
          u.currentNodeId !== 'end' &&
          !u.optedOutAt &&
          !!u.lastInboundAt &&
          u.lastInboundAt >= lastInboundFrom &&
          u.lastInboundAt <= lastInboundTo,
      )
      .sort((a, b) => a.lastInboundAt!.getTime() - b.lastInboundAt!.getTime())
      .map(copy);
  }

  /** Mismas condiciones que el UPDATE condicionado de SupabaseUserRepository. */
  async markInactivityReminder(tenantId: string, phoneNumber: string, lastInboundAt: Date, at: Date): Promise<boolean> {
    const user = this.find(tenantId, phoneNumber);
    if (!user || user.lastInboundAt?.getTime() !== lastInboundAt.getTime()) return false;
    if (user.inactivityRemindedAt && user.inactivityRemindedAt >= lastInboundAt) return false;
    this.patch(tenantId, phoneNumber, { inactivityRemindedAt: at });
    return true;
  }

  async closeInactiveSession(tenantId: string, phoneNumber: string, lastInboundAt: Date): Promise<boolean> {
    const user = this.find(tenantId, phoneNumber);
    if (!user || !user.currentNodeId || user.lastInboundAt?.getTime() !== lastInboundAt.getTime()) return false;
    this.patch(tenantId, phoneNumber, { currentNodeId: undefined, context: {} });
    return true;
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

/**
 * Decisión 4 de §16: el aviso al dueño por WhatsApp solo sale con su ventana
 * de 24 h abierta, y la ventana la abre un mensaje suyo al bot. Esto registra
 * ese mensaje en `at`, como si el dueño le hubiera escrito al bot. Si el
 * cliente simulado es el propio dueño no hace falta: su mensaje la abre.
 *
 * Id fijo a propósito: no consume la secuencia de ids, que cambiaría los
 * folios y rompería la paridad con producción.
 */
export async function seedOwnerWindow(
  sessions: UserRepository,
  tenantId: string,
  ownerPhone: string,
  from: string,
  at: Date,
): Promise<void> {
  const phone = ownerPhone.replace(/\D/g, '');
  if (!phone || phone === from.replace(/\D/g, '')) return;
  await sessions.save({
    id: 'sim-dueno',
    tenantId,
    phoneNumber: phone,
    currentState: 'initial' as User['currentState'],
    context: {},
    createdAt: at,
    updatedAt: at,
  });
  await sessions.touchLastInbound(tenantId, phone, at);
}

function copy(user: User): User {
  return structuredClone(user);
}
