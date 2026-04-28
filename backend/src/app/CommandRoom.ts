/**
 * ============================================================================
 * CommandRoom.ts — Cuarto de Poder SegurITech Bot Pro
 * ============================================================================
 * Terminal administrativa profesional para gestión de clientes y bots.
 * Usa: readline nativo + chalk. Sin dependencias externas pesadas.
 *
 * Ejecutar: npm run admin
 * ============================================================================
 */

import * as readline from 'readline';
import * as crypto from 'crypto';
import { createLogger } from '@/config/logger';
import { ApplicationContainer } from '@/app/ApplicationContainer';
import { SqliteUserRepository } from '@/infrastructure/repositories/SqliteUserRepository';
import { ConsoleNotificationAdapter } from '@/infrastructure/adapters/ConsoleNotificationAdapter';

// ─── Chalk dinámico compatible con ESM y CJS ─────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-var-requires
const chalk = require('chalk');

// ============================================================================
// 🎨 PALETA DE COLORES Y ESTILOS
// ============================================================================

const C = {
  header:   chalk.hex('#BC8CFF').bold,
  title:    chalk.hex('#58A6FF').bold,
  option:   chalk.hex('#58A6FF').bold,
  label:    chalk.hex('#8B949E'),
  value:    chalk.hex('#E6EDF3').bold,
  success:  chalk.hex('#3FB950').bold,
  error:    chalk.hex('#F85149').bold,
  warn:     chalk.hex('#D29922').bold,
  info:     chalk.hex('#58A6FF'),
  muted:    chalk.hex('#8B949E'),
  green:    chalk.hex('#3FB950'),
  red:      chalk.hex('#F85149'),
  yellow:   chalk.hex('#D29922'),
  cyan:     chalk.hex('#79C0FF'),
  magenta:  chalk.hex('#BC8CFF'),
  divider:  chalk.hex('#21262D'),
  input:    chalk.hex('#E6EDF3'),
  bot:      chalk.hex('#3FB950').bold,
  sim:      chalk.hex('#D29922'),
};

// ============================================================================
// 📐 HELPERS DE RENDERIZADO
// ============================================================================

const TERM_WIDTH = 62;

function line(char = '─', color = C.divider): string {
  return color(char.repeat(TERM_WIDTH));
}

function box(text: string, color = C.header): string {
  const pad = Math.max(0, TERM_WIDTH - 2 - text.length);
  const left = Math.floor(pad / 2);
  const right = pad - left;
  return [
    color('╔' + '═'.repeat(TERM_WIDTH) + '╗'),
    color('║' + ' '.repeat(left) + text + ' '.repeat(right) + '║'),
    color('╚' + '═'.repeat(TERM_WIDTH) + '╝'),
  ].join('\n');
}

function section(title: string): string {
  const rest = TERM_WIDTH - title.length - 3;
  return C.muted('── ') + C.title(title) + ' ' + C.divider('─'.repeat(Math.max(0, rest)));
}

function badge(text: string, type: 'success' | 'error' | 'warn' | 'muted'): string {
  const colors = {
    success: chalk.bgHex('#1a3a1a').hex('#3FB950'),
    error:   chalk.bgHex('#3a1a1a').hex('#F85149'),
    warn:    chalk.bgHex('#3a2a0a').hex('#D29922'),
    muted:   chalk.bgHex('#161b22').hex('#8B949E'),
  };
  return colors[type](` ${text} `);
}

