import type { DecisionStep, TransitionCandidate } from './trace';

/**
 * El "Por qué" de un turno en español claro, para quien diseña el bot.
 *
 * Una sola traducción, en el dominio: el simulador del panel y el script de
 * pruebas muestran exactamente las mismas frases. La traza cruda sigue
 * disponible para quien necesite el detalle.
 *
 * Omite a propósito la ventana de 24 h (se reabre en cada mensaje y solo
 * haría ruido: el panel la muestra aparte) y agrupa los nodos recorridos en
 * una sola línea.
 */
export function explainTrace(trace: DecisionStep[], timeZone = 'America/Mexico_City'): string[] {
  const lines: string[] = [];
  let path: string[] = [];
  const clearedKeys: string[] = [];

  const flushPath = () => {
    if (path.length > 0) lines.push(`Recorre ${path.map(q).join(' → ')}.`);
    path = [];
  };
  const when = (iso: string) => formatWhen(iso, timeZone);

  for (const step of trace) {
    if (step.kind === 'node_entered') {
      path.push(step.nodeId);
      continue;
    }
    if (step.kind === 'context_update' && step.value == null) {
      clearedKeys.push(step.key);
      continue;
    }
    flushPath();

    switch (step.kind) {
    case 'input':
      lines.push(`Llegó: "${truncate(step.content, 80)}".`);
      break;
    case 'input_ignored':
      lines.push(`Llegó un ${step.detail}: el bot no sabe procesarlo y no contesta.`);
      break;
    case 'window':
      break;
    case 'typing':
      lines.push('Se marca el mensaje como leído y el cliente ve "escribiendo…" mientras el bot arma la respuesta.');
      break;
    case 'gate':
      lines.push(explainGate(step.gate, step.detail, when));
      break;
    case 'escape_word':
      lines.push(explainEscape(step));
      break;
    case 'session_start':
      lines.push(explainStart(step.reason, step.startNodeId));
      break;
    case 'catalog_search':
      lines.push(
        step.productId
          ? `Se buscó "${truncate(step.query, 60)}" en el catálogo y se encontró un producto.`
          : `Se buscó "${truncate(step.query, 60)}" en el catálogo: sin resultados.`,
      );
      break;
    case 'validation': {
      const what = `En ${q(step.nodeId)} se esperaba ${VALIDATOR_LABEL[step.validator]}`;
      if (step.valid) lines.push(`${what} y la respuesta lo es.`);
      else if (step.exhausted) lines.push(`${what} y llegó otra cosa por ${step.attempt}ª vez: se acabaron los intentos y sigue en ${q(step.target ?? '')}.`);
      else if (step.attempt !== undefined) lines.push(`${what} y llegó otra cosa (intento ${step.attempt} de ${step.maxAttempts}): se vuelve a pedir.`);
      else lines.push(`${what} y llegó otra cosa: se vuelve a pedir.`);
      break;
    }
    case 'transitions':
      // Un empate sin ganador lo explica el paso 'ambiguous' que sigue.
      if (step.winner === null && step.candidates.some((c) => c.matched && c.condition !== 'default')) break;
      lines.push(explainTransitions(step.nodeId, step.candidates, step.winner));
      break;
    case 'ambiguous':
      lines.push(`Coinciden ${step.options.map((o) => `«${o.title}»`).join(' y ')} con la misma prioridad: en vez de adivinar, el bot pregunta cuál.`);
      break;
    case 'disambiguated':
      lines.push(`El cliente eligió «${step.title}»: sigue a ${q(step.target)}.`);
      break;
    case 'no_match':
      lines.push(`Se vuelve a mostrar ${q(step.nodeId)}.`);
      break;
    case 'context_update':
      lines.push(`Se guarda {{${step.key}}} = "${truncate(String(step.value), 60)}".`);
      break;
    case 'auto_skip':
      lines.push(
        `${q(step.nodeId)} no tenía ${step.reason === 'empty_list' ? 'opciones que mostrar' : 'productos con foto para el carrusel'}` +
          (step.target ? `: salta a ${q(step.target)}.` : ' y no tiene salida por defecto.'),
      );
      break;
    case 'wait':
      lines.push(`Espera la respuesta del cliente en ${q(step.nodeId)}.`);
      break;
    case 'flow_ended':
      lines.push('La conversación termina aquí; el próximo mensaje empieza de nuevo.');
      break;
    case 'dead_end':
      lines.push(`${q(step.nodeId)} no tiene a dónde seguir: la conversación se corta.`);
      break;
    case 'engine_error':
      lines.push(
        step.reason === 'cycle'
          ? `Error del flujo: ${q(step.nodeId)} vuelve sobre sí mismo sin esperar al cliente; se detiene.`
          : step.reason === 'node_not_found'
            ? `Error del flujo: el paso ${q(step.nodeId)} no existe.`
            : `Error del flujo: ${q(step.nodeId)} quedó vacío y no tiene salida por defecto.`,
      );
      break;
    case 'escalation':
      lines.push(
        `Pasa a una persona: el bot se calla hasta ${when(step.pausedUntil)}` +
          (step.ownerNotified ? ' y se avisa al dueño.' : '. No se pudo avisar al dueño: no tiene número configurado.'),
      );
      break;
    case 'clock_advanced':
      lines.push(`Reloj adelantado ${formatMinutes(step.minutes)}: ahora es ${when(step.now)}.`);
      break;
    case 'inactivity':
      lines.push(
        step.action === 'reminder'
          ? `El cliente lleva ${formatMinutes(step.afterMinutes)} sin contestar en ${q(step.nodeId)}: el bot manda el recordatorio (solo uno por silencio).`
          : `El cliente lleva ${formatMinutes(step.afterMinutes)} sin contestar: la conversación se cierra${step.sent ? ' con el mensaje de cierre' : ''} y el próximo mensaje empieza de nuevo.`,
      );
      break;
    }
  }
  flushPath();
  if (clearedKeys.length > 0) {
    lines.push(`Se borran las variables de la conversación (${clearedKeys.map((k) => `{{${k}}}`).join(', ')}).`);
  }
  return lines;
}

