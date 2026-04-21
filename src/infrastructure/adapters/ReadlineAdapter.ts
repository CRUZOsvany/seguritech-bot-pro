import * as readline from 'readline';
import pino from 'pino';

/**
 * Adaptador de terminal interactivo para pruebas locales MULTI-TENANT
 * Permite:
 * - Seleccionar tenant (negocio)
 * - Simular números de teléfono de diferentes clientes
 * - Enviar mensajes y ver respuestas del bot
 * - Ver historial de conversaciones por tenant
 *
 * Comandos especiales:
 * - "/tenant <id>" - Cambiar tenant actual
 * - "/phone <número>" - Cambiar número de teléfono del cliente
 * - "/tenants" - Listar tenants en uso
 * - "/history" - Ver historial del tenant actual
 * - "/help" - Mostrar ayuda
 * - "exit" - Salir
 */
export class ReadlineAdapter {
  private rl: readline.Interface;
  private logger: pino.Logger;
  private isRunning: boolean = false;

  // Estado multi-tenant
  private currentTenantId: string = 'papeleria_01';
  private currentPhoneNumber: string = '+56912345678';
  private tenantHistory: Map<string, Array<{ phone: string; message: string; response: string }>> = new Map();
  private phoneHistory: Map<string, Array<{ message: string; response: string }>> = new Map();

  constructor(logger: pino.Logger) {
    this.logger = logger;
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }

  async start(
    processMessage: (tenantId: string, phoneNumber: string, text: string) => Promise<string | null>
  ): Promise<void> {
    this.isRunning = true;
    this.showWelcomeBanner();
    await this.promptUser(processMessage);
  }

  private showWelcomeBanner(): void {
    console.log('\n╔════════════════════════════════════════════════════════╗');
    console.log('║         🚀 SIMULADOR MULTI-TENANT LOCAL v2.0 🚀        ║');
    console.log('║                SegurITech Bot Pro                       ║');
    console.log('╚════════════════════════════════════════════════════════╝\n');

    console.log('📋 INFORMACIÓN DEL CONTEXTO:');
    console.log(`   👥 Tenant Actual: ${this.currentTenantId}`);
    console.log(`   📱 Cliente Actual: ${this.currentPhoneNumber}`);
    console.log('\n⌨️  COMANDOS ESPECIALES:');
    console.log('   /tenant <id>     - Cambiar tenant (ej: /tenant ferreteria_01)');
    console.log('   /phone <número>  - Cambiar número (ej: /phone +56912345679)');
    console.log('   /tenants         - Listar tenants utilizados');
    console.log('   /history         - Ver historial del tenant actual');
    console.log('   /help            - Mostrar esta ayuda');
    console.log('   exit             - Salir del simulador\n');

    console.log('💬 Escribe mensajes y presiona Enter para enviar:\n');
  }

  private async promptUser(
    processMessage: (tenantId: string, phoneNumber: string, text: string) => Promise<string | null>
  ): Promise<void> {
    return new Promise(() => {
      this.rl.on('line', async (input) => {
        if (input.toLowerCase() === 'exit') {
          this.logger.info('👋 Terminal cerrada');
          this.rl.close();
          process.exit(0);
        }

        if (!input.trim()) {
          this.showPrompt();
          return;
        }

        try {
          // Procesar comandos especiales
          if (input.startsWith('/')) {
            await this.handleCommand(input, processMessage);
            this.showPrompt();
            return;
          }

          // Enviar mensaje normal
          console.log('');
          this.logger.info(
            `[SIMULACIÓN] Enviando: tenantId=${this.currentTenantId}, phone=${this.currentPhoneNumber}, msg="${input}"`
          );

          const response = await processMessage(
            this.currentTenantId,
            this.currentPhoneNumber,
            input.trim()
          );

          // Guardar en historial
          this.addToHistory(this.currentPhoneNumber, input.trim(), response || '(sin respuesta)');

          // Mostrar respuesta con diseño
          this.displayBotResponse(response);
        } catch (error) {
          this.logger.error({ error }, '❌ Error procesando mensaje');
          console.log('\n┌─ ⚠️  ERROR:');
          console.log(`│ ${(error as any).message || 'Error desconocido'}`);
          console.log('└─\n');
        }

        this.showPrompt();
      });

      this.showPrompt();
    });
  }

