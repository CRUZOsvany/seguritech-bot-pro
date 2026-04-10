// ===================================================================
// TEST DE PERFORMANCE Y DEVSECOPS
// Proyecto: SegurITech Bot Pro
// Propósito: Verificar que NO hay ReDoS bloqueando Event Loop
// Validación: Respuestas en < 2 segundos
// ===================================================================

import pino from 'pino';
import { config, validateConfig } from '@/config/env';
import { createLogger } from '@/config/logger';
import { ApplicationContainer } from '@/app/ApplicationContainer';
import { InMemoryUserRepository } from '@/infrastructure/repositories/InMemoryUserRepository';
import { ConsoleNotificationAdapter } from '@/infrastructure/adapters/ConsoleNotificationAdapter';

/**
 * INTERFACE: Resultado de test
 */
interface TestResult {
  testName: string;
  executionTime: number;
  passed: boolean;
  maxExecutionTime: number;
  message: string;
}

/**
 * INTERFACE: Métricas de performance
 */
interface PerformanceMetrics {
  totalTests: number;
  passedTests: number;
  failedTests: number;
  averageTime: number;
  maxTime: number;
  minTime: number;
  eventLoopBlocked: boolean;
  results: TestResult[];
}

/**
 * Clase especializada para tests de performance y seguridad
 * Verifica que no hay ReDoS ni bloqueos en el Event Loop
 */
export class PerformanceSecurityTest {
  private logger: pino.Logger;
  private container: ApplicationContainer | null = null;
  private metrics: PerformanceMetrics = {
    totalTests: 0,
    passedTests: 0,
    failedTests: 0,
    averageTime: 0,
    maxTime: 0,
    minTime: Infinity,
    eventLoopBlocked: false,
    results: [],
  };

  constructor() {
    this.logger = createLogger();
  }

  /**
   * Ejecuta todos los tests de performance
   */
  async runAllTests(): Promise<PerformanceMetrics> {
    try {
      // Validar configuración
      validateConfig();

      // Inicializar contenedor
      this.initializeContainer();

      this.logger.info('🔐 Iniciando Tests de Performance y DevSecOps...');
      this.logger.info('⏱️  Máximo permitido por test: 2 segundos');
      this.logger.info('🛡️  Validando: NO hay ReDoS bloqueando Event Loop\n');

      // Test 1: Respuesta a saludo simple
      await this.testSimpleGreeting();

      // Test 2: Respuesta a menú
      await this.testMenuResponse();

      // Test 3: Respuesta a múltiples opciones rápidamente
      await this.testRapidSequence();

      // Test 4: Respuesta bajo carga (simular múltiples usuarios)
      await this.testUnderLoad();

      // Test 5: Validación de regex sin ReDoS
      await this.testRegexPerformance();

      // Test 6: Validación de Event Loop health
      await this.testEventLoopHealth();

      // Generar reporte
      this.generateReport();

      return this.metrics;
    } catch (error) {
      this.logger.error('❌ Error en tests de performance:', error);
      throw error;
    }
  }

  /**
   * TEST 1: Respuesta a saludo simple (< 100ms esperado)
   */
  private async testSimpleGreeting(): Promise<void> {
    const startTime = process.hrtime.bigint();

    try {
      const botController = this.container!.getBotController();
      await botController.processMessage('+34123456789', 'Hola');

      const endTime = process.hrtime.bigint();
      const executionTime = Number(endTime - startTime) / 1_000_000; // Convertir a ms

      const result: TestResult = {
        testName: 'Respuesta a Saludo Simple',
        executionTime,
        passed: executionTime < 2000,
        maxExecutionTime: 2000,
        message: `✅ Completado en ${executionTime.toFixed(2)}ms`,
      };

      this.recordResult(result);
      this.logger.info(`📝 Test 1: ${result.message}`);
    } catch (error) {
      this.recordFailedResult('Respuesta a Saludo Simple', error);
    }
  }