function explainGate(
  gate: Extract<DecisionStep, { kind: 'gate' }>['gate'],
  detail: string | undefined,
  when: (iso: string) => string,
): string {
  switch (gate) {
  case 'no_config':
    return 'El negocio no tiene configuración del bot: no se contesta nada.';
  case 'owner_command':
    return `Es el número del dueño con el comando "${detail ?? ''}": se atiende como comando, no como cliente.`;
  case 'opt_out':
    return `"${detail ?? ''}" es palabra de baja: se registra y se confirma una sola vez. El bot no le vuelve a escribir.`;
  case 'opt_in_implicit':
    return 'El cliente se había dado de baja; como volvió a escribir, se reactiva.';
  case 'human_paused':
    return `La conversación la está atendiendo una persona hasta ${detail ? when(detail) : 'nuevo aviso'}: el bot no contesta.`;
  case 'session_expired':
    return 'Pasó demasiado tiempo desde el último mensaje, o el negocio cerró en medio: se avisa y la conversación empieza de nuevo.';
  case 'out_of_hours':
    return 'Está fuera del horario del negocio: se manda el mensaje de "cerrado" y la conversación se queda donde iba.';
  case 'out_of_hours_notice':
    return 'Está fuera del horario del negocio, pero este flujo sigue atendiendo: primero va el mensaje de "cerrado" y la conversación empieza.';
  case 'out_of_hours_handoff':
    return 'Fuera de horario, el paso a persona usa su texto de fuera de horario. El aviso al dueño se manda igual.';
  case 'no_flow':
    return 'El negocio no tiene un flujo publicado: se contesta "en mantenimiento".';
  }
}