  private async handleCommand(
    input: string,
    processMessage: (tenantId: string, phoneNumber: string, text: string) => Promise<string | null>
  ): Promise<void> {
    const parts = input.trim().split(/\s+/);
    const command = parts[0].toLowerCase();

    switch (command) {
    case '/tenant': {
      if (parts.length < 2) {
        console.log('❌ Uso: /tenant <id>');
        console.log('   Ejemplo: /tenant ferreteria_01\n');
        break;
      }
      const newTenantId = parts.slice(1).join('_');
      this.currentTenantId = newTenantId;
      console.log(`\n✅ Tenant cambiado a: ${this.currentTenantId}`);
      this.currentPhoneNumber = '+56912345678'; // Reset teléfono por defecto
      console.log(`📱 Teléfono resetado a: ${this.currentPhoneNumber}\n`);
      break;
    }

    case '/phone': {
      if (parts.length < 2) {
        console.log('❌ Uso: /phone <número>');
        console.log('   Ejemplo: /phone +56912345679\n');
        break;
      }
      this.currentPhoneNumber = parts.slice(1).join('');
      console.log(`\n✅ Cliente cambiado a: ${this.currentPhoneNumber}\n`);
      break;
    }

    case '/tenants':
      this.showTenantList();
      break;

    case '/history':
      this.showHistory();
      break;

    case '/help':
      this.showWelcomeBanner();
      break;

    default:
      console.log(`\n❌ Comando desconocido: ${command}`);
      console.log('Escribe "/help" para ver comandos disponibles\n');
    }
  }

  private showTenantList(): void {
    const tenants = Array.from(this.tenantHistory.keys());

    console.log('\n┌─ 📊 TENANTS UTILIZADOS:');
    if (tenants.length === 0) {
      console.log('│ (Ningún tenant ha sido usado aún)');
    } else {
      tenants.forEach((tenant, index) => {
        const count = this.tenantHistory.get(tenant)?.length || 0;
        const marker = tenant === this.currentTenantId ? '→' : ' ';
        console.log(`${marker}  ${index + 1}. ${tenant} (${count} conversación/es)`);
      });
    }
    console.log('└─\n');
  }

  private showHistory(): void {
    const history = this.tenantHistory.get(this.currentTenantId) || [];

    console.log(`\n┌─ 📜 HISTORIAL DE ${this.currentTenantId}:`);
    if (history.length === 0) {
      console.log('│ (Sin historial)');
    } else {
      history.forEach((entry, index) => {
        console.log('│');
        console.log(`│ [${index + 1}] 📱 ${entry.phone}`);
        console.log(`│     👤 Tú: ${entry.message}`);
        console.log(`│     🤖 Bot: ${entry.response.substring(0, 60)}${entry.response.length > 60 ? '...' : ''}`);
      });
    }
    console.log('└─\n');
  }

  private displayBotResponse(response: string | null): void {
    console.log('┌─ BOT RESPONDE:');
    if (response) {
      response.split('\n').forEach((line) => {
        console.log(`│ ${line}`);
      });
    } else {
      console.log('│ (sin respuesta)');
    }
    console.log('└─\n');
  }

  private addToHistory(phoneNumber: string, message: string, response: string): void {
    const key = `${this.currentTenantId}::${phoneNumber}`;

    if (!this.tenantHistory.has(this.currentTenantId)) {
      this.tenantHistory.set(this.currentTenantId, []);
    }

    const tenantHistories = this.tenantHistory.get(this.currentTenantId)!;
    tenantHistories.push({ phone: phoneNumber, message, response });
  }

  private showPrompt(): void {
    const prompt = `[${this.currentTenantId}|${this.currentPhoneNumber}] Tú: `;
    process.stdout.write(prompt);
  }

  async stop(): Promise<void> {
    if (this.isRunning) {
      this.rl.close();
      this.isRunning = false;
    }
  }
}

