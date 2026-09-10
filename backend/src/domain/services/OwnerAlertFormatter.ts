/**
 * Formato compartido de la alerta que recibe el dueño cuando el bot escala
 * una conversación a humano (escape_to_human). Antes vivía como método
 * privado de BotController.enrichOwnerAlert — se extrae aquí (depuración
 * motor+simulador, Fase 2) para que SimulateMessageUseCase (el panel de
 * simulación) genere EXACTAMENTE el mismo texto que el dueño recibiría de
 * verdad, en vez de mostrar el owner_alert_template crudo del flow.
 *
 * Agrega al alert escrito a mano en el flow un pie fijo con: link wa.me al
 * cliente, hora actual, y el código para reanudarlo con #listo — sin
 * depender de que cada molde lo repita (P4).
 */

function normalizeDigits(phone: string): string {
  return phone.replace(/\D/g, '');
}

export function enrichOwnerAlert(alert: string, clientPhone: string): string {
  const digits = normalizeDigits(clientPhone);
  const code = clientPhone.slice(-4);
  const now = new Date();
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  return (
    `${alert}\n\n` +
    `💬 https://wa.me/${digits}\n` +
    `🕐 ${time}\n\n` +
    `Cuando termines: *#listo ${code}*`
  );
}
