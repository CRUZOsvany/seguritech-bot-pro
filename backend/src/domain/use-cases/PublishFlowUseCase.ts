import type pino from 'pino';
import type { BotFlowRepository } from '@/domain/ports/BotFlowRepository';
import type { FlowTestCaseRepository, FlowTestRunnerPort } from '@/domain/ports/FlowTestCaseRepository';
import { validateFlow } from '@/domain/validators/flowSchema';
import { validateFlowDesign, type ValidationReport } from '@/domain/validation/flowDesignValidator';
import type { TestRunReport } from '@/domain/studio/testCases';

export type PublishOutcome =
  | { ok: true; versionNumber: number; report: ValidationReport; testReport: TestRunReport | null }
  /** No se publicó: el validador encontró errores o el schema lo rechaza. */
  | { ok: false; reason: 'validation'; report: ValidationReport }
  /** No se publicó: falló al menos una prueba guardada. */
  | { ok: false; reason: 'tests'; report: ValidationReport; testReport: TestRunReport }
  /** No hay borrador: lo editable es igual a lo publicado. */
  | { ok: false; reason: 'nothing_to_publish' }
  | { ok: false; reason: 'not_found' };

/**
 * Publicar es una compuerta, no un botón (Studio Fase 4, §11 de la
 * especificación). En orden:
 *
 *   1. validar el borrador con el validador de diseño y con el schema;
 *   2. correr todas las pruebas guardadas con el motor real;
 *   3. publicar en una transacción (publish_flow_version), guardando ambos
 *      reportes y rechazando si el borrador cambió mientras se revisaba.
 *
 * Con un solo error o una sola prueba fallida, no se publica nada.
 *
 * Invalidar la caché del bot no hace falta: el flow activo no se cachea
 * (findActiveByTenant lee la base en cada mensaje), así que la versión nueva
 * contesta desde el siguiente mensaje sin reiniciar nada.
 */
export class PublishFlowUseCase {
  constructor(
    private readonly flows: BotFlowRepository,
    private readonly tests: FlowTestCaseRepository,
    private readonly runner: FlowTestRunnerPort,
    private readonly logger: pino.Logger,
  ) {}

  async publish(params: {
    tenantId: string;
    flowId: string;
    createdBy: string | null;
    note?: string;
  }): Promise<PublishOutcome> {
    const { tenantId, flowId } = params;
    const [editable, meta] = await Promise.all([
      this.flows.getEditableFlow(flowId, tenantId),
      this.flows.getDraftMeta(flowId, tenantId),
    ]);
    if (!editable) return { ok: false, reason: 'not_found' };
    if (editable.source !== 'draft') return { ok: false, reason: 'nothing_to_publish' };

    const report = validateFlowDesign(editable.flow);
    if (!report.ok || !report.schema.ok) {
      this.logger.info({ tenantId, flowId, errors: report.summary.errors }, 'Publicación rechazada por el validador');
      return { ok: false, reason: 'validation', report };
    }
    const flow = validateFlow(editable.flow);

    const cases = await this.tests.list(tenantId, flowId);
    const testReport = await this.runner.run(tenantId, flow, cases);
    if (testReport.failed > 0) {
      this.logger.info({ tenantId, flowId, failed: testReport.failed }, 'Publicación rechazada por pruebas');
      return { ok: false, reason: 'tests', report, testReport };
    }

    const { versionNumber } = await this.flows.publishVersion({
      flowId,
      tenantId,
      flow,
      createdBy: params.createdBy,
      note: params.note,
      validationReport: report,
      testReport,
      clearDraft: true,
      expectedDraftUpdatedAt: meta?.draftUpdatedAt ?? null,
    });
    return { ok: true, versionNumber, report, testReport };
  }

  /**
   * Volver a una versión anterior: se publica su contenido como versión
   * nueva. Pasa por el validador (no se republica algo con errores), pero no
   * por las pruebas: las pruebas describen el comportamiento nuevo y una
   * versión vieja las fallaría por definición — justo cuando hace falta
   * volver atrás.
   */
  async rollback(params: {
    tenantId: string;
    flowId: string;
    versionNumber: number;
    createdBy: string | null;
  }): Promise<PublishOutcome> {
    const { tenantId, flowId, versionNumber } = params;
    const versions = await this.flows.listVersions(flowId, tenantId);
    const target = versions.find((v) => v.versionNumber === versionNumber);
    if (!target) return { ok: false, reason: 'not_found' };
    const stored = await this.flows.getVersionFlow(target.id, tenantId);
    if (!stored) return { ok: false, reason: 'not_found' };

    const report = validateFlowDesign(stored);
    if (!report.ok || !report.schema.ok) return { ok: false, reason: 'validation', report };

    const { versionNumber: newVersion } = await this.flows.publishVersion({
      flowId,
      tenantId,
      flow: validateFlow(stored),
      createdBy: params.createdBy,
      note: `rollback a v${versionNumber}`,
      validationReport: report,
      testReport: null,
      clearDraft: false,
    });
    return { ok: true, versionNumber: newVersion, report, testReport: null };
  }
}
