/**
 * =========================================================================
 * EJEMPLO DE INTEGRACIÓN - MetaWhatsAppAdapter
 * =========================================================================
 *
 * Este archivo muestra cómo integrar MetaWhatsAppAdapter en tu flujo
 * de producción con Arquitectura Hexagonal.
 *
 * Casos de uso:
 * 1. Verificar webhook (Handshake con Meta)
 * 2. Parsear mensajes entrantes
 * 3. Enviar respuestas (texto o botones)
 */

// =========================================================================
// 📦 SETUP INICIAL
// =========================================================================

import pino from 'pino';
import express, { Request, Response } from 'express';
import { ApplicationContainer } from '@/app/ApplicationContainer';
import { MetaWhatsAppAdapter } from '@/infrastructure/adapters/MetaWhatsAppAdapter';
import { ExpressServer } from '@/infrastructure/server/ExpressServer';
import { config } from '@/config/env';

// Logger
const logger = pino({
  level: config.log.level,
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      singleLine: true,
    },
  },
});

// =========================================================================
// 🚀 EJEMPLO 1: Instanciar el Adaptador
// =========================================================================

async function setupAdapter(): Promise<MetaWhatsAppAdapter> {
  logger.info('Inicializando MetaWhatsAppAdapter...');

  const adapter = new MetaWhatsAppAdapter(
    logger,
    config.meta.phoneNumberId,
    config.meta.accessToken,
    config.meta.apiUrl,
  );

  await adapter.initialize();
  logger.info('✅ MetaWhatsAppAdapter listo');

  return adapter;
}

// =========================================================================
// 🔒 EJEMPLO 2: Verificación de Webhook (Handshake)
// =========================================================================

/**
 * Meta hace una petición GET a /webhook con parámetros:
 *   ?hub.mode=subscribe
 *   &hub.verify_token=VALUE
 *   &hub.challenge=RANDOM_STRING
 *
 * Nuestro adaptador lo maneja automáticamente.
 * Este es el flujo en un servidor Express:
 */
async function exampleWebhookVerification(
  adapter: MetaWhatsAppAdapter,
) {
  logger.info('═══════════════════════════════════════════════════════════');
  logger.info('EJEMPLO 2: Verificación de Webhook');
  logger.info('═══════════════════════════════════════════════════════════');

  const app = express();
  app.use(express.json());

  // Meta hace: GET /webhook?hub.mode=subscribe&hub.verify_token=X&hub.challenge=Y
  app.get('/webhook', (req: Request, res: Response) => {
    logger.info('📨 GET /webhook - Handshake de Meta');
    adapter.verifyWebhook(req, res);
  });

  logger.info('✅ Ruta GET /webhook registrada');
  logger.info('   Cuando Meta llamé a esta ruta, nuestro adaptador');
  logger.info('   valida el token y responde con el challenge.');
  logger.info('');
}

// =========================================================================
// 📥 EJEMPLO 3: Parsear Mensajes Entrantes
// =========================================================================

/**
 * Cuando un usuario envía un mensaje por WhatsApp,
 * Meta nos envía un payload gigante. El adaptador lo traduce.
 */
async function exampleParseIncomingMessage(
  adapter: MetaWhatsAppAdapter,
) {
  logger.info('═══════════════════════════════════════════════════════════');
  logger.info('EJEMPLO 3: Parsear Mensajes Entrantes');
  logger.info('═══════════════════════════════════════════════════════════');

  // Payload gigante de Meta (típico)
  const metaPayload = {
    entry: [
      {
        changes: [
          {
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '34912345678',      // El número del negocio
                phone_number_id: '102345678901234',       // ID del número
              },
              messages: [
                {
                  from: '34612345678',                     // Quién envía
                  text: {
                    body: 'Hola, necesito ayuda con una order', // El mensaje
                  },
                  timestamp: Date.now().toString(),
                },
              ],
              contacts: [
                {
                  wa_id: '34612345678',
                  profile: {
                    name: 'Juan Pérez',
                  },
                },
              ],
            },
          },
        ],
      },
    ],
  };

  logger.info('📨 Payload de Meta recibido:');
  logger.info(JSON.stringify(metaPayload, null, 2).slice(0, 300) + '...');
  logger.info('');

  // Usar el adaptador para parsear
  const parsed = adapter.parseIncomingMessage(metaPayload);

  if (parsed) {
    logger.info('✅ Mensaje parseado exitosamente:');
    logger.info(`   from: ${parsed.from}`);
    logger.info(`   content: "${parsed.content}"`);
    logger.info(`   businessNumber: ${parsed.businessNumber}`);
    logger.info(`   timestamp: ${parsed.timestamp}`);
    logger.info('');
  } else {
    logger.warn('⚠️  El payload no contiene mensajes (puede ser delivery receipt)');
  }
}

// =========================================================================
// 📤 EJEMPLO 4: Enviar Mensaje Simple
// =========================================================================

