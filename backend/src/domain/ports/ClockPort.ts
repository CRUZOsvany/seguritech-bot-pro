/**
 * Reloj del motor de conversación.
 *
 * El motor nunca lee la hora del sistema por su cuenta: la pide aquí. En
 * producción la da el reloj del sistema; en el simulador, un reloj falso que
 * el operador puede adelantar para probar inactividad, expiración de sesión o
 * el cierre de la ventana de 24 h sin esperar de verdad.
 */
export interface ClockPort {
  now(): Date;
}

/**
 * Generador de identificadores del motor.
 *
 * Mismo motivo que ClockPort: con ids aleatorios dos corridas de la misma
 * conversación producen payloads distintos, y el test de paridad
 * simulador ↔ producción no puede compararlos.
 */
export interface IdGenerator {
  /** Id de entidad (mensajes, usuarios nuevos). */
  uuid(): string;
  /** Folio corto que ve el cliente en {{order_id}}. */
  orderId(): string;
}
