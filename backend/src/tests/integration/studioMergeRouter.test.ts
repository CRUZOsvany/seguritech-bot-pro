/**
 * Endpoints puros del Studio para el Designer (Fase 5): validar el lienzo sin
 * guardar y fusionar un texto con el mensaje que le sigue. No escriben nada.
 */
import express from 'express';
import request from 'supertest';
import { createStudioRouter } from '@/infrastructure/server/admin/studioRouter';
import { HARNESS_TENANT_ID, loadMold, silentLogger } from '../utils/conversationHarness';

const T = HARNESS_TENANT_ID;
const OTHER = '00000000-0000-0000-0000-0000000000bb';

function buildApp(role: 'super_admin' | 'admin_operator' = 'super_admin') {
  const audit = { log: jest.fn() };
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use((req, _res, next) => {
    req.admin = { sub: 'admin-1', email: 'a@x.test', role, tenantId: role === 'super_admin' ? null : T } as never;
    next();
  });
  app.use(
    createStudioRouter({
      botFlowRepository: {} as never,
      simulateConversation: {} as never,
      testCases: { list: async () => [] } as never,
      audit: audit as never,
      logger: silentLogger,
    }),
  );
  return { app, audit };
}

describe('POST /tenants/:id/studio/validate', () => {
  it('valida el flow que manda el panel, con los mensajes por turno', async () => {
    const { app } = buildApp('admin_operator');

    const res = await request(app).post(`/tenants/${T}/studio/validate`).send({ flow: loadMold('securitech') });

    expect(res.status).toBe(200);
    expect(res.body.report.issues).toContainEqual(expect.objectContaining({ code: 'V-COSTO-01', fix: { kind: 'merge_next', nodeId: 'saludo' } }));
    expect(res.body.report.turns).toContainEqual({ entry: 'saludo', messages: 2, path: ['saludo', 'menu_principal'] });
  });

  it('sin flow: 400; de otro tenant: 403', async () => {
    const { app } = buildApp('admin_operator');

    expect((await request(app).post(`/tenants/${T}/studio/validate`).send({})).status).toBe(400);
    expect((await request(app).post(`/tenants/${OTHER}/studio/validate`).send({ flow: {} })).status).toBe(403);
  });
});

describe('POST /tenants/:id/studio/merge', () => {
  it('devuelve el flow fusionado y su reporte, sin guardar ni auditar nada', async () => {
    const { app, audit } = buildApp();

    const res = await request(app).post(`/tenants/${T}/studio/merge`).send({ flow: loadMold('securitech'), nodeId: 'saludo' });

    expect(res.status).toBe(200);
    expect(res.body.flow.nodes.find((n: { id: string }) => n.id === 'saludo')).toMatchObject({ type: 'send_buttons' });
    expect(res.body.removed).toBeNull();
    expect(res.body.report.turns).toContainEqual({ entry: 'saludo', messages: 1, path: ['saludo'] });
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('lo que no se puede fusionar: 400 con el motivo', async () => {
    const { app } = buildApp();

    const res = await request(app).post(`/tenants/${T}/studio/merge`).send({ flow: loadMold('securitech'), nodeId: 'menu_principal' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('No se puede fusionar: «menu_principal» no es un texto suelto.');
  });

  it('un flow mal formado: 400', async () => {
    const { app } = buildApp();

    expect((await request(app).post(`/tenants/${T}/studio/merge`).send({ flow: { nodes: 'x' }, nodeId: 'a' })).status).toBe(400);
    expect((await request(app).post(`/tenants/${T}/studio/merge`).send({ flow: { nodes: [{ id: 'a' }] }, nodeId: 'a' })).status).toBe(400);
  });
});