async function exampleSendText(
  adapter: MetaWhatsAppAdapter,
) {
  logger.info('═══════════════════════════════════════════════════════════');
  logger.info('EJEMPLO 4: Enviar Mensaje de Texto');
  logger.info('═══════════════════════════════════════════════════════════');

  const phoneNumber = '34612345678';
  const message = '¡Hola! Tu solicitud fue recibida. Un agente te contactará en 5 minutos.';

  logger.info(`📱 Enviando mensaje de texto a ${phoneNumber}`);
  logger.info(`   Contenido: "${message}"`);
  logger.info('');

  try {
    await adapter.sendMessage(phoneNumber, message);
    logger.info('✅ Mensaje enviado exitosamente a Meta');
  } catch (error) {
    logger.error(
      { error, phoneNumber },
      '❌ Error al enviar mensaje',
    );
  }

  logger.info('');
}

// =========================================================================
// 🎯 EJEMPLO 5: Enviar Mensaje Interactivo con Botones
// =========================================================================

async function exampleSendButtons(
  adapter: MetaWhatsAppAdapter,
) {
  logger.info('═══════════════════════════════════════════════════════════');
  logger.info('EJEMPLO 5: Enviar Mensaje Interactivo (Botones)');
  logger.info('═══════════════════════════════════════════════════════════');

  const phoneNumber = '34612345678';
  const message = '¿Cómo podemos ayudarte?';
  const buttons = ['📦 Ver Orden', '💰 Facturación', '🔐 Seguridad'];

  logger.info(`📱 Enviando mensaje interactivo a ${phoneNumber}`);
  logger.info(`   Mensaje: "${message}"`);
  logger.info(`   Botones: ${JSON.stringify(buttons)}`);
  logger.info('');

  try {
    await adapter.sendButtons(phoneNumber, message, buttons);
    logger.info('✅ Mensaje interactivo enviado exitosamente a Meta');
  } catch (error) {
    logger.error(
      { error, phoneNumber, buttonCount: buttons.length },
      '❌ Error al enviar botones',
    );
  }

  logger.info('');
}

// =========================================================================
// 🔄 EJEMPLO 6: Integración Completa en Express + ApplicationContainer
// =========================================================================

async function exampleFullIntegration() {
  logger.info('═══════════════════════════════════════════════════════════');
  logger.info('EJEMPLO 6: Integración Completa');
  logger.info('═══════════════════════════════════════════════════════════');

  // 1. Crear ApplicationContainer (ya incluye MetaAdapter)
  const container = new ApplicationContainer(
    null as any, // En producción, inyectar userRepository real
    null as any, // En producción, inyectar notificationAdapter real
    logger,
  );

  // 2. Obtener el adaptador Meta del contenedor
  const metaAdapter = container.getMetaWhatsAppAdapter();
  logger.info('✅ MetaWhatsAppAdapter obtenido del contenedor');

  // 3. Crear servidor Express con el adaptador inyectado
  const expressServer = new ExpressServer(logger, metaAdapter);
  logger.info('✅ ExpressServer creado con MetaAdapter inyectado');

  // 4. Configurar rutas
  expressServer.setupRoutes(
    async (tenantId: string, phoneNumber: string, message: string) => {
      logger.info(`Processing: ${tenantId} | ${phoneNumber} | ${message}`);
      return 'Mensaje procesado';
    },
  );
  logger.info('✅ Rutas configuradas');

  logger.info('');
  logger.info('Flujo completo:');
  logger.info('  1. Meta envía GET /webhook (handshake)');
  logger.info('  2. MetaAdapter.verifyWebhook() responde');
  logger.info('  3. Usuario envía mensaje por WhatsApp');
  logger.info('  4. Meta envía POST /webhook/:tenantId');
  logger.info('  5. MetaAdapter.parseIncomingMessage() traduce');
  logger.info('  6. Bot procesa y responde');
  logger.info('  7. MetaAdapter.sendMessage/sendButtons() envía a Meta');
  logger.info('');
}

// =========================================================================
// 🏃 EJECUTAR TODOS LOS EJEMPLOS
// =========================================================================

async function runAllExamples() {
  console.log('\n');
  logger.info('╔══════════════════════════════════════════════════════════╗');
  logger.info('║  EJEMPLO: MetaWhatsAppAdapter - Integración Completa    ║');
  logger.info('╚══════════════════════════════════════════════════════════╝');
  logger.info('');

  try {
    // 1. Setup
    const adapter = await setupAdapter();
    logger.info('');

    // 2-5. Ejemplos individuales
    await exampleWebhookVerification(adapter);
    await exampleParseIncomingMessage(adapter);
    await exampleSendText(adapter);
    await exampleSendButtons(adapter);

    // 6. Integración completa
    await exampleFullIntegration();

    logger.info('═══════════════════════════════════════════════════════════');
    logger.info('✅ TODOS LOS EJEMPLOS COMPLETADOS');
    logger.info('═══════════════════════════════════════════════════════════');
    logger.info('');
    logger.info('Próximos pasos:');
    logger.info('  1. Configura META_* en tu .env');
    logger.info('  2. Integra MetaAdapter en tu Bootstrap.ts');
    logger.info('  3. Registra tu webhook en Meta Dashboard');
    logger.info('  4. Prueba con mensajes reales');
    logger.info('');
  } catch (error) {
    logger.error({ error }, '❌ Error durante ejemplos');
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  runAllExamples().catch(console.error);
}

export {
  setupAdapter,
  exampleWebhookVerification,
  exampleParseIncomingMessage,
  exampleSendText,
  exampleSendButtons,
  exampleFullIntegration,
};

