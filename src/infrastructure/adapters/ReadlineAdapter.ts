import * as readline from 'readline';
import pino from 'pino';

/**
 * Adaptador de terminal interactivo para pruebas locales
 * Permite escribir mensajes en la consola y ver respuestas del bot
 */
export class ReadlineAdapter {
  private rl: readline.Interface;
  private logger: pino.Logger;
  private isRunning: boolean = false;

  constructor(logger: pino.Logger) {
    this.logger = logger;
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }

  async start(
    processMessage: (phoneNumber: string, text: string) => Promise<string | null>
  ): Promise<void> {
    this.isRunning = true;
    this.logger.info('🎮 Terminal interactiva iniciada');
    this.logger.info('Escribe mensajes y presiona Enter. Escribe "exit" para salir.\n');

    await this.promptUser(processMessage);
  }

  private async promptUser(
    processMessage: (phoneNumber: string, text: string) => Promise<string | null>
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
          const response = await processMessage('+34123456789', input.trim());

          console.log('\n┌─ BOT RESPONDE:');
          if (response) {
            console.log('│');
            response.split('\n').forEach((line) => {
              console.log(`│ ${line}`);
            });
          } else {
            console.log('│ (sin respuesta)');
          }
          console.log('└─\n');
        } catch (error) {
          this.logger.error({ error }, 'Error procesando mensaje');
        }

        this.showPrompt();
      });

      this.showPrompt();
    });
  }

  private showPrompt(): void {
    process.stdout.write('Tú: ');
  }

  async stop(): Promise<void> {
    if (this.isRunning) {
      this.rl.close();
      this.isRunning = false;
    }
  }
}

