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
import { compileWizard } from '@/domain/studio/wizard';
import { STUDIO_MOLDS } from '@/domain/studio/molds';
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
    getDraftMeta: jest.fn().mockResolvedValue({ draftUpdatedAt: '2026-09-11T10:00:00.000Z' }),
    saveDraft: jest.fn().mockResolvedValue({ conflict: false, draftUpdatedAt: '2026-09-11T10:05:00.000Z' }),
    ...repo,
  } as unknown as BotFlowRepository;
  const audit = { log: jest.fn() };
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
  router.use(createStudioRouter({ botFlowRepository, simulateConversation: useCase, testCases: { list: async () => [] } as never, audit: audit as never, logger: silentLogger }));
  app.use('/api/admin', router);

  const cookieFor = (role: 'super_admin' | 'admin_operator', tenantId: string | null) =>
    `${COOKIE}=${jwt.sign({ sub: 'admin-1', email: 'a@x.test', role, tenantId }).token}`;
  return { app, botFlowRepository, audit, cookieFor };
}

describe('asistente del Studio', () => {
  const wizardUrl = (tenant = HARNESS_TENANT_ID) => `/api/admin/tenants/${tenant}/studio/flows/${FLOW_ID}/wizard`;
  const spec = () => structuredClone(STUDIO_MOLDS[0].spec);

  it('GET /studio/molds trae el molde de cerrajería con su especificación y textos sugeridos', async () => {
    const { app, cookieFor } = buildApp();

    const res = await request(app).get('/api/admin/studio/molds').set('Cookie', cookieFor('admin_operator', HARNESS_TENANT_ID));

    expect(res.status).toBe(200);
    expect(res.body.molds[0]).toMatchObject({
      id: 'cerrajeria',
      spec: { version: 1 },
      textosSugeridos: { mensaje_bienvenida: expect.any(String) },
    });
    expect(res.body.escapeDefaults).toMatchObject({ humanWords: expect.arrayContaining(['asesor']), optOutWords: expect.arrayContaining(['baja']) });
  });

  it('preview compila y valida sin guardar nada', async () => {
    const { app, botFlowRepository, cookieFor } = buildApp();

    const res = await request(app)
      .post(`/api/admin/tenants/${HARNESS_TENANT_ID}/studio/wizard/preview`)
      .set('Cookie', cookieFor('admin_operator', HARNESS_TENANT_ID))
      .send({ spec: spec() });

    expect(res.status).toBe(200);
    expect(res.body.flow.start_node_id).toBe('bienvenida');
    expect(res.body.report).toMatchObject({ ok: true, schema: { ok: true } });
    expect(botFlowRepository.saveDraft).not.toHaveBeenCalled();
  });

  it('preview con una especificación inválida: 400 con lo que está mal', async () => {
    const { app, cookieFor } = buildApp();
    const bad = spec();
    bad.options[0].id = 'Con Mayúsculas';

    const res = await request(app)
      .post(`/api/admin/tenants/${HARNESS_TENANT_ID}/studio/wizard/preview`)
      .set('Cookie', cookieFor('super_admin', null))
      .send({ spec: bad });

    expect(res.status).toBe(400);
    expect(res.body.issues[0]).toMatchObject({ path: 'options.0.id' });
  });

  it('GET wizard: un molde JSON no trae especificación y lo dice', async () => {
    const { app, cookieFor } = buildApp();

    const res = await request(app).get(wizardUrl()).set('Cookie', cookieFor('super_admin', null));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ spec: null, reason: 'no_spec', source: 'draft', draftUpdatedAt: '2026-09-11T10:00:00.000Z' });
  });

  it('GET wizard: un flow generado por el asistente devuelve su especificación', async () => {
    const { app, cookieFor } = buildApp({
      getEditableFlow: jest.fn().mockResolvedValue({ flow: compileWizard(spec()), source: 'published' }),
    });

    const res = await request(app).get(wizardUrl()).set('Cookie', cookieFor('super_admin', null));

    expect(res.body.spec).toEqual(spec());
    expect(res.body.source).toBe('published');
  });

  it('PUT wizard guarda el flow compilado como borrador, con auditoría', async () => {
    const { app, botFlowRepository, audit, cookieFor } = buildApp();

    const res = await request(app)
      .put(wizardUrl())
      .set('Cookie', cookieFor('super_admin', null))
      .send({ spec: spec(), expectedDraftUpdatedAt: '2026-09-11T10:00:00.000Z' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ draftUpdatedAt: '2026-09-11T10:05:00.000Z', report: { ok: true } });
    expect(botFlowRepository.saveDraft).toHaveBeenCalledWith({
      flowId: FLOW_ID,
      tenantId: HARNESS_TENANT_ID,
      flow: compileWizard(spec()),
      expectedDraftUpdatedAt: '2026-09-11T10:00:00.000Z',
    });
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({
      action: 'flow.draft.save',
      targetId: FLOW_ID,
      metadata: expect.objectContaining({ via: 'studio_wizard' }),
    }));
  });

  it('PUT wizard: cambiar la estructura es de super_admin', async () => {
    const { app, cookieFor } = buildApp();

    const res = await request(app)
      .put(wizardUrl())
      .set('Cookie', cookieFor('admin_operator', HARNESS_TENANT_ID))
      .send({ spec: spec() });

    expect(res.status).toBe(403);
  });

  it('PUT wizard: si el borrador cambió desde que se cargó, 409', async () => {
    const { app, cookieFor } = buildApp({ saveDraft: jest.fn().mockResolvedValue({ conflict: true }) });

    const res = await request(app).put(wizardUrl()).set('Cookie', cookieFor('super_admin', null)).send({ spec: spec() });

    expect(res.status).toBe(409);
  });
});

