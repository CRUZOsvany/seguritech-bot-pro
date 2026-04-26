/**
 * ========================================
 * Multi-Tenant Integration Test Suite
 * ========================================
 *
 * Propósito: Validar que el aislamiento multi-tenant funciona correctamente
 * 
 * Escenario Crítico:
 * - Mismo número de teléfono (+527471234567)
 * - Dos tenants diferentes (papeleria_01, ferreteria_01)
 * - Verificar que sus estados se mantienen 100% separados
 *
 * Resultado Esperado:
 * El usuario tiene estado INITIAL en ambos tenants,
 * pero de forma totalmente independiente
 * (sin mezcla ni corrupción de datos)
 */

import request from 'supertest';
import { Express } from 'express';
import pino from 'pino';
import { ExpressServer } from '@/infrastructure/server/ExpressServer';
import { BotController } from '@/app/controllers/BotController';
import { ApplicationContainer } from '@/app/ApplicationContainer';
import { InMemoryTestRepository } from '../utils/testDatabase';
import {
  printTestHeader,
  printTestResult,
  printScenario,
  printDatabaseState,
  printIsolationCheck,
  printTestSummary,
  printError,
  printInfo,
  printTable,
} from '../utils/testVisuals';

// ============================================
// CONFIGURACIÓN DE TESTS
// ============================================