const VALIDATOR_LABEL: Record<Extract<DecisionStep, { kind: 'validation' }>['validator'], string> = {
  numeric: 'un número',
  number: 'un número',
  phone_mx: 'un teléfono de 10 dígitos',
  email: 'un correo',
  date: 'una fecha',
  time: 'una hora',
  text: 'un texto del largo pedido',
};

function explainEscape(step: Extract<DecisionStep, { kind: 'escape_word' }>): string {
  const what = { menu: 'volver al menú', restart: 'empezar de nuevo', human: 'hablar con una persona' }[step.category];
  if (step.handledLocally) {
    return `"${step.word}" es la palabra para ${what}, pero este paso tiene su propia respuesta para ella: se respeta el paso.`;
  }
  switch (step.category) {
  case 'menu':
    return `"${step.word}" es la palabra para volver al menú: pasa a ${q(step.target)} y conserva lo capturado.`;
  case 'restart':
    return `"${step.word}" es la palabra para empezar de nuevo: se borra lo capturado.`;
  case 'human':
    return `"${step.word}" es la palabra para hablar con una persona: pasa a ${q(step.target)}.`;
  }
}

function explainStart(
  reason: Extract<DecisionStep, { kind: 'session_start' }>['reason'],
  startNodeId: string,
): string {
  switch (reason) {
  case 'new':
    return `Conversación nueva: empieza en ${q(startNodeId)}.`;
  case 'ended':
    return `La conversación anterior había terminado: empieza de nuevo en ${q(startNodeId)}.`;
  case 'unknown_node':
    return `El paso donde iba ya no existe en el flujo: empieza en ${q(startNodeId)}.`;
  case 'escape_word':
    return `Empieza de nuevo en ${q(startNodeId)}.`;
  }
}

const CONDITION_LABEL: Record<TransitionCandidate['condition'], string> = {
  button: 'el botón',
  list_item: 'la opción',
  list_item_any: 'una opción de la lista',
  card_any: 'una tarjeta del carrusel',
  keyword: 'la palabra clave',
  service_directory_match: 'un servicio del directorio',
  catalog_found: 'un producto del catálogo',
  catalog_not_found: 'la búsqueda sin resultado',
  call_permission_granted: 'el permiso de llamada aceptado',
  call_permission_denied: 'el permiso de llamada rechazado',
  default: 'la salida por defecto',
};

function label(c: TransitionCandidate): string {
  const base = CONDITION_LABEL[c.condition];
  if (!c.detail) return base;
  return c.condition === 'keyword' ? `${base} (${truncate(c.detail, 50)})` : `${base} "${c.detail}"`;
}

function explainTransitions(
  nodeId: string,
  candidates: TransitionCandidate[],
  winner: number | null,
): string {
  if (winner === null) return `En ${q(nodeId)} la respuesta no coincide con ninguna opción.`;
  const chosen = candidates[winner];
  const alsoMatched = candidates.filter((c, i) => c.matched && i !== winner && c.condition !== 'default');
  const main = chosen.condition === 'default'
    ? `En ${q(nodeId)} la respuesta no coincide con ninguna opción específica: sigue por la salida por defecto a ${q(chosen.target)}.`
    : `En ${q(nodeId)} coincide ${label(chosen)}: sigue a ${q(chosen.target)}.`;
  if (alsoMatched.length === 0) return main;
  return `${main} También coincidía ${alsoMatched.map(label).join(' y ')}; gana la más específica.`;
}

function q(nodeId: string): string {
  return `«${nodeId}»`;
}

function truncate(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1)}…`;
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 24) return rest ? `${hours} h ${rest} min` : `${hours} h`;
  const days = Math.floor(hours / 24);
  const h = hours % 24;
  return `${days} ${days === 1 ? 'día' : 'días'}${h ? ` ${h} h` : ''}${rest ? ` ${rest} min` : ''}`;
}

function formatWhen(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('es-MX', {
    timeZone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
}
