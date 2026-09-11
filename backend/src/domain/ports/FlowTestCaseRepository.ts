import type { BotFlow } from '@/domain/entities/flow';
import type { FlowTestCase, TestExpectation, TestOptions, TestRunReport } from '@/domain/studio/testCases';

/**
 * Casos de prueba de un flow (flow_test_cases, migración 023). tenantId
 * siempre primero: un caso de otro tenant no existe para este.
 */
export interface FlowTestCaseRepository {
  list(tenantId: string, flowId: string): Promise<FlowTestCase[]>;
  create(
    tenantId: string,
    input: { flowId: string; name: string; events: unknown[]; expect: TestExpectation; options: TestOptions; createdBy: string | null },
  ): Promise<FlowTestCase>;
  update(
    tenantId: string,
    id: string,
    patch: Partial<{ name: string; events: unknown[]; expect: TestExpectation; options: TestOptions }>,
  ): Promise<FlowTestCase | null>;
  delete(tenantId: string, id: string): Promise<boolean>;
}

/** La tabla flow_test_cases no existe: falta aplicar la migración 023. */
export class TestCasesUnavailableError extends Error {
  constructor() {
    super('Los casos de prueba no están disponibles: falta aplicar la migración 023 en la base.');
    this.name = 'TestCasesUnavailableError';
  }
}

/**
 * Corre los casos de prueba contra un flow con el motor real. Vive en
 * infraestructura porque traduce los eventos con el parser de Meta.
 */
export interface FlowTestRunnerPort {
  run(tenantId: string, flow: BotFlow, cases: FlowTestCase[]): Promise<TestRunReport>;
}