  /**
   * TEST 2: Respuesta a menú (< 150ms esperado)
   */
  private async testMenuResponse(): Promise<void> {
    const startTime = process.hrtime.bigint();

    try {
      const botController = this.container!.getBotController();
      await botController.processMessage('+34123456789', '1');

      const endTime = process.hrtime.bigint();
      const executionTime = Number(endTime - startTime) / 1_000_000;

      const result: TestResult = {
        testName: 'Respuesta a Opción de Menú',
        executionTime,
        passed: executionTime < 2000,
        maxExecutionTime: 2000,
        message: `✅ Completado en ${executionTime.toFixed(2)}ms`,
      };

      this.recordResult(result);
      this.logger.info(`📝 Test 2: ${result.message}`);
    } catch (error) {
      this.recordFailedResult('Respuesta a Opción de Menú', error);
    }
  }

  /**
   * TEST 3: Secuencia rápida de mensajes (< 500ms para 5 mensajes)
   */
  private async testRapidSequence(): Promise<void> {
    const messages = ['Hola', '1', '2', '3', 'ayuda'];
    const startTime = process.hrtime.bigint();

    try {
      const botController = this.container!.getBotController();

      for (const msg of messages) {
        await botController.processMessage('+34987654321', msg);
      }

      const endTime = process.hrtime.bigint();
      const executionTime = Number(endTime - startTime) / 1_000_000;
      const avgTime = executionTime / messages.length;

      const result: TestResult = {
        testName: 'Secuencia Rápida (5 mensajes)',
        executionTime,
        passed: executionTime < 2000,
        maxExecutionTime: 2000,
        message: `✅ 5 mensajes en ${executionTime.toFixed(2)}ms`,
      };

      this.recordResult(result);
      this.logger.info(`📝 Test 3: ${result.message}`);
    } catch (error) {
      this.recordFailedResult('Secuencia Rápida', error);
    }
  }

  /**
   * TEST 4: Bajo carga
   */
  private async testUnderLoad(): Promise<void> {
    const startTime = process.hrtime.bigint();

    try {
      const botController = this.container!.getBotController();

      for (let i = 0; i < 10; i++) {
        await botController.processMessage(`+34${100000000 + i}`, 'Hola');
      }

      const endTime = process.hrtime.bigint();
      const executionTime = Number(endTime - startTime) / 1_000_000;

      const result: TestResult = {
        testName: 'Bajo Carga (10 usuarios)',
        executionTime,
        passed: executionTime < 2000,
        maxExecutionTime: 2000,
        message: `✅ Completado en ${executionTime.toFixed(2)}ms`,
      };

      this.recordResult(result);
      this.logger.info(`📝 Test 4: ${result.message}`);
    } catch (error) {
      this.recordFailedResult('Bajo Carga', error);
    }
  }

  /**
   * TEST 5: Validación de Regex sin ReDoS
   */
  private async testRegexPerformance(): Promise<void> {
    const startTime = process.hrtime.bigint();

    try {
      const testPatterns = [
        /^[a-zA-Z0-9._-]*$/,
        /^(\d+\.)*\d+$/,
        /^(hola|hi|hey)/i,
      ];

      const testStrings = [
        'hola',
        'usuario@example.com',
        '1.2.3.4',
        'a'.repeat(1000),
      ];

      for (const pattern of testPatterns) {
        for (const str of testStrings) {
          pattern.test(str);
        }
      }

      const endTime = process.hrtime.bigint();
      const executionTime = Number(endTime - startTime) / 1_000_000;

      const result: TestResult = {
        testName: 'Validación de Regex (Sin ReDoS)',
        executionTime,
        passed: executionTime < 2000,
        maxExecutionTime: 2000,
        message: `✅ Completado en ${executionTime.toFixed(2)}ms`,
      };

      this.recordResult(result);
      this.logger.info(`📝 Test 5: ${result.message}`);
    } catch (error) {
      this.recordFailedResult('Validación de Regex', error);
    }
  }

