/**
 * backend/scripts/studio/simular.mjs contra el endpoint real del Studio,
 * levantado en un puerto temporal. Se salta el login con SEGURITECH_COOKIE
 * (el middleware de prueba autentica a cualquiera), así que lo que se prueba
 * es que el script llama bien al endpoint y que imprime la conversación y su
 * "Por qué".
 */
import { execFile } from 'child_process';
import { promisify } from 'util';
import { join } from 'path';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import express from 'express';
import type { BotFlowRepository } from '@/domain/ports/BotFlowRepository';
import { BusinessHoursService } from '@/domain/services/BusinessHoursService';
import { SimulateConversationUseCase } from '@/domain/use-cases/SimulateConversationUseCase';
import { createStudioRouter } from '@/infrastructure/server/admin/studioRouter';
import {
  HARNESS_TENANT_ID,
  loadMold,
  makeInterpreter,
  makeTenantConfig,
  makeTenantConfigPort,
  silentLogger,
} from '../utils/conversationHarness';

const run = promisify(execFile);
const SCRIPT = join(__dirname, '../../../scripts/studio/simular.mjs');

let server: Server;
let base: string;

beforeAll(async () => {
  const useCase = new SimulateConversationUseCase(
    makeTenantConfigPort(makeTenantConfig()),
    makeInterpreter(),
    new BusinessHoursService(),
    48 * 60 * 60 * 1000,
    silentLogger,
  );
  const repo = {
    getEditableFlow: async () => ({ flow: loadMold('cerrajeria'), source: 'draft' as const }),
  } as unknown as BotFlowRepository;

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.admin = { sub: 'a', email: 'a@x.test', role: 'super_admin', tenantId: null } as never;
    next();
  });
  const router = express.Router();
  router.use(createStudioRouter({ botFlowRepository: repo, simulateConversation: useCase, logger: silentLogger }));
  app.use('/api/admin', router);

  server = await new Promise<Server>((ok) => {
    const s = app.listen(0, '127.0.0.1', () => ok(s));
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((ok) => server.close(() => ok())));

it('imprime la conversación de ejemplo con lo que manda el bot y su por qué', async () => {
  const { stdout } = await run(
    process.execPath,
    [
      SCRIPT,
      '--tenant', HARNESS_TENANT_ID,
      '--flow', 'flow-1',
      '--url', base,
      '--conversacion', join(__dirname, '../../../scripts/studio/ejemplo-cerrajeria.json'),
    ],
    { env: { ...process.env, SEGURITECH_COOKIE: 'seguritech_session=prueba' } },
  );

  expect(stdout).toContain('👤 Cliente: hola');
  expect(stdout).toContain('🤖 Bot:');
  expect(stdout).toContain('[ 🚨 Emergencia ] [ 📅 Agendar servicio ] [ ℹ️ Información ]');
  expect(stdout).toContain('🔔 Al dueño:');
  expect(stdout).toContain('Por qué:');
  expect(stdout).toContain('Conversación nueva: empieza en «bienvenida».');
  expect(stdout).toContain('(el bot no manda nada)');
  expect(stdout).toContain('⏩ Pasan 2900 min');
  expect(stdout).toMatch(/Mensajes enviados en la conversación: \d+/);
}, 30_000);

it('con --json devuelve la respuesta cruda del endpoint', async () => {
  const { stdout } = await run(
    process.execPath,
    [SCRIPT, '--tenant', HARNESS_TENANT_ID, '--flow', 'flow-1', '--url', base, '--json'],
    { env: { ...process.env, SEGURITECH_COOKIE: 'seguritech_session=prueba' } },
  );

  const body = JSON.parse(stdout);
  expect(body.turns.length).toBeGreaterThan(0);
  expect(body.turns[0].why.length).toBeGreaterThan(0);
}, 30_000);