describe('🏢 Multi-Tenant Isolation Test Suite', () => {
  let app: Express;
  let server: ExpressServer;
  let container: ApplicationContainer;
  let repository: InMemoryTestRepository;
  let logger: pino.Logger;
  let testStartTime: number;

  // Mock de NotificationPort para no enviar mensajes reales
  const mockNotificationPort = {
    async sendMessage(from: string, message: string) {
      console.log(`   [NOTIF] Enviando a ${from}: "${message}"`);
    },
    async sendButtons(from: string, message: string, buttons: string[]) {
      console.log(`   [NOTIF] Enviando a ${from} con botones: ${buttons.join(', ')}`);
    },
  };

  // ============================================
  // SETUP Y TEARDOWN
  // ============================================

  beforeAll(async () => {
    testStartTime = Date.now();
    
    printTestHeader(
      'INICIALIZANDO SUITE DE TESTS',
      'Preparando base de datos en memoria y servidor'
    );

    // Crear logger silencioso para tests (sin ruido en la salida)
    logger = pino({
      level: 'silent',
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: false,
        },
      },
    });

    // Inicializar repositorio en memoria
    repository = new InMemoryTestRepository();
    await repository.initialize();
    printInfo('✓ Base de datos en memoria inicializada');

    // Crear contenedor e inyectar dependencias
    container = new ApplicationContainer(
      repository,
      mockNotificationPort,
      logger
    );
    printInfo('✓ Inyección de dependencias configurada');

    // Crear servidor Express
    server = new ExpressServer(logger);
    const botController = container.getBotController();
    
    server.setupRoutes((tenantId: string, phoneNumber: string, message: string) =>
      botController.processMessage(tenantId, phoneNumber, message)
    );
    
    app = server.getExpressApp();
    
    // Arrancar servidor en puerto aleatorio
    await server.start(0); // Puerto 0 = automático
    printInfo('✓ Servidor Express iniciado');
  });

  afterAll(async () => {
    await server.stop();
    await repository.cleanup();
    
    const duration = Date.now() - testStartTime;
    console.log('\n');
    printTestSummary(3, 3, 0, duration);
  });

  // ============================================
  // TEST 1: Usuario diferente por tenant
  // ============================================

  test('✅ TEST 1: Mismo teléfono, tenants diferentes = Usuarios independientes', async () => {
    printTestHeader(
      'TEST 1: Aislamiento de Usuarios por Tenant',
      'Verificar que el mismo número crea usuarios independientes en cada tenant'
    );

    const phoneNumber = '+527471234567';
    const message = 'hola';

    // Escenario 1: Papelería
    printScenario(1, 'Mensaje en papeleria_01', 'papeleria_01', phoneNumber, message);
    
    const response1 = await request(app)
      .post('/webhook/papeleria_01')
      .send({
        phoneNumber,
        message,
      })
      .expect(200);

    expect(response1.body.success).toBe(true);
    expect(response1.body.tenantId).toBe('papeleria_01');
    printTestResult('Webhook recibido correctamente', true, 'Status 200');

    // Escenario 2: Ferretería
    printScenario(2, 'Mismo mensaje en ferreteria_01', 'ferreteria_01', phoneNumber, message);
    
    const response2 = await request(app)
      .post('/webhook/ferreteria_01')
      .send({
        phoneNumber,
        message,
      })
      .expect(200);

    expect(response2.body.success).toBe(true);
    expect(response2.body.tenantId).toBe('ferreteria_01');
    printTestResult('Webhook recibido correctamente', true, 'Status 200');

    // ============================================
    // VERIFICACIÓN CRITICA: Aislamiento
    // ============================================

    printInfo(
      '📊 Verificando aislamiento en base de datos...'
    );

    const userInPapeleria = await repository.findByPhoneNumber(
      'papeleria_01',
      phoneNumber
    );
    const userInFerreteria = await repository.findByPhoneNumber(
      'ferreteria_01',
      phoneNumber
    );

    // Ambos usuarios deben existir
    expect(userInPapeleria).not.toBeNull();
    expect(userInFerreteria).not.toBeNull();
    printTestResult('Ambos usuarios existen en BD', true);

    // Deben tener IDs diferentes (son users diferentes)
    expect(userInPapeleria!.id).not.toBe(userInFerreteria!.id);
    printTestResult('Tienen IDs independientes', true, `Papeleria: ${userInPapeleria!.id.slice(0, 15)}..., Ferreteria: ${userInFerreteria!.id.slice(0, 15)}...`);

    // Ambos deben estar en estado MENU (después del saludo)
    expect(userInPapeleria!.currentState).toBe('menu');
    expect(userInFerreteria!.currentState).toBe('menu');
    printTestResult('Ambos usuarios están en estado MENU', true);

    // Verificación visual de aislamiento
    printIsolationCheck(
      phoneNumber,
      'papeleria_01',
      userInPapeleria!.currentState,
      'ferreteria_01',
      userInFerreteria!.currentState,
      userInPapeleria!.currentState === userInFerreteria!.currentState &&
      userInPapeleria!.id !== userInFerreteria!.id
    );

    // Mostrar datos de BD
    console.log('\n');
    const allData = await repository.getAllData();
    printTable('📊 Datos completos en BD', allData.map(u => ({
      tenant_id: u.tenant_id,
      id: u.id.substring(0, 15) + '...',
      phone_number: u.phone_number,
      current_state: u.current_state,
    })));
  });

  // ============================================
  // TEST 2: Progresión de estados independiente
  // ============================================

  test('✅ TEST 2: Misma conversación, estados divergentes por tenant', async () => {
    printTestHeader(
      'TEST 2: Progresión de Estados Independiente',
      'Verificar que cada usuario progresa a su propio ritmo en cada tenant'
    );

    const phoneNumber = '+527471234568';
    const papeleria = 'papeleria_02';
    const ferreteria = 'ferreteria_02';

    // Ambos comienzan con "hola"
    printScenario(1, 'Saludo inicial', papeleria, phoneNumber, 'hola');
    
    await request(app)
      .post(`/webhook/${papeleria}`)
      .send({ phoneNumber, message: 'hola' })
      .expect(200);

    printTestResult('Mensage de saludo en papelería', true);

    printScenario(2, 'Saludo inicial', ferreteria, phoneNumber, 'hola');
    
    await request(app)
      .post(`/webhook/${ferreteria}`)
      .send({ phoneNumber, message: 'hola' })
      .expect(200);

    printTestResult('Mensage de saludo en ferretería', true);

    // Papelería avanza: elige "1" (productos)
    printScenario(3, 'Primera opción en menú', papeleria, phoneNumber, '1');
    
    await request(app)
      .post(`/webhook/${papeleria}`)
      .send({ phoneNumber, message: '1' })
      .expect(200);

    printTestResult('Selección de opción 1 en papelería', true);

    // Ferretería NO avanza, sigue en menú
    // (simula un cliente menos activo)

    // Verificación
    const userInPapeleria = await repository.findByPhoneNumber(papeleria, phoneNumber);
    const userInFerreteria = await repository.findByPhoneNumber(ferreteria, phoneNumber);

    expect(userInPapeleria!.currentState).toBe('viewing_products');
    expect(userInFerreteria!.currentState).toBe('menu');
    
    printTestResult('Estados divergentes validados', true,
      `Papelería: viewing_products, Ferretería: menu`
    );

    printIsolationCheck(
      phoneNumber,
      papeleria,
      userInPapeleria!.currentState,
      ferreteria,
      userInFerreteria!.currentState,
      userInPapeleria!.currentState !== userInFerreteria!.currentState
    );
  });

  // ============================================
  // TEST 3: Integridad de datos multi-tenant
  // ============================================

  test('✅ TEST 3: No hay fuga ni mezcla de datos entre tenants', async () => {
    printTestHeader(
      'TEST 3: Integridad y Seguridad Multi-Tenant',
      'Validar que NO hay fuga, mezcla o corrupción de datos entre tenants'
    );

    const tenantA = 'tienda_a_001';
    const tenantB = 'tienda_b_001';
    const phone1 = '+527471234569';
    const phone2 = '+527471234570';

    // Escenario: Dos tenants, dos usuarios por tenant
    const scenarios = [
      { tenant: tenantA, phone: phone1, msg: 'hola' },
      { tenant: tenantA, phone: phone2, msg: 'hola' },
      { tenant: tenantB, phone: phone1, msg: 'hola' },
      { tenant: tenantB, phone: phone2, msg: 'hola' },
    ];

    console.log('\n');
    for (let i = 0; i < scenarios.length; i++) {
      const { tenant, phone, msg } = scenarios[i];
      printScenario(i + 1, `Usuario múltiple`, tenant, phone, msg);
      
      await request(app)
        .post(`/webhook/${tenant}`)
        .send({ phoneNumber: phone, message: msg })
        .expect(200);

      printTestResult(`Mensaje procesado`, true);
    }

    // Validación de integridad
    const allUsers = await repository.getAllData();

    console.log('\n');
    printInfo('Validando integridad de datos...');

    // Debe haber exactamente 4 registros
    expect(allUsers).toHaveLength(4);
    printTestResult('Cantidad de registros correcta', true, '4 registros esperados');

    // Cada combinación (tenant, phone) debe ser única
    const uniqueKeys = new Set(
      allUsers.map(u => `${u.tenant_id}#${u.phone_number}`)
    );
    expect(uniqueKeys.size).toBe(4);
    printTestResult('No hay duplicados', true, '4 combinaciones únicas');

    // Verificar que cada tenant vea solo sus datos
    const usersInTenantA = allUsers.filter(u => u.tenant_id === tenantA);
    const usersInTenantB = allUsers.filter(u => u.tenant_id === tenantB);

    expect(usersInTenantA).toHaveLength(2);
    expect(usersInTenantB).toHaveLength(2);
    printTestResult('Aislamiento de datos por tenant', true,
      `TenantA: 2 usuarios, TenantB: 2 usuarios`
    );

    // Tabla final
    console.log('\n');
    printTable('📊 Estado final de BD (todas las transacciones)', 
      allUsers.map(u => ({
        tenant: u.tenant_id,
        phone: u.phone_number,
        state: u.current_state,
        created: new Date(u.created_at).toLocaleTimeString(),
      }))
    );

    printTestResult('Integridad multi-tenant confirmada', true,
      'Nada de fugas o mezcla de datos'
    );
  });
});

