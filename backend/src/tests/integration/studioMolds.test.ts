/**
 * El molde de cerrajería del asistente responde igual que el molde JSON de
 * siempre (backend/scripts/cerrajeria-flow.json) en la conversación grabada:
 * mismos payloads de WhatsApp, en el mismo orden. Es la prueba de que el
 * asistente puede reproducir el bot de producción sin tocar JSON.
 */
import { BusinessHoursService } from '@/domain/services/BusinessHoursService';
import { SimulateConversationUseCase } from '@/domain/use-cases/SimulateConversationUseCase';
import type { BotFlow } from '@/domain/entities/flow';
import { compileWizard } from '@/domain/studio/wizard';
import { STUDIO_MOLDS } from '@/domain/studio/molds';
import { buildMetaPayload } from '@/infrastructure/adapters/meta/metaPayloads';
import { eventToStep } from '@/infrastructure/server/admin/studioSimulation';
import {
  HARNESS_CUSTOMER_PHONE,
  HARNESS_TENANT_ID,
  loadConversation,
  loadMold,
  makeInterpreter,
  makeTenantConfig,
  makeTenantConfigPort,
  silentLogger,
} from '../utils/conversationHarness';

async function payloads(flow: BotFlow, conversation = loadConversation('cerrajeria')) {
  const useCase = new SimulateConversationUseCase(
    makeTenantConfigPort(makeTenantConfig(conversation.tenant)),
    makeInterpreter(),
    new BusinessHoursService(),
    48 * 60 * 60 * 1000,
    silentLogger,
  );
  const turns = await useCase.execute({
    tenantId: HARNESS_TENANT_ID,
    flow,
    from: HARNESS_CUSTOMER_PHONE,
    startAt: new Date(conversation.startAt),
    steps: conversation.events.map((e, i) => eventToStep(e, i, HARNESS_CUSTOMER_PHONE, silentLogger)),
  });
  return turns.flatMap((t) => t.outbound.map((m) => buildMetaPayload(m.to, m.content)));
}

describe('molde de cerrajería del asistente', () => {
  const wizardFlow = compileWizard(STUDIO_MOLDS.find((m) => m.id === 'cerrajeria')!.spec);

  it('en la conversación grabada manda exactamente lo mismo que el molde JSON', async () => {
    const fromJson = await payloads(loadMold('cerrajeria'));
    const fromWizard = await payloads(wizardFlow);

    expect(fromJson.length).toBeGreaterThan(5);
    expect(fromWizard).toEqual(fromJson);
  });

  it('también en el camino de información y en la escalera de "no te entendí"', async () => {
    const conversation = {
      ...loadConversation('cerrajeria'),
      events: [
        { type: 'text' as const, text: 'hola' },
        { type: 'text' as const, text: 'quiero precios' },
        { type: 'button_reply' as const, id: 'btn_2', title: 'Salir' },
        { type: 'text' as const, text: 'hola' },
        { type: 'text' as const, text: 'asdf' },
        { type: 'text' as const, text: 'qwerty' },
        { type: 'text' as const, text: 'zzz' },
      ],
    };

    expect(await payloads(wizardFlow, conversation)).toEqual(await payloads(loadMold('cerrajeria'), conversation));
  });

  it('y con las palabras de escape: menú, empezar de nuevo y persona (C-08)', async () => {
    const conversation = {
      ...loadConversation('cerrajeria'),
      events: [
        { type: 'text' as const, text: 'hola' },
        { type: 'text' as const, text: 'urgente' },
        { type: 'text' as const, text: 'Menú' },
        { type: 'text' as const, text: 'cita' },
        { type: 'text' as const, text: 'cancelar' },
        { type: 'text' as const, text: 'info' },
        { type: 'text' as const, text: '¡Asesor!' },
      ],
    };

    const fromJson = await payloads(loadMold('cerrajeria'), conversation);
    expect(fromJson.at(-2)).toMatchObject({ ok: true, payload: { text: { body: expect.stringContaining('te conecto con alguien') } } });
    expect(await payloads(wizardFlow, conversation)).toEqual(fromJson);
  });
});
