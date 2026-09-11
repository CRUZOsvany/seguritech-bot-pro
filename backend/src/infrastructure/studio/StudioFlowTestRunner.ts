import type pino from 'pino';
import { z } from 'zod';
import type { BotFlow } from '@/domain/entities/flow';
import type { FlowTestRunnerPort } from '@/domain/ports/FlowTestCaseRepository';
import type { SimulateConversationUseCase } from '@/domain/use-cases/SimulateConversationUseCase';
import {
  DEFAULT_TEST_START,
  evaluateTest,
  outboundTexts,
  type FlowTestCase,
  type TestResult,
  type TestRunReport,
} from '@/domain/studio/testCases';
import { DEFAULT_SIM_PHONE, SimEventSchema, eventToStep } from '@/infrastructure/server/admin/studioSimulation';

/**
 * Corre los casos de prueba del Studio con el motor real (Fase 4): cada
 * evento pasa por el parser de Meta y la conversación corre en
 * SimulateConversationUseCase, sin efectos externos. Una prueba pasa si su
 * resultado cumple todas sus expectativas.
 */
export class StudioFlowTestRunner implements FlowTestRunnerPort {
  constructor(
    private readonly simulate: SimulateConversationUseCase,
    private readonly logger: pino.Logger,
  ) {}

  async run(tenantId: string, flow: BotFlow, cases: FlowTestCase[]): Promise<TestRunReport> {
    const results: TestResult[] = [];
    for (const c of cases) results.push(await this.runOne(tenantId, flow, c));
    const passed = results.filter((r) => r.passed).length;
    return { total: results.length, passed, failed: results.length - passed, results };
  }

  private async runOne(tenantId: string, flow: BotFlow, c: FlowTestCase): Promise<TestResult> {
    const events = z.array(SimEventSchema).safeParse(c.events);
    if (!events.success) {
      return { id: c.id, name: c.name, passed: false, failures: ['Los eventos guardados de la prueba no son válidos.'] };
    }
    const from = c.options.from ?? DEFAULT_SIM_PHONE;
    const turns = await this.simulate.execute({
      tenantId,
      flow,
      from,
      startAt: new Date(c.options.startAt ?? DEFAULT_TEST_START),
      steps: events.data.map((e, i) => eventToStep(e, i, from, this.logger)),
    });
    const last = turns.at(-1);
    const customer = turns.flatMap((t) => t.outbound.filter((o) => o.audience === 'customer'));
    const failures = evaluateTest(c.expect, {
      finalNode: last?.session?.currentNodeId ?? null,
      context: last?.session?.context ?? {},
      texts: customer.flatMap((o) => outboundTexts(o.content)),
      messages: customer.length,
    });
    return { id: c.id, name: c.name, passed: failures.length === 0, failures };
  }
}