function clearScreen(): void {
  process.stdout.write('\x1Bc');
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

// ============================================================================
// ❓ HELPERS DE INPUT
// ============================================================================

function ask(rl: readline.Interface, question: string): Promise<string> {
  return new Promise(resolve => {
    rl.question(C.cyan('  → ') + C.input(question) + ' ', answer => {
      resolve(answer.trim());
    });
  });
}

async function confirm(rl: readline.Interface, question: string): Promise<boolean> {
  const answer = await ask(rl, question + C.muted(' (s/n)'));
  return ['s', 'si', 'sí', 'y', 'yes'].includes(answer.toLowerCase());
}

async function selectFromList(
  rl: readline.Interface,
  items: Array<{ id: string; label: string }>,
  prompt = 'Selecciona un número'
): Promise<string | null> {
  items.forEach((item, i) => {
    console.log(`  ${C.option(`[${i + 1}]`)} ${C.value(item.label)}`);
  });
  console.log();
  const raw = await ask(rl, prompt + ':');
  const idx = parseInt(raw) - 1;
  if (isNaN(idx) || idx < 0 || idx >= items.length) {
    console.log(C.error('  ✗ Opción inválida'));
    return null;
  }
  return items[idx].id;
}

// ============================================================================
// 🗄️ CAPA DE DATOS (SQLite directo para operaciones admin)
// ============================================================================

interface TenantRecord {
  tenant_id: string;
  business_name: string;
  business_type: string;
  whatsapp_number: string;
  owner_name: string;
  monthly_fee: number;
  next_payment_date: string;
  is_active: number;
  created_at: string;
}

interface BotConfigRecord {
  tenant_id: string;
  welcome_message: string;
  menu_message: string;
  out_of_hours_message: string;
  bot_name: string;
  tone: string;
}

/**
 * Repositorio admin directo a SQLite
 * Extiende las capacidades de SqliteUserRepository para operaciones CRUD de tenants
 */
class AdminRepository {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private db: any;

  constructor(private dbPath: string = './database.sqlite') {}

  async initialize(): Promise<void> {
    // Importación dinámica para compatibilidad con distintas versiones
    const Database = require('better-sqlite3');
    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this._ensureTables();
  }

  private _ensureTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tenants (
        tenant_id       TEXT PRIMARY KEY,
        business_name   TEXT NOT NULL,
        business_type   TEXT NOT NULL DEFAULT 'general',
        whatsapp_number TEXT UNIQUE NOT NULL,
        owner_name      TEXT NOT NULL DEFAULT '',
        monthly_fee     REAL NOT NULL DEFAULT 0,
        next_payment_date TEXT,
        is_active       INTEGER NOT NULL DEFAULT 1,
        created_at      TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS bot_config (
        tenant_id             TEXT PRIMARY KEY,
        bot_name              TEXT NOT NULL DEFAULT 'Asistente',
        tone                  TEXT NOT NULL DEFAULT 'amigable',
        welcome_message       TEXT NOT NULL DEFAULT '¡Hola! ¿En qué te ayudo?',
        menu_message          TEXT NOT NULL DEFAULT 'Selecciona una opción:',
        out_of_hours_message  TEXT NOT NULL DEFAULT 'Estamos fuera de horario.',
        updated_at            TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id)
      );

      CREATE TABLE IF NOT EXISTS phone_tenant_map (
        phone_number TEXT PRIMARY KEY,
        tenant_id    TEXT NOT NULL,
        is_active    INTEGER DEFAULT 1,
        created_at   TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id)
      );

      CREATE TABLE IF NOT EXISTS message_log (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id   TEXT NOT NULL,
        phone_from  TEXT NOT NULL,
        direction   TEXT NOT NULL DEFAULT 'inbound',
        logged_at   TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  }

  // ── Tenants ──────────────────────────────────────────────────────────────

  createTenant(data: Omit<TenantRecord, 'created_at' | 'is_active'>): void {
    const stmt = this.db.prepare(`
      INSERT INTO tenants
        (tenant_id, business_name, business_type, whatsapp_number, owner_name, monthly_fee, next_payment_date)
      VALUES
        (@tenant_id, @business_name, @business_type, @whatsapp_number, @owner_name, @monthly_fee, @next_payment_date)
    `);
    stmt.run(data);

    // Crear config de bot vacía por defecto
    const cfgStmt = this.db.prepare(`
      INSERT OR IGNORE INTO bot_config (tenant_id, bot_name)
      VALUES (@tenant_id, @bot_name)
    `);
    cfgStmt.run({ tenant_id: data.tenant_id, bot_name: `Bot de ${data.business_name}` });

    // Registrar número en mapa de enrutamiento
    const mapStmt = this.db.prepare(`
      INSERT OR IGNORE INTO phone_tenant_map (phone_number, tenant_id)
      VALUES (@phone_number, @tenant_id)
    `);
    mapStmt.run({ phone_number: data.whatsapp_number, tenant_id: data.tenant_id });
  }

  getAllTenants(): TenantRecord[] {
    return this.db.prepare('SELECT * FROM tenants ORDER BY created_at DESC').all();
  }

  getActiveTenants(): TenantRecord[] {
    return this.db.prepare('SELECT * FROM tenants WHERE is_active = 1 ORDER BY business_name').all();
  }

  getOverdueTenants(): TenantRecord[] {
    return this.db.prepare(`
      SELECT * FROM tenants
      WHERE is_active = 1
        AND next_payment_date IS NOT NULL
        AND date(next_payment_date) < date('now')
      ORDER BY next_payment_date ASC
    `).all();
  }

  toggleTenantStatus(tenantId: string): number {
    const result = this.db.prepare(`
      UPDATE tenants
      SET is_active = CASE WHEN is_active = 1 THEN 0 ELSE 1 END
      WHERE tenant_id = ?
    `).run(tenantId);
    return result.changes;
  }

  getTenantById(tenantId: string): TenantRecord | undefined {
    return this.db.prepare('SELECT * FROM tenants WHERE tenant_id = ?').get(tenantId);
  }

  // ── Bot Config ───────────────────────────────────────────────────────────

  getBotConfig(tenantId: string): BotConfigRecord | undefined {
    return this.db.prepare('SELECT * FROM bot_config WHERE tenant_id = ?').get(tenantId);
  }

  updateBotConfig(tenantId: string, field: keyof BotConfigRecord, value: string): void {
    this.db.prepare(`
      UPDATE bot_config
      SET ${String(field)} = ?, updated_at = datetime('now')
      WHERE tenant_id = ?
    `).run(value, tenantId);
  }

  // ── Métricas ─────────────────────────────────────────────────────────────

  getMetrics(): { active: number; msgsToday: number; overdue: number } {
    const active = (this.db.prepare(
      'SELECT COUNT(*) as n FROM tenants WHERE is_active = 1'
    ).get() as { n: number }).n;

    const msgsToday = (this.db.prepare(`
      SELECT COUNT(*) as n FROM message_log
      WHERE date(logged_at) = date('now')
    `).get() as { n: number }).n;

    const overdue = (this.db.prepare(`
      SELECT COUNT(*) as n FROM tenants
      WHERE is_active = 1
        AND next_payment_date IS NOT NULL
        AND date(next_payment_date) < date('now')
    `).get() as { n: number }).n;

    return { active, msgsToday, overdue };
  }

  getMessageLog(): Array<{ tenant: string; from: string; direction: string; time: string }> {
    return this.db.prepare(`
      SELECT t.business_name as tenant, ml.phone_from as "from",
             ml.direction, ml.logged_at as time
      FROM message_log ml
      JOIN tenants t ON ml.tenant_id = t.tenant_id
      WHERE date(ml.logged_at) = date('now')
      ORDER BY ml.logged_at DESC
      LIMIT 50
    `).all();
  }

  close(): void {
    if (this.db) this.db.close();
  }
}

