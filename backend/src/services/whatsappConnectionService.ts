import * as fs from 'fs';
import * as path from 'path';
import logger from '@/config/logger';

export interface ConnectionConfig {
  auth?: any;
  logger?: any;
  browser?: [string, string, string];
  syncFullHistory?: boolean;
  shouldIgnoreJidEndpoints?: Set<string>;
}

/**
 * Servicio para gestionar la conexión con WhatsApp vía Baileys
 * Maneja reconexión automática, persistencia de sesión y caché
 */
export class WhatsAppConnectionService {
  private authPath: string;

  constructor() {
    this.authPath = path.join(process.cwd(), '.auth_info');
  }

  /**
   * Limpia la sesión almacenada
   */
  clearSession(): void {
    if (fs.existsSync(this.authPath)) {
      fs.unlinkSync(this.authPath);
      logger.info('Sesión eliminada');
    }
  }
}

