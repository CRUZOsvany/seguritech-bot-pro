import readline from 'readline';
import chalk from 'chalk';
import { randomUUID } from 'crypto';
import { ApplicationContainer } from '@/app/ApplicationContainer';
import pino from 'pino';

export class AdminCLI {
  private rl: readline.Interface;
  private logger: pino.Logger;
  private container: ApplicationContainer;

  constructor(logger: pino.Logger, container: ApplicationContainer) {
    this.logger = logger;
    this.container = container;
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }

  async start(): Promise<void> {
    console.clear();
    console.log(chalk.bold.cyan('\n╔══════════════════════════════╗'));
    console.log(chalk.bold.cyan('║  SECURITECH — ADMIN CLI      ║'));
    console.log(chalk.bold.cyan('╚══════════════════════════════╝\n'));
    await this.showMainMenu();
  }

  private async showMainMenu(): Promise<void> {
    const choice = await this.prompt(
      chalk.yellow('Selecciona una opción:\n') +
        chalk.green('[1] Crear nuevo cliente (Tenant)\n') +
        chalk.green('[2] Ver clientes activos\n') +
        chalk.green('[3] Iniciar simulador de chat\n') +
        chalk.red('[0] Salir\n') +
        chalk.white('Tu opción: ')
    );

    switch (choice.trim()) {
      case '1':
        await this.createTenant();
        break;
      case '2':
        await this.listTenants();
        break;
      case '3':
        await this.chatSimulator();
        break;
      case '0':
        console.log(chalk.green('\n✅ Adiós!\n'));
        process.exit(0);
      default:
        console.log(chalk.red('❌ Opción inválida.\n'));
        await this.delay(1000);
        await this.showMainMenu();
    }
  }

  private async createTenant(): Promise<void> {
    console.clear();
    console.log(chalk.bold.yellow('\n📋 CREAR NUEVO CLIENTE\n'));

    const name = await this.prompt(chalk.white('Nombre del negocio: '));
    const phone = await this.prompt(chalk.white('Número WhatsApp (+52...): '));
    const business = await this.prompt(chalk.white('Giro (ferretería/papelería/cerrajería/otro): '));

    if (!name.trim() || !phone.trim() || !business.trim()) {
      console.log(chalk.red('❌ Todos los campos son obligatorios.\n'));
      await this.delay(2000);
      await this.showMainMenu();
      return;
    }

    const tenantId = randomUUID();
    this.logger.info(`Nuevo tenant creado: ${name} (${tenantId})`);

    console.log(chalk.green.bold(`\n✅ Tenant "${name}" creado exitosamente\n`));
    console.log(chalk.cyan(`   ID: ${chalk.bold(tenantId)}`));
    console.log(chalk.cyan(`   WhatsApp: ${chalk.bold(phone)}`));
    console.log(chalk.cyan(`   Giro: ${chalk.bold(business)}\n`));

    await this.delay(3000);
    await this.showMainMenu();
  }

  private async listTenants(): Promise<void> {
    console.clear();
    console.log(chalk.bold.yellow('\n👥 CLIENTES ACTIVOS\n'));

    const tenants = [
      { name: 'Ferretería Los Andes', tenantId: 'uuid-001', phone: '+521234567890', status: 'Activo' },
      { name: 'Papelería Central', tenantId: 'uuid-002', phone: '+529876543210', status: 'Activo' },
    ];

    console.log(chalk.cyan('┌──────────────────────┬──────────────┬──────────────────┬──────────┐'));
    console.log(chalk.cyan('│ Nombre               │ TenantID     │ WhatsApp         │ Estado   │'));
    console.log(chalk.cyan('├──────────────────────┼──────────────┼──────────────────┼──────────┤'));

    tenants.forEach((t) => {
      console.log(chalk.white(`│ ${t.name.padEnd(20)} │ ${t.tenantId.padEnd(12)} │ ${t.phone.padEnd(16)} │ ${t.status.padEnd(8)} │`));
    });

    console.log(chalk.cyan('└──────────────────────┴──────────────┴──────────────────┴──────────┘\n'));

    await this.prompt(chalk.gray('Presiona ENTER para volver...'));
    await this.showMainMenu();
  }

  private async chatSimulator(): Promise<void> {
    console.clear();
    console.log(chalk.bold.yellow('\n💬 SIMULADOR DE CHAT\n'));

    const tenantId = await this.prompt(chalk.white('Tenant ID: '));
    const phone = await this.prompt(chalk.white('Teléfono de prueba: '));

    if (!tenantId.trim() || !phone.trim()) {
      console.log(chalk.red('❌ Campos obligatorios.\n'));
      await this.delay(2000);
      await this.showMainMenu();
      return;
    }

    console.log(chalk.green.bold(`\n✅ Conectado: ${tenantId}`));
    console.log(chalk.cyan('(Escribe "salir" para terminar)\n'));

    const botController = this.container.getBotController();

    let running = true;
    while (running) {
      const userInput = await this.prompt(chalk.yellow('Tú: '));

      if (userInput.toLowerCase().trim() === 'salir') {
        console.log(chalk.green('✅ Simulador cerrado.\n'));
        running = false;
        continue;
      }

      try {
        const response = await botController.processMessage(tenantId, phone, userInput);
        console.log(chalk.cyan(`Bot: ${response}\n`));
      } catch (error) {
        console.log(chalk.red(`❌ Error: ${error}\n`));
      }
    }

    await this.showMainMenu();
  }

  private prompt(question: string): Promise<string> {
    return new Promise((resolve) => {
      this.rl.question(question, (answer) => {
        resolve(answer);
      });
    });
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  close(): void {
    this.rl.close();
  }
}

export async function startAdminCLI(logger: pino.Logger, container: ApplicationContainer): Promise<void> {
  const cli = new AdminCLI(logger, container);
  cli.start();

  process.on('SIGINT', () => {
    console.log(chalk.yellow('\n\n⏸️  Cerrando CLI...\n'));
    cli.close();
    process.exit(0);
  });
}