// ============================================================================
// 🖥️ COMMAND ROOM — PANTALLA PRINCIPAL
// ============================================================================

class CommandRoom {
  private rl: readline.Interface;
  private adminRepo: AdminRepository;
  private container: ApplicationContainer | null = null;
  private running = true;

  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });

    this.adminRepo = new AdminRepository();

    // Cierre limpio con Ctrl+C
    this.rl.on('SIGINT', () => this.exit());
    process.on('SIGTERM', () => this.exit());
  }

  // ── Inicialización ────────────────────────────────────────────────────────

  async initialize(): Promise<void> {
    clearScreen();
    console.log(C.muted('\n  Iniciando Cuarto de Poder...'));

    await this.adminRepo.initialize();

    try {
      const logger = createLogger();
      const userRepo = new SqliteUserRepository();
      await userRepo.initialize();
      const notif = new ConsoleNotificationAdapter();
      this.container = new ApplicationContainer(userRepo, notif, logger);
    } catch {
      console.log(C.warn('  ⚠ ApplicationContainer no disponible. Simulador limitado.'));
    }

    await sleep(400);
  }

  // ── Render del menú ───────────────────────────────────────────────────────

  private async renderMenu(): Promise<void> {
    clearScreen();

    // Header
    console.log('\n' + box('  SECURITECH  ─  CUARTO DE PODER  ', C.header));
    console.log(C.muted('  Bot Pro v2.0 — Chilpancingo, Guerrero, Mex.\n'));

    // Métricas en tiempo real
    const m = this.adminRepo.getMetrics();
    console.log(line('─'));
    console.log(
      `  ${C.green('●')} ${C.label('Clientes activos:')}  ${C.value(String(m.active))}    ` +
      `${C.yellow('◆')} ${C.label('Mensajes hoy:')}  ${C.value(String(m.msgsToday))}    ` +
      (m.overdue > 0
        ? `${C.red('▲')} ${C.label('Pagos vencidos:')}  ${C.error(String(m.overdue))}`
        : `${C.green('✓')} ${C.label('Pagos:')}  ${C.green('Al corriente')}`)
    );
    console.log(line('─') + '\n');

    // Menú por secciones
    console.log(section('CLIENTES'));
    console.log(`  ${C.option('[1]')} Crear nuevo cliente`);
    console.log(`  ${C.option('[2]')} Ver todos los clientes`);
    console.log(`  ${C.option('[3]')} Editar cliente`);
    console.log(`  ${C.option('[4]')} Suspender / Reactivar cliente\n`);

    console.log(section('BOTS'));
    console.log(`  ${C.option('[5]')} Configurar mensaje de bienvenida`);
    console.log(`  ${C.option('[6]')} Configurar catálogo / respuestas`);
    console.log(`  ${C.option('[7]')} Simular chat con bot ${badge('TEST', 'warn')}\n`);

    console.log(section('SISTEMA'));
    console.log(`  ${C.option('[8]')} Ver log de mensajes del día`);
    console.log(`  ${C.option('[9]')} Clientes con pago vencido` +
      (m.overdue > 0 ? `  ${badge(String(m.overdue), 'error')}` : ''));
    console.log(`  ${C.option('[0]')} Salir\n`);
    console.log(line('─'));
  }

  // ── Loop principal ────────────────────────────────────────────────────────

  async run(): Promise<void> {
    await this.initialize();

    while (this.running) {
      await this.renderMenu();
      const choice = await ask(this.rl, 'Selecciona una opción:');

      console.log();

      switch (choice) {
        case '1': await this.createClient(); break;
        case '2': await this.listClients(); break;
        case '3': await this.editClient(); break;
        case '4': await this.toggleClient(); break;
        case '5': await this.configWelcome(); break;
        case '6': await this.configCatalog(); break;
        case '7': await this.simulateChat(); break;
        case '8': await this.viewMessageLog(); break;
        case '9': await this.viewOverdue(); break;
        case '0': this.exit(); break;
        default:
          console.log(C.error('  ✗ Opción no válida. Intenta de nuevo.'));
          await sleep(1000);
      }
    }
  }

  // ============================================================================
  // OPCIÓN 1 — Crear nuevo cliente
  // ============================================================================

  private async createClient(): Promise<void> {
    console.log(box('  NUEVO CLIENTE  ', C.title));
    console.log();

    const businessName = await ask(this.rl, 'Nombre del negocio:');
    if (!businessName) { console.log(C.error('  ✗ El nombre es requerido.')); await sleep(1200); return; }

    console.log(`  ${C.label('Giros disponibles:')} ferretería, papelería, cerrajería, pizzería, salón, farmacia, otro`);
    const businessType = await ask(this.rl, 'Giro del negocio:') || 'otro';

    const whatsappNumber = await ask(this.rl, 'Número WhatsApp (+52...):');
    if (!whatsappNumber.startsWith('+')) {
      console.log(C.warn('  ⚠ El número debe iniciar con + (ej: +521234567890)'));
      await sleep(1200); return;
    }

    const ownerName = await ask(this.rl, 'Nombre del dueño:') || 'Sin nombre';

    const feeRaw = await ask(this.rl, 'Monto mensual ($):');
    const monthlyFee = parseFloat(feeRaw) || 0;

    const nextPayment = await ask(this.rl, 'Fecha próximo pago (YYYY-MM-DD):')
      || new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];

    console.log();
    console.log(line('─'));
    console.log(`  ${C.label('Negocio:')}   ${C.value(businessName)}`);
    console.log(`  ${C.label('Giro:')}      ${C.value(businessType)}`);
    console.log(`  ${C.label('WhatsApp:')}  ${C.value(whatsappNumber)}`);
    console.log(`  ${C.label('Dueño:')}     ${C.value(ownerName)}`);
    console.log(`  ${C.label('Mensual:')}   ${C.value('$' + monthlyFee.toFixed(2))}`);
    console.log(`  ${C.label('Pago:')}      ${C.value(nextPayment)}`);
    console.log(line('─'));

    const ok = await confirm(this.rl, '¿Confirmar creación?');
    if (!ok) { console.log(C.muted('  Cancelado.')); await sleep(800); return; }

    try {
      const tenantId = crypto.randomUUID();
      this.adminRepo.createTenant({
        tenant_id: tenantId,
        business_name: businessName,
        business_type: businessType,
        whatsapp_number: whatsappNumber,
        owner_name: ownerName,
        monthly_fee: monthlyFee,
        next_payment_date: nextPayment,
      });

      console.log();
      console.log(C.success('  ✅ Cliente creado exitosamente'));
      console.log(`  ${C.label('TenantID:')} ${C.cyan(tenantId)}`);
      console.log(`  ${C.muted('Guarda este ID — es el identificador único del cliente.')}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(C.error('  ✗ Error al crear: ' + msg));
    }

    await sleep(2000);
  }

  // ============================================================================
  // OPCIÓN 2 — Ver todos los clientes
  // ============================================================================

  private async listClients(): Promise<void> {
    console.log(box('  CLIENTES REGISTRADOS  ', C.title));
    console.log();

    const tenants = this.adminRepo.getAllTenants();

    if (tenants.length === 0) {
      console.log(C.muted('  No hay clientes registrados todavía.'));
      await sleep(1500); return;
    }

    // Cabecera de tabla
    const col = [22, 10, 14, 13];
    const header =
      C.label('  ' + 'Negocio'.padEnd(col[0])) +
      C.label('Estado'.padEnd(col[1])) +
      C.label('Mensual'.padEnd(col[2])) +
      C.label('Próx. Pago');
    console.log(header);
    console.log(C.divider('  ' + '─'.repeat(col[0] + col[1] + col[2] + col[3])));

    const today = new Date().toISOString().split('T')[0];

    for (const t of tenants) {
      const name = t.business_name.slice(0, col[0] - 1).padEnd(col[0]);
      const active = t.is_active
        ? badge('ACTIVO', 'success')
        : badge('PAUSADO', 'muted');
      const fee = ('$' + t.monthly_fee.toFixed(0)).padEnd(col[2]);
      const isOverdue = t.next_payment_date && t.next_payment_date < today;
      const payDate = isOverdue
        ? C.red((t.next_payment_date || '—') + ' ▲')
        : C.value((t.next_payment_date || '—'));

      console.log(`  ${C.value(name)}${active}  ${C.green(fee)}${payDate}`);
    }

    console.log(C.divider('\n  ' + '─'.repeat(60)));
    console.log(C.muted(`  Total: ${tenants.length} cliente(s)`));

    await ask(this.rl, '\nPresiona Enter para continuar');
  }

  // ============================================================================
  // OPCIÓN 3 — Editar cliente
  // ============================================================================

  private async editClient(): Promise<void> {
    console.log(box('  EDITAR CLIENTE  ', C.title));
    console.log();

    const tenants = this.adminRepo.getActiveTenants();
    if (tenants.length === 0) { console.log(C.muted('  Sin clientes activos.')); await sleep(1200); return; }

    const items = tenants.map(t => ({ id: t.tenant_id, label: t.business_name }));
    const tenantId = await selectFromList(this.rl, items, 'Selecciona cliente a editar');
    if (!tenantId) { await sleep(1000); return; }

    const tenant = this.adminRepo.getTenantById(tenantId);
    if (!tenant) { console.log(C.error('  ✗ Cliente no encontrado.')); await sleep(1000); return; }

    console.log();
    console.log(C.label('  Qué deseas editar:'));
    console.log(`  ${C.option('[1]')} Nombre del negocio (actual: ${C.value(tenant.business_name)})`);
    console.log(`  ${C.option('[2]')} Monto mensual     (actual: ${C.value('$' + tenant.monthly_fee)})`);
    console.log(`  ${C.option('[3]')} Fecha próx. pago  (actual: ${C.value(tenant.next_payment_date || '—')})`);
    console.log(`  ${C.option('[4]')} Nombre del dueño  (actual: ${C.value(tenant.owner_name)})`);
    console.log();

    const field = await ask(this.rl, 'Opción:');
    const fieldMap: Record<string, { col: string; label: string }> = {
      '1': { col: 'business_name',    label: 'Nuevo nombre del negocio' },
      '2': { col: 'monthly_fee',      label: 'Nuevo monto mensual' },
      '3': { col: 'next_payment_date',label: 'Nueva fecha (YYYY-MM-DD)' },
      '4': { col: 'owner_name',       label: 'Nuevo nombre del dueño' },
    };

    const selected = fieldMap[field];
    if (!selected) { console.log(C.error('  ✗ Opción inválida.')); await sleep(1000); return; }

    const newValue = await ask(this.rl, selected.label + ':');
    if (!newValue) { console.log(C.muted('  Sin cambios.')); await sleep(800); return; }

    // SQLite directo para campos de tenants (no disponibles en bot_config)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.adminRepo as any).db.prepare(
      `UPDATE tenants SET ${selected.col} = ? WHERE tenant_id = ?`
    ).run(newValue, tenantId);

    console.log(C.success('\n  ✅ Cliente actualizado correctamente.'));
    await sleep(1500);
  }

  // ============================================================================
  // OPCIÓN 4 — Suspender / Reactivar
  // ============================================================================

  private async toggleClient(): Promise<void> {
    console.log(box('  SUSPENDER / REACTIVAR  ', C.title));
    console.log();

    const tenants = this.adminRepo.getAllTenants();
    if (tenants.length === 0) { console.log(C.muted('  Sin clientes.')); await sleep(1200); return; }

    const items = tenants.map(t => ({
      id: t.tenant_id,
      label: `${t.business_name}  [${t.is_active ? 'ACTIVO' : 'PAUSADO'}]`,
    }));

    const tenantId = await selectFromList(this.rl, items, 'Selecciona cliente');
    if (!tenantId) { await sleep(1000); return; }

    const tenant = this.adminRepo.getTenantById(tenantId)!;
    const action = tenant.is_active ? 'SUSPENDER' : 'REACTIVAR';

    const ok = await confirm(this.rl, `¿${action} a ${C.value(tenant.business_name)}?`);
    if (!ok) { console.log(C.muted('  Cancelado.')); await sleep(800); return; }

    this.adminRepo.toggleTenantStatus(tenantId);

    const newState = tenant.is_active ? 'PAUSADO' : 'ACTIVO';
    console.log(C.success(`\n  ✅ ${tenant.business_name} ahora está ${newState}.`));
    await sleep(1500);
  }

  // ============================================================================
  // OPCIÓN 5 — Configurar mensaje de bienvenida
  // ============================================================================

  private async configWelcome(): Promise<void> {
    console.log(box('  CONFIGURAR BIENVENIDA  ', C.title));
    console.log();

    const tenants = this.adminRepo.getActiveTenants();
    if (tenants.length === 0) { console.log(C.muted('  Sin clientes activos.')); await sleep(1200); return; }

    const items = tenants.map(t => ({ id: t.tenant_id, label: t.business_name }));
    const tenantId = await selectFromList(this.rl, items, 'Selecciona cliente');
    if (!tenantId) { await sleep(1000); return; }

    const cfg = this.adminRepo.getBotConfig(tenantId);
    if (!cfg) { console.log(C.error('  ✗ Config no encontrada.')); await sleep(1200); return; }

    console.log();
    console.log(C.label('  Mensaje actual:'));
    console.log(C.muted('  ─────────────────────────────────────'));
    console.log('  ' + cfg.welcome_message.split('\n').join('\n  '));
    console.log(C.muted('  ─────────────────────────────────────'));
    console.log();
    console.log(C.muted('  Escribe el nuevo mensaje (Enter en línea vacía para terminar):'));

    // Capturar mensaje multilínea
    const lines: string[] = [];
    while (true) {
      const l = await ask(this.rl, '');
      if (l === '') break;
      lines.push(l);
    }

    if (lines.length === 0) { console.log(C.muted('  Sin cambios.')); await sleep(800); return; }

    const newMsg = lines.join('\n');
    const ok = await confirm(this.rl, '¿Guardar nuevo mensaje?');
    if (!ok) { console.log(C.muted('  Cancelado.')); await sleep(800); return; }

    this.adminRepo.updateBotConfig(tenantId, 'welcome_message', newMsg);
    console.log(C.success('\n  ✅ Mensaje de bienvenida actualizado.'));
    await sleep(1500);
  }

  // ============================================================================
  // OPCIÓN 6 — Configurar catálogo / respuestas
  // ============================================================================

  private async configCatalog(): Promise<void> {
    console.log(box('  CONFIGURAR CATÁLOGO  ', C.title));
    console.log();

    const tenants = this.adminRepo.getActiveTenants();
    if (tenants.length === 0) { console.log(C.muted('  Sin clientes activos.')); await sleep(1200); return; }

    const items = tenants.map(t => ({ id: t.tenant_id, label: t.business_name }));
    const tenantId = await selectFromList(this.rl, items, 'Selecciona cliente');
    if (!tenantId) { await sleep(1000); return; }

    console.log();
    console.log(C.label('  Qué deseas configurar:'));
    console.log(`  ${C.option('[1]')} Mensaje del menú principal`);
    console.log(`  ${C.option('[2]')} Mensaje fuera de horario`);
    console.log(`  ${C.option('[3]')} Nombre del bot`);
    console.log(`  ${C.option('[4]')} Tono del bot (formal / amigable / directo)`);
    console.log();

    const choice = await ask(this.rl, 'Opción:');
    const fieldMap: Record<string, { field: keyof BotConfigRecord; label: string }> = {
      '1': { field: 'menu_message',         label: 'Nuevo mensaje de menú' },
      '2': { field: 'out_of_hours_message',  label: 'Mensaje fuera de horario' },
      '3': { field: 'bot_name',              label: 'Nombre del bot' },
      '4': { field: 'tone',                  label: 'Tono (formal/amigable/directo)' },
    };

    const selected = fieldMap[choice];
    if (!selected) { console.log(C.error('  ✗ Opción inválida.')); await sleep(1000); return; }

    const newValue = await ask(this.rl, selected.label + ':');
    if (!newValue) { console.log(C.muted('  Sin cambios.')); await sleep(800); return; }

    this.adminRepo.updateBotConfig(tenantId, selected.field, newValue);
    console.log(C.success('\n  ✅ Configuración guardada.'));
    await sleep(1500);
  }

  // ============================================================================
  // OPCIÓN 7 — Simulador de chat
  // ============================================================================

  private async simulateChat(): Promise<void> {
    console.log(box('  SIMULADOR DE CHAT  ', C.title));
    console.log();

    const tenants = this.adminRepo.getActiveTenants();
    if (tenants.length === 0) { console.log(C.muted('  Sin clientes activos.')); await sleep(1200); return; }

    const items = tenants.map(t => ({ id: t.tenant_id, label: t.business_name }));
    const tenantId = await selectFromList(this.rl, items, 'Selecciona el bot a probar');
    if (!tenantId) { await sleep(1000); return; }

    const tenant = this.adminRepo.getTenantById(tenantId)!;
    const testPhone = '+52' + Math.floor(1000000000 + Math.random() * 9000000000);

    clearScreen();
    console.log(box(`  CHAT: ${tenant.business_name}  `, C.sim));
    console.log(C.muted(`  Teléfono de prueba: ${testPhone}`));
    console.log(C.muted('  Escribe "salir" para terminar la simulación.'));
    console.log(line('─') + '\n');

    if (!this.container) {
      console.log(C.warn('  ⚠ ApplicationContainer no disponible.'));
      console.log(C.warn('  El simulador necesita el backend inicializado.'));
      await sleep(2000); return;
    }

    const botController = this.container.getBotController();

    while (true) {
      const userInput = await ask(this.rl, 'Tú:');

      if (['salir', 'exit', 'quit'].includes(userInput.toLowerCase())) {
        console.log(C.muted('\n  Saliendo del simulador...\n'));
        await sleep(800);
        break;
      }

      if (!userInput) continue;

      try {
        const response = await botController.processMessage(tenantId, testPhone, userInput);
        console.log();
        if (response) {
          console.log(C.bot('  Bot: ') + C.green(response));
        } else {
          console.log(C.muted('  Bot: [sin respuesta]'));
        }
        console.log();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(C.error('  ✗ Error del bot: ' + msg));
      }
    }
  }

  // ============================================================================
  // OPCIÓN 8 — Log de mensajes del día
  // ============================================================================

  private async viewMessageLog(): Promise<void> {
    console.log(box('  LOG DEL DÍA  ', C.title));
    console.log();

    const logs = this.adminRepo.getMessageLog();

    if (logs.length === 0) {
      console.log(C.muted('  No hay mensajes registrados hoy.'));
      await sleep(1500); return;
    }

    console.log(
      C.label('  ' + 'Negocio'.padEnd(22)) +
      C.label('Teléfono'.padEnd(18)) +
      C.label('Dir.'.padEnd(10)) +
      C.label('Hora')
    );
    console.log(C.divider('  ' + '─'.repeat(62)));

    for (const log of logs) {
      const time = log.time.slice(11, 19);
      const dir = log.direction === 'inbound'
        ? C.cyan('↓ entrada')
        : C.green('↑ salida ');
      console.log(
        `  ${C.value(log.tenant.slice(0, 21).padEnd(22))}` +
        `${C.muted(log.from.padEnd(18))}` +
        `${dir}  ` +
        `${C.muted(time)}`
      );
    }

    console.log(C.muted(`\n  Total hoy: ${logs.length} mensaje(s)`));
    await ask(this.rl, '\nPresiona Enter para continuar');
  }

  // ============================================================================
  // OPCIÓN 9 — Clientes con pago vencido
  // ============================================================================

  private async viewOverdue(): Promise<void> {
    console.log(box('  PAGOS VENCIDOS  ', C.title));
    console.log();

    const overdue = this.adminRepo.getOverdueTenants();

    if (overdue.length === 0) {
      console.log(C.success('  ✅ Todos los clientes están al corriente.'));
      await sleep(1500); return;
    }

    const today = new Date();

    for (const t of overdue) {
      const due = new Date(t.next_payment_date);
      const diffDays = Math.floor((today.getTime() - due.getTime()) / 86400000);

      console.log(
        `  ${C.red('▲')} ${C.value(t.business_name.padEnd(24))}` +
        `${C.red(`${diffDays} días vencido`).padEnd(20)}` +
        C.warn('$' + t.monthly_fee.toFixed(0))
      );
      console.log(
        `     ${C.label('Dueño:')} ${C.muted(t.owner_name)}  ` +
        `${C.label('WhatsApp:')} ${C.muted(t.whatsapp_number)}`
      );
      console.log();
    }

    console.log(line('─'));
    const send = await confirm(this.rl, `¿Marcar ${overdue.length} cliente(s) para recordatorio?`);

    if (send) {
      for (const t of overdue) {
        console.log(C.yellow(`  ◆ Pendiente notificar a: ${t.business_name} (${t.whatsapp_number})`));
        console.log(C.muted('    [Integrar con Meta API para envío real]'));
      }
      console.log(C.success('\n  ✅ Lista de recordatorios generada.'));
    } else {
      console.log(C.muted('  Sin acción tomada.'));
    }

    await sleep(2000);
  }

  // ============================================================================
  // SALIDA LIMPIA
  // ============================================================================

  private exit(): void {
    this.running = false;
    console.log('\n' + line('─'));
    console.log(C.header('  SegurITech Bot Pro — Cuarto de Poder cerrado.'));
    console.log(C.muted('  Hasta pronto, Micho. 🛡️\n'));
    this.adminRepo.close();
    this.rl.close();
    process.exit(0);
  }
}

// ============================================================================
// 🚀 ENTRY POINT
// ============================================================================

async function main(): Promise<void> {
  const room = new CommandRoom();
  await room.run();
}

main().catch(err => {
  console.error(chalk.red('\n  ✗ Error fatal en CommandRoom:'), err);
  process.exit(1);
});
