import type { BotFlow } from '@/domain/entities/flow';
import { DraftChangedError, type BotFlowRepository } from '@/domain/ports/BotFlowRepository';

/**
 * Un flow por tenant en memoria, con la semántica de bot_flows +
 * bot_flow_versions que importa para publicar: borrador con su
 * draft_updated_at, flow activo, historial de versiones con sus reportes y
 * rechazo si el borrador cambió mientras se revisaba (publish_flow_version).
 */
export class InMemoryBotFlowRepository implements BotFlowRepository {
  published: BotFlow | null;
  draft: unknown | null = null;
  draftUpdatedAt: string | null = null;
  readonly versions: Array<{ id: string; versionNumber: number; flow: BotFlow; note: string | null; validationReport: unknown; testReport: unknown }> = [];
  private tick = 0;

  constructor(readonly tenantId: string, readonly flowId: string, published: BotFlow | null) {
    this.published = published;
  }

  async findActiveByTenant(tenantId: string): Promise<BotFlow | null> {
    return tenantId === this.tenantId ? this.published : null;
  }

  async getEditableFlow(flowId: string, tenantId: string) {
    if (!this.owns(flowId, tenantId)) return null;
    if (this.draft !== null) return { flow: this.draft, source: 'draft' as const };
    return this.published ? { flow: this.published as unknown, source: 'published' as const } : null;
  }

  async getDraftMeta(flowId: string, tenantId: string) {
    return this.owns(flowId, tenantId) ? { draftUpdatedAt: this.draftUpdatedAt } : null;
  }

  async saveDraft(params: { flowId: string; tenantId: string; flow: unknown; expectedDraftUpdatedAt?: string | null }) {
    if (params.expectedDraftUpdatedAt !== undefined && params.expectedDraftUpdatedAt !== this.draftUpdatedAt) {
      return { conflict: true as const };
    }
    this.draft = params.flow;
    this.draftUpdatedAt = `2026-09-11T10:00:${String(++this.tick).padStart(2, '0')}.000Z`;
    return { conflict: false as const, draftUpdatedAt: this.draftUpdatedAt };
  }

  async publishVersion(params: Parameters<BotFlowRepository['publishVersion']>[0]) {
    if (params.expectedDraftUpdatedAt !== undefined && params.expectedDraftUpdatedAt !== this.draftUpdatedAt) {
      throw new DraftChangedError();
    }
    const versionNumber = this.versions.length + 1;
    this.versions.push({
      id: `ver-${versionNumber}`,
      versionNumber,
      flow: params.flow,
      note: params.note ?? null,
      validationReport: params.validationReport,
      testReport: params.testReport,
    });
    this.published = params.flow;
    if (params.clearDraft) {
      this.draft = null;
      this.draftUpdatedAt = null;
    }
    return { versionNumber };
  }

  async listVersions(flowId: string, tenantId: string) {
    if (!this.owns(flowId, tenantId)) return [];
    return [...this.versions].reverse().map((v) => ({
      id: v.id,
      versionNumber: v.versionNumber,
      createdAt: '2026-09-11T10:00:00.000Z',
      createdBy: null,
      note: v.note,
    }));
  }

  async getVersionFlow(versionId: string, tenantId: string) {
    if (tenantId !== this.tenantId) return null;
    return this.versions.find((v) => v.id === versionId)?.flow ?? null;
  }

  async listFlowsByTenant(tenantId: string) {
    return tenantId === this.tenantId
      ? [{ id: this.flowId, channel: 'whatsapp' as const, nombre: 'Flujo', isActive: true, hasDraft: this.draft !== null, updatedAt: '' }]
      : [];
  }

  // No se usan en estos tests.
  cloneFromTemplate(): Promise<BotFlow> { throw new Error('no implementado'); }
  upsert(): Promise<{ id: string }> { throw new Error('no implementado'); }
  deactivateForTenant(): Promise<void> { throw new Error('no implementado'); }
  listTemplates(): Promise<never[]> { throw new Error('no implementado'); }
  publishDraft(): Promise<{ versionNumber: number }> { throw new Error('usa publishVersion'); }
  rollback(): Promise<{ versionNumber: number }> { throw new Error('usa PublishFlowUseCase.rollback'); }

  private owns(flowId: string, tenantId: string) {
    return flowId === this.flowId && tenantId === this.tenantId;
  }
}
