/**
 * Bloque A1 — resolución de fuente del flow en SimulateMessageUseCase.
 *
 * Cubre la lógica nueva (source: active | draft | version) sin tocar la BD:
 * el BotFlowRepository y el FlowInterpreter se mockean (patrón jest.Mocked del
 * repo). La numeración de versiones / publish / rollback vive en SQL del
 * SupabaseBotFlowRepository y se cubre con integración aparte (requiere Supabase).
 */

import pino from 'pino';
import { SimulateMessageUseCase } from '@/domain/use-cases/SimulateMessageUseCase';
import {
  UserRepository,
  TenantConfigPort,
  BotFlowRepository,
} from '@/domain/ports';
import { FlowInterpreter } from '@/domain/services/FlowInterpreter';
import type { TenantConfig } from '@/domain/entities';
import type { BotFlow } from '@/domain/entities/flow';

const validFlow: BotFlow = {
  version: '1.0',
  start_node_id: 'end',
  nodes: [{ id: 'end', type: 'end', content: {}, transitions: [] }],
};

// Inválido: viola FlowSchema (sin nodos, sin end, version mal).
const invalidDraft = { version: '9.9', start_node_id: 'x', nodes: [] };

describe('SimulateMessageUseCase — selección de fuente (A1)', () => {
  const logger = pino({ level: 'silent' });

  let userRepository: jest.Mocked<UserRepository>;
  let tenantConfigPort: jest.Mocked<TenantConfigPort>;
  let botFlowRepository: jest.Mocked<BotFlowRepository>;
  let flowInterpreter: jest.Mocked<FlowInterpreter>;
  let useCase: SimulateMessageUseCase;

  beforeEach(() => {
    userRepository = {
      findByPhoneNumber: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      resetUserState: jest.fn(),
    } as unknown as jest.Mocked<UserRepository>;

    tenantConfigPort = {
      getConfig: jest.fn().mockResolvedValue({} as TenantConfig),
    } as unknown as jest.Mocked<TenantConfigPort>;

    botFlowRepository = {
      findActiveByTenant: jest.fn(),
      cloneFromTemplate: jest.fn(),
      upsert: jest.fn(),
      deactivateForTenant: jest.fn(),
      listTemplates: jest.fn(),
      listFlowsByTenant: jest.fn(),
      getDraft: jest.fn(),
      saveDraft: jest.fn(),
      publishDraft: jest.fn(),
      listVersions: jest.fn(),
      getVersionFlow: jest.fn(),
      rollback: jest.fn(),
    } as unknown as jest.Mocked<BotFlowRepository>;

    flowInterpreter = {
      execute: jest.fn().mockResolvedValue({
        outputs: [{ kind: 'text', text: 'hola' }],
        nextNodeId: 'end',
        contextUpdates: {},
        flowEnded: false,
      }),
    } as unknown as jest.Mocked<FlowInterpreter>;

    useCase = new SimulateMessageUseCase(
      userRepository,
      tenantConfigPort,
      botFlowRepository,
      flowInterpreter,
      logger,
    );
  });

  const base = { tenantId: 't1', phoneNumber: '521', content: 'hola', persist: false };

  it('default (sin source) usa el flow activo', async () => {
    botFlowRepository.findActiveByTenant.mockResolvedValue(validFlow);

    const r = await useCase.execute({ ...base });

    expect(r.error).toBeUndefined();
    expect(botFlowRepository.findActiveByTenant).toHaveBeenCalledWith('t1');
    expect(flowInterpreter.execute).toHaveBeenCalledTimes(1);
    expect(flowInterpreter.execute).toHaveBeenCalledWith(
      expect.objectContaining({ flow: validFlow }),
    );
  });

  it('source=active sin flow activo devuelve error', async () => {
    botFlowRepository.findActiveByTenant.mockResolvedValue(null);

    const r = await useCase.execute({ ...base, source: 'active' });

    expect(r.error).toMatch(/No hay bot_flow activo/);
    expect(flowInterpreter.execute).not.toHaveBeenCalled();
  });

  it('source=draft con draft válido simula el draft', async () => {
    botFlowRepository.getDraft.mockResolvedValue(validFlow);

    const r = await useCase.execute({ ...base, source: 'draft', flowId: 'f1' });

    expect(r.error).toBeUndefined();
    expect(botFlowRepository.getDraft).toHaveBeenCalledWith('f1', 't1');
    expect(botFlowRepository.findActiveByTenant).not.toHaveBeenCalled();
    expect(flowInterpreter.execute).toHaveBeenCalledWith(
      expect.objectContaining({ flow: validFlow }),
    );
  });

  it('source=draft con draft inválido devuelve error sin reventar', async () => {
    botFlowRepository.getDraft.mockResolvedValue(invalidDraft);

    const r = await useCase.execute({ ...base, source: 'draft', flowId: 'f1' });

    expect(r.error).toMatch(/^Draft inválido:/);
    expect(flowInterpreter.execute).not.toHaveBeenCalled();
  });

  it('source=draft sin flowId devuelve error', async () => {
    const r = await useCase.execute({ ...base, source: 'draft' });

    expect(r.error).toMatch(/requiere flowId/);
    expect(botFlowRepository.getDraft).not.toHaveBeenCalled();
    expect(flowInterpreter.execute).not.toHaveBeenCalled();
  });

  it('source=draft sin draft persistido devuelve error', async () => {
    botFlowRepository.getDraft.mockResolvedValue(null);

    const r = await useCase.execute({ ...base, source: 'draft', flowId: 'f1' });

    expect(r.error).toMatch(/no tiene draft/);
    expect(flowInterpreter.execute).not.toHaveBeenCalled();
  });

  it('source=version usa getVersionFlow', async () => {
    botFlowRepository.getVersionFlow.mockResolvedValue(validFlow);

    const r = await useCase.execute({ ...base, source: 'version', versionId: 'v-uuid' });

    expect(r.error).toBeUndefined();
    expect(botFlowRepository.getVersionFlow).toHaveBeenCalledWith('v-uuid', 't1');
    expect(flowInterpreter.execute).toHaveBeenCalledWith(
      expect.objectContaining({ flow: validFlow }),
    );
  });

  it('source=version sin versionId devuelve error', async () => {
    const r = await useCase.execute({ ...base, source: 'version' });

    expect(r.error).toMatch(/requiere versionId/);
    expect(flowInterpreter.execute).not.toHaveBeenCalled();
  });

  it('source=version inexistente devuelve error', async () => {
    botFlowRepository.getVersionFlow.mockResolvedValue(null);

    const r = await useCase.execute({ ...base, source: 'version', versionId: 'nope' });

    expect(r.error).toMatch(/no existe/);
    expect(flowInterpreter.execute).not.toHaveBeenCalled();
  });
});
