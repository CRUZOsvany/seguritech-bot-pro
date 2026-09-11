/**
 * POST /api/admin/tenants/:id/studio/flows/:flowId/simulate (Fase 1 del
 * Studio), montado detrás del middleware de auth real: tenant scope,
 * validación del cuerpo, resolución del flow y forma de la respuesta.
 */
import express, { Express } from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { JwtService } from '@/infrastructure/auth/JwtService';
import { createAuthMiddleware } from '@/infrastructure/auth/AuthMiddleware';
import { createStudioRouter } from '@/infrastructure/server/admin/studioRouter';
import type { AdminSessionsRepository } from '@/domain/ports/AdminSessionsRepository';
import type { BotFlowRepository } from '@/domain/ports/BotFlowRepository';
import { BusinessHoursService } from '@/domain/services/BusinessHoursService';
import { SimulateConversationUseCase } from '@/domain/use-cases/SimulateConversationUseCase';
import {
  HARNESS_OWNER_PHONE,
  HARNESS_TENANT_ID,
  loadMold,
  makeInterpreter,
  makeTenantConfig,
  makeTenantConfigPort,
  silentLogger,
} from '../utils/conversationHarness';

const SECRET = 'c'.repeat(64);
const COOKIE = 'admin_session_test';
const OTHER_TENANT = '00000000-0000-4000-8000-0000000000bb';
const FLOW_ID = 'flow-1';
const url = (tenant = HARNESS_TENANT_ID, flow = FLOW_ID) =>
  `/api/admin/tenants/${tenant}/studio/flows/${flow}/simulate`;

function buildApp(repo: Partial<BotFlowRepository> = {}) {
  const jwt = new JwtService(SECRET, 3600);
  const requireAdmin = createAuthMiddleware({
    jwt,
    sessions: {
      isRevoked: jest.fn().mockResolvedValue(false),
      revoke: jest.fn(),
    } as unknown as AdminSessionsRepository,
    cookieName: COOKIE,
    apiKey: '',
    cloudflareAllowedDomain: '',
    logger: silentLogger,
  });
  const botFlowRepository = {
    getEditableFlow: jest.fn().mockResolvedValue({ flow: loadMold('cerrajeria'), source: 'draft' }),
    listFlowsByTenant: jest.fn().mockResolvedValue([]),
    findActiveByTenant: jest.fn().mockResolvedValue(null),
    ...repo,
  } as unknown as BotFlowRepository;
  const useCase = new SimulateConversationUseCase(
    makeTenantConfigPort(makeTenantConfig()),
    makeInterpreter(),
    new BusinessHoursService(),
    48 * 60 * 60 * 1000,
    silentLogger,
  );

  const app: Express = express();
  app.use(express.json());
  app.use(cookieParser());
  const router = express.Router();
  router.use(requireAdmin);
  router.use(createStudioRouter({ botFlowRepository, simulateConversation: useCase, logger: silentLogger }));
  app.use('/api/admin', router);

  const cookieFor = (role: 'super_admin' | 'admin_operator', tenantId: string | null) =>
    `${COOKIE}=${jwt.sign({ sub: 'admin-1', email: 'a@x.test', role, tenantId }).token}`;
  return { app, botFlowRepository, cookieFor };
}