describe('POST .../studio/flows/:flowId/validate', () => {
  const validateUrl = (tenant = HARNESS_TENANT_ID) => `/api/admin/tenants/${tenant}/studio/flows/${FLOW_ID}/validate`;

  it('un molde en buen estado: sin errores y publicable', async () => {
    const { app, cookieFor } = buildApp();

    const res = await request(app).post(validateUrl()).set('Cookie', cookieFor('super_admin', null)).send({});

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      source: 'draft',
      flowId: FLOW_ID,
      report: { ok: true, summary: { errors: 0 }, schema: { ok: true } },
    });
  });

  it('un borrador que el schema rechaza igual se revisa: devuelve el reporte, no un 400', async () => {
    const { app, cookieFor } = buildApp({
      getEditableFlow: jest.fn().mockResolvedValue({
        flow: {
          version: '1.0',
          start_node_id: 'hola',
          nodes: [{ id: 'hola', type: 'send_text', content: { text: 'Hola {{misterio}}' }, transitions: [] }],
        },
        source: 'draft',
      }),
    });

    const res = await request(app).post(validateUrl()).set('Cookie', cookieFor('super_admin', null)).send({});

    expect(res.status).toBe(200);
    expect(res.body.report.ok).toBe(false);
    expect(res.body.report.schema.ok).toBe(false);
    const codes = res.body.report.issues.map((i: { code: string }) => i.code);
    expect(codes).toEqual(expect.arrayContaining(['V-EST-01', 'V-EST-05', 'V-EST-08', 'V-CUMP-01']));
  });

  it('un admin_operator no puede validar flows de otro tenant', async () => {
    const { app, cookieFor } = buildApp();

    const res = await request(app)
      .post(validateUrl(OTHER_TENANT))
      .set('Cookie', cookieFor('admin_operator', HARNESS_TENANT_ID))
      .send({});

    expect(res.status).toBe(403);
  });
});

describe('GET /api/admin/studio/limits', () => {
  it('devuelve los límites verificados de WhatsApp, con su fuente', async () => {
    const { app, cookieFor } = buildApp();

    const res = await request(app).get('/api/admin/studio/limits').set('Cookie', cookieFor('admin_operator', HARNESS_TENANT_ID));

    expect(res.status).toBe(200);
    expect(res.body.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(res.body.limits.replyButtons).toMatchObject({ buttonsMax: 3, buttonTitleMax: 20 });
    expect(res.body.limits.mediaCarousel.doc).toMatch(/^https:\/\/developers\.facebook\.com\//);
  });

  it('sin sesión no responde', async () => {
    const { app } = buildApp();

    expect((await request(app).get('/api/admin/studio/limits')).status).toBe(401);
  });
});

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

  it("source 'version' simula una versión del historial", async () => {
    const getVersionFlow = jest.fn().mockResolvedValue(loadMold('securitech'));
    const { app, cookieFor } = buildApp({ getVersionFlow });

    const res = await request(app)
      .post(url())
      .set('Cookie', cookieFor('super_admin', null))
      .send({ source: 'version', versionId: 'ver-3', events: [{ type: 'text', text: 'hola' }] });

    expect(res.status).toBe(200);
    expect(getVersionFlow).toHaveBeenCalledWith('ver-3', HARNESS_TENANT_ID);
    expect(res.body.turns[0].why[2]).toBe('Conversación nueva: empieza en «saludo».');
  });

  it("source 'version' sin versionId → 400; versión inexistente → 404", async () => {
    const { app, cookieFor } = buildApp({ getVersionFlow: jest.fn().mockResolvedValue(null) });
    const cookie = cookieFor('super_admin', null);
    const events = [{ type: 'text', text: 'hola' }];

    expect((await request(app).post(url()).set('Cookie', cookie).send({ source: 'version', events })).status).toBe(400);
    expect(
      (await request(app).post(url()).set('Cookie', cookie).send({ source: 'version', versionId: 'x', events })).status,
    ).toBe(404);
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
