#!/usr/bin/env node
/**
 * Simula una conversación contra el endpoint del Studio y la imprime legible,
 * con el "Por qué" de cada respuesta.
 *
 *   node backend/scripts/studio/simular.mjs --tenant <uuid> [opciones]
 *
 * Opciones:
 *   --tenant <uuid>         Tenant (el id que aparece en la URL del panel: /app/tenants/<uuid>). Obligatorio.
 *   --conversacion <ruta>   JSON con { "events": [...], "startAt"?: "..." }. Default: ejemplo-papeleria.json
 *   --flow <id>             Flow a simular. Default: el flow de WhatsApp del tenant.
 *   --fuente draft|active   Borrador (default) o lo que el bot contesta hoy.
 *   --url <base>            Default: http://127.0.0.1:3001
 *   --json                  Imprime la respuesta cruda en vez de la versión legible.
 *
 * El login pide correo y contraseña en la terminal. No se guardan en ningún
 * lado ni se pasan por argumentos (regla 3 del proyecto). Si ya tienes la
 * cookie de sesión del navegador, puedes pasarla en SEGURITECH_COOKIE
 * ("seguritech_session=…") y el script no pregunta nada.
 *
 * No escribe nada en la base ni manda nada a WhatsApp: el endpoint simula.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';

const here = dirname(fileURLToPath(import.meta.url));
const args = parseArgs(process.argv.slice(2));

if (!args.tenant) {
  console.error('Falta --tenant <uuid>. Uso: node backend/scripts/studio/simular.mjs --tenant <uuid> [--conversacion archivo.json]');
  process.exit(1);
}

const base = (args.url ?? 'http://127.0.0.1:3001').replace(/\/$/, '');
const conversationPath = resolve(args.conversacion ?? resolve(here, 'ejemplo-papeleria.json'));
const conversation = JSON.parse(readFileSync(conversationPath, 'utf8'));

const cookie = process.env.SEGURITECH_COOKIE || (await login());
const flowId = args.flow ?? (await resolveFlowId(args.tenant));

const res = await fetch(`${base}/api/admin/tenants/${args.tenant}/studio/flows/${flowId}/simulate`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Cookie: cookie },
  body: JSON.stringify({
    events: conversation.events,
    source: args.fuente ?? 'draft',
    ...(conversation.startAt ? { startAt: conversation.startAt } : {}),
  }),
});
const body = await res.json().catch(() => ({}));
if (!res.ok) {
  console.error(`El endpoint respondió ${res.status}: ${body.error ?? JSON.stringify(body)}`);
  if (body.issues) console.error(JSON.stringify(body.issues, null, 2));
  process.exit(1);
}

if (args.json) {
  console.log(JSON.stringify(body, null, 2));
} else {
  printConversation(conversation.events, body);
}

// ---------------------------------------------------------------------------

async function login() {
  const email = await ask('Correo del panel: ');
  const password = await ask('Contraseña: ', { hidden: true });
  const r = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    console.error(`No se pudo entrar (${r.status}): ${data.error ?? 'error desconocido'}`);
    process.exit(1);
  }
  if (data.mustChangePassword) {
    console.error('La cuenta tiene que cambiar su contraseña: entra primero al panel y cámbiala.');
    process.exit(1);
  }
  const setCookie = r.headers.get('set-cookie');
  if (!setCookie) {
    console.error('El login no devolvió cookie de sesión.');
    process.exit(1);
  }
  return setCookie.split(';')[0];
}

async function resolveFlowId(tenantId) {
  const r = await fetch(`${base}/api/admin/tenants/${tenantId}/flows`, { headers: { Cookie: cookie } });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    console.error(`No se pudieron listar los flows (${r.status}): ${data.error ?? ''}`);
    process.exit(1);
  }
  const flows = data.flows ?? [];
  const chosen = flows.find((f) => f.channel === 'whatsapp' && f.isActive) ?? flows.find((f) => f.channel === 'whatsapp') ?? flows[0];
  if (!chosen) {
    console.error('Ese tenant no tiene flows. Asígnale un molde desde el panel.');
    process.exit(1);
  }
  return chosen.id;
}

function printConversation(events, body) {
  const c = { dim: '\x1b[2m', bold: '\x1b[1m', green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m', reset: '\x1b[0m' };
  console.log(`${c.dim}Fuente: ${body.source} · flow ${body.flowId} · cliente ${body.from} · inicio ${body.startAt}${c.reset}\n`);

  body.turns.forEach((turn, i) => {
    console.log(`${c.bold}${eventLabel(events[i])}${c.reset}`);
    for (const out of turn.outbound) {
      const who = out.audience === 'owner' ? `${c.yellow}🔔 Al dueño` : `${c.green}🤖 Bot`;
      const text = out.payload ? describePayload(out.payload) : `(no se enviaría: ${out.rejected})`;
      console.log(`${who}:${c.reset} ${indent(text, 4)}`);
    }
    if (turn.outbound.length === 0) console.log(`${c.dim}   (el bot no manda nada)${c.reset}`);
    console.log(`${c.cyan}   Por qué:${c.reset}`);
    for (const line of turn.why) console.log(`${c.dim}   · ${line}${c.reset}`);
    console.log();
  });

  const last = body.turns.at(-1)?.session;
  if (last) {
    const vars = Object.entries(last.context).filter(([, v]) => v != null);
    console.log(`${c.bold}Estado final${c.reset}: paso «${last.currentNodeId ?? '—'}»` +
      (last.humanPausedUntil ? ` · en manos de una persona hasta ${last.humanPausedUntil}` : '') +
      (last.optedOut ? ' · dado de baja' : ''));
    for (const [k, v] of vars) console.log(`  {{${k}}} = ${JSON.stringify(v)}`);
  }
  const total = body.turns.reduce((acc, t) => acc + t.billing.serviceMessages, 0);
  console.log(`${c.dim}Mensajes enviados en la conversación: ${total}${c.reset}`);
}

function eventLabel(e) {
  switch (e?.type) {
  case 'text': return `👤 Cliente: ${e.text}`;
  case 'button_reply': return `👤 Cliente toca el botón: ${e.title}`;
  case 'list_reply': return `👤 Cliente elige: ${e.title || e.id}`;
  case 'location': return '👤 Cliente comparte su ubicación';
  case 'media': return `👤 Cliente manda: ${e.mediaType}`;
  case 'advance_time': return `⏩ Pasan ${e.minutes} min`;
  default: return '👤 ?';
  }
}

function describePayload(p) {
  switch (p.type) {
  case 'text': return p.text.body;
  case 'image': return `[imagen] ${p.image.caption ?? ''} ${p.image.link}`;
  case 'document': return `[documento ${p.document.filename}] ${p.document.caption ?? ''}`;
  case 'location': return `[ubicación] ${p.location.name ?? ''} ${p.location.address ?? ''}`;
  case 'reaction': return `[reacción ${p.reaction.emoji}]`;
  case 'interactive': {
    const i = p.interactive;
    const body = i.body?.text ?? '';
    if (i.type === 'button') return `${body}\n[ ${i.action.buttons.map((b) => b.reply.title).join(' ] [ ')} ]`;
    if (i.type === 'list') {
      const rows = i.action.sections.flatMap((s) => s.rows.map((r) => `  · ${r.title}${r.description ? ` — ${r.description}` : ''}`));
      return `${body}\n▤ ${i.action.button}\n${rows.join('\n')}`;
    }
    if (i.type === 'cta_url') return `${body}\n[🔗 ${i.action.parameters.display_text}] ${i.action.parameters.url}`;
    if (i.type === 'location_request_message') return `${body}\n[📍 Enviar ubicación]`;
    if (i.type === 'media_carousel') return `${body}\n${i.action.sections[0].cards.map((card, n) => `  [tarjeta ${n + 1}] ${card.body.text}`).join('\n')}`;
    return `${body} [${i.type}]`;
  }
  default: return JSON.stringify(p);
  }
}

function indent(text, spaces) {
  return String(text).split('\n').join(`\n${' '.repeat(spaces)}`);
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[key] = true;
    else { out[key] = next; i++; }
  }
  return out;
}

function ask(question, { hidden = false } = {}) {
  return new Promise((done) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      // Oculta lo que se teclea: solo se imprime la pregunta.
      rl._writeToOutput = (s) => { if (s.includes(question)) process.stdout.write(question); };
    }
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write('\n');
      done(answer.trim());
    });
  });
}