describe('POST .../studio/flows/:flowId/simulate', () => {
  it('un admin_operator no puede simular flows de otro tenant', async () => {
    const { app, cookieFor } = buildApp();

    const res = await request(app)
      .post(url(OTHER_TENANT))
      .set('Cookie', cookieFor('admin_operator', HARNESS_TENANT_ID))
      .send({ events: [{ type: 'text', text: 'hola' }] });

    expect(res.status).toBe(403);
  });

  it('un admin_operator sí simula su propio tenant', async () => {
    const { app, cookieFor } = buildApp();

    const res = await request(app)
      .post(url())
      .set('Cookie', cookieFor('admin_operator', HARNESS_TENANT_ID))
      .send({ events: [{ type: 'text', text: 'hola' }] });

    expect(res.status).toBe(200);
  });

  it('rechaza eventos inválidos con el campo que falló', async () => {
    const { app, cookieFor } = buildApp();

    const res = await request(app)
      .post(url())
      .set('Cookie', cookieFor('super_admin', null))
      .send({ events: [{ type: 'button_reply', id: 'btn_0', title: 'x'.repeat(21) }] });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/^events\.0\.title/);
  });

  it('un borrador que no pasa el schema devuelve 400 con los issues, sin simular', async () => {
    const { app, cookieFor } = buildApp({
      getEditableFlow: jest.fn().mockResolvedValue({
        flow: { version: '1.0', start_node_id: 'x', nodes: [] },
        source: 'draft',
      }),
    });

    const res = await request(app)
      .post(url())
      .set('Cookie', cookieFor('super_admin', null))
      .send({ events: [{ type: 'text', text: 'hola' }] });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/borrador no es válido/);
    expect(Array.isArray(res.body.issues)).toBe(true);
  });

  it('flow inexistente → 404', async () => {
    const { app, cookieFor } = buildApp({ getEditableFlow: jest.fn().mockResolvedValue(null) });

    const res = await request(app)
      .post(url())
      .set('Cookie', cookieFor('super_admin', null))
      .send({ events: [{ type: 'text', text: 'hola' }] });

    expect(res.status).toBe(404);
  });

  it("source 'active' con un flow que no es el activo → 409", async () => {
    const { app, cookieFor } = buildApp({
      listFlowsByTenant: jest.fn().mockResolvedValue([{ id: FLOW_ID, isActive: false }]),
    });

    const res = await request(app)
      .post(url())
      .set('Cookie', cookieFor('super_admin', null))
      .send({ source: 'active', events: [{ type: 'text', text: 'hola' }] });

    expect(res.status).toBe(409);
  });

  it("source 'active' simula el flow que el bot real está usando", async () => {
    const findActiveByTenant = jest.fn().mockResolvedValue(loadMold('securitech'));
    const { app, cookieFor, botFlowRepository } = buildApp({
      listFlowsByTenant: jest.fn().mockResolvedValue([{ id: FLOW_ID, isActive: true }]),
      findActiveByTenant,
    });

    const res = await request(app)
      .post(url())
      .set('Cookie', cookieFor('super_admin', null))
      .send({ source: 'active', events: [{ type: 'text', text: 'hola' }] });

    expect(res.status).toBe(200);
    expect(findActiveByTenant).toHaveBeenCalledWith(HARNESS_TENANT_ID);
    expect(botFlowRepository.getEditableFlow).not.toHaveBeenCalled();
    expect(res.body.turns[0].trace).toContainEqual(
      expect.objectContaining({ kind: 'session_start', startNodeId: 'saludo' }),
    );
  });

  it('responde un turno por evento con el JSON exacto de la Cloud API, la traza y el estado', async () => {
    const { app, cookieFor } = buildApp();

    const res = await request(app)
      .post(url())
      .set('Cookie', cookieFor('super_admin', null))
      .send({
        startAt: '2026-09-10T10:00:00-06:00',
        events: [
          { type: 'text', text: 'hola' },
          { type: 'button_reply', id: 'btn_0', title: '🚨 Emergencia' },
          { type: 'advance_time', minutes: 5 },
          { type: 'media', mediaType: 'sticker' },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ source: 'draft', flowId: FLOW_ID, from: '5210000000000' });
    const [hola, emergencia, reloj, sticker] = res.body.turns;
    expect(hola.outbound[0]).toMatchObject({
      to: '5210000000000',
      audience: 'customer',
      payload: {
        messaging_product: 'whatsapp',
        // Sin el 1 legacy de México: es lo que el adaptador real manda (#131030).
        to: '520000000000',
        type: 'interactive',
        interactive: { type: 'button' },
      },
    });
    // El toque pasó por el parser real: btn_0 es sintético, así que al motor
    // le llegó el título y ganó la transición `button`.
    expect(emergencia.trace).toContainEqual(expect.objectContaining({ kind: 'input', content: '🚨 Emergencia' }));
    expect(emergencia.outbound[0].payload.interactive.type).toBe('list');
    expect(emergencia.session.currentNodeId).toBe('menu_emergencia');
    expect(reloj.trace[0]).toMatchObject({ kind: 'clock_advanced', minutes: 5 });
    expect(sticker.outbound).toEqual([]);
    expect(sticker.trace[0]).toMatchObject({ kind: 'input_ignored', detail: 'mensaje de tipo sticker' });
  });

  it('con `from` del dueño aplican sus reglas: #listo responde al dueño', async () => {
    const { app, cookieFor } = buildApp();

    const res = await request(app)
      .post(url())
      .set('Cookie', cookieFor('super_admin', null))
      .send({ from: HARNESS_OWNER_PHONE, events: [{ type: 'text', text: '#listo' }] });

    expect(res.status).toBe(200);
    const [turn] = res.body.turns;
    expect(turn.trace).toContainEqual({ kind: 'gate', gate: 'owner_command', detail: '#listo' });
    expect(turn.outbound[0]).toMatchObject({
      audience: 'owner',
      payload: { text: { body: 'No hay conversaciones pausadas ahora mismo.' } },
    });
  });
});