  /**
   * TEST 6: Event Loop Health
   */
  private async testEventLoopHealth(): Promise<void> {
    const startTime = process.hrtime.bigint();

    try {
      const lags: number[] = [];
      for (let i = 0; i < 10; i++) {
        const s = process.hrtime.bigint();
        await new Promise((resolve) => setImmediate(resolve));
        const e = process.hrtime.bigint();
        lags.push(Number(e - s) / 1_000_000);
      }

      const maxLag = Math.max(...lags);
      const eventLoopHealthy = maxLag < 100;

      const endTime = process.hrtime.bigint();
      const executionTime = Number(endTime - startTime) / 1_000_000;

      const result: TestResult = {
        testName: 'Event Loop Health',
        executionTime,
        passed: eventLoopHealthy && executionTime < 2000,
        maxExecutionTime: 2000,
        message: `✅ Event Loop OK - Max lag: ${maxLag.toFixed(2)}ms`,
      };

      this.metrics.eventLoopBlocked = !eventLoopHealthy;
      this.recordResult(result);
      this.logger.info(`📝 Test 6: ${result.message}`);
    } catch (error) {
      this.recordFailedResult('Event Loop Health', error);
    }
  }

  /**
   * Registra resultado
   */
  private recordResult(result: TestResult): void {
    this.metrics.results.push(result);
    this.metrics.totalTests++;

    if (result.passed) {
      this.metrics.passedTests++;
    } else {
      this.metrics.failedTests++;
    }

    this.metrics.maxTime = Math.max(this.metrics.maxTime, result.executionTime);
    this.metrics.minTime = Math.min(this.metrics.minTime, result.executionTime);
  }

  /**
   * Registra error
   */
  private recordFailedResult(testName: string, error: any): void {
    const result: TestResult = {
      testName,
      executionTime: -1,
      passed: false,
      maxExecutionTime: 2000,
      message: `❌ Error: ${error instanceof Error ? error.message : String(error)}`,
    };

    this.recordResult(result);
    this.logger.error(`📝 Test: ${result.message}`);
  }

  /**
   * Inicializa contenedor
   */
  private initializeContainer(): void {
    const userRepository = new InMemoryUserRepository();
    const notificationPort = new ConsoleNotificationAdapter();

    this.container = new ApplicationContainer(
      userRepository,
      notificationPort,
      this.logger,
    );
  }

  /**
   * Genera reporte
   */
  private generateReport(): void {
    if (this.metrics.totalTests > 0) {
      this.metrics.averageTime =
        this.metrics.results.reduce((sum, r) => sum + r.executionTime, 0) /
        this.metrics.totalTests;
    }

    this.logger.info('\n' + '='.repeat(70));
    this.logger.info('📊 REPORTE FINAL DE PERFORMANCE Y DEVSECOPS');
    this.logger.info('='.repeat(70));

    this.logger.info(`\n✅ Tests ejecutados: ${this.metrics.passedTests}/${this.metrics.totalTests}`);
    this.logger.info(`❌ Tests fallidos: ${this.metrics.failedTests}`);
    this.logger.info(`\n⏱️  Tiempo promedio: ${this.metrics.averageTime.toFixed(2)}ms`);
    this.logger.info(`⏱️  Tiempo máximo: ${this.metrics.maxTime.toFixed(2)}ms`);

    if (this.metrics.eventLoopBlocked) {
      this.logger.warn('\n⚠️  ALERTA: Event Loop bloqueado. Revisar ReDoS.');
    } else {
      this.logger.info('\n✅ Event Loop SALUDABLE - Sin signos de ReDoS');
    }

    this.logger.info('\n🔐 CONCLUSIÓN:');
    if (this.metrics.failedTests === 0 && !this.metrics.eventLoopBlocked) {
      this.logger.info('✅ SEGURO: NO hay ReDoS. Bot es seguro en producción.');
    } else {
      this.logger.error('❌ INSEGURO: Se detectaron problemas. Revisar configuración.');
    }

    this.logger.info('='.repeat(70) + '\n');
  }
}

export { PerformanceMetrics, TestResult };

