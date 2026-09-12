/**
 * Formato compartido de la alerta que recibe el dueño cuando el bot escala
 * una conversación a humano (escape_to_human). Antes vivía como método
 * privado de BotController.enrichOwnerAlert — se extrajo aquí (depuración
 * motor+simulador, Fase 2) para que el simulador muestre EXACTAMENTE el
 * mismo texto que el dueño recibiría de verdad, en vez del
 * owner_alert_template crudo del flow. Hoy lo llama ConversationEngine.
 *
 * Agrega al alert escrito a mano en el flow un pie fijo con: link wa.me al
 * cliente, hora actual, y el código para reanudarlo con #listo — sin
 * depender de que cada molde lo repita (P4).
 */

function normalizeDigits(phone: string): string {
  return phone.replace(/\D/g, '');
}

/**
 * `now` viene del reloj del motor (ClockPort). La hora se formatea con la
 * zona del proceso, igual que siempre: en un contenedor en UTC el dueño ve la
 * hora UTC. No se corrige aquí porque cambiaría lo que recibe hoy.
 */
export function enrichOwnerAlert(alert: string, clientPhone: string, now: Date = new Date()): string {
  const digits = normalizeDigits(clientPhone);
  const code = clientPhone.slice(-4);
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  return (
    `${alert}\n\n` +
    `💬 https://wa.me/${digits}\n` +
    `🕐 ${time}\n\n` +
    `Cuando termines: *#listo ${code}*`
  );
}
