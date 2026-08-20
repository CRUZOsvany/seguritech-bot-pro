import pino from 'pino';
import { IntentRouterPort } from '@/domain/ports';
import { Message, User, TenantConfig } from '@/domain/entities';

type Intent = 'flow' | 'agent' | 'human';

const CLASSIFY_TOOL = {
  name: 'classify_intent',
  description:
    'Clasifica el mensaje del cliente de WhatsApp en una de tres rutas de atención.',
  input_schema: {
    type: 'object',
    properties: {
      intent: {
        type: 'string',
        enum: ['flow', 'agent', 'human'],
        description:
          "'flow' si el mensaje encaja en un menú/flujo de botones (saludo, " +
          'elegir una opción, responder algo puntual que el flow ya espera). ' +
          "'agent' si el cliente hace una pregunta libre sobre el negocio " +
          '(horarios, precios, disponibilidad, dudas) que un menú fijo no ' +
          "puede resolver. 'human' si pide explícitamente hablar con una " +
          'persona, o la situación es una queja/reclamo grave.',
      },
    },
    required: ['intent'],
  },
} as const;

const VALID_INTENTS: readonly Intent[] = ['flow', 'agent', 'human'];

/**
 * Implementación de IntentRouterPort con Claude Haiku (Fase 1.2 del plan
 * Secretaria Digital — .claude/SEGURITECH_AI_SECRETARIA_PLAN.md §3.2/§5).
 *
 * Deliberadamente NO usa el SDK oficial de Anthropic: el resto de adapters
 * de infraestructura de este proyecto (MetaWhatsAppAdapter) llaman a la API
 * externa directo con fetch, sin SDK — se sigue el mismo patrón acá para no
 * introducir una dependencia nueva solo para esto.
 *
 * Guardrails ejecutables (plan §4), NO solo comentarios:
 *  - Timeout corto obligatorio (2.5s default) vía AbortController.
 *  - classify() NUNCA lanza. Cualquier error de red, timeout, respuesta
 *    inesperada de la API, o ANTHROPIC_API_KEY ausente -> cae a 'flow'.
 *    Esto reproduce el comportamiento actual del bot (sin router), que es
 *    el default seguro exigido por el DoD de la Fase 1.4 (flag apagado =
 *    cero cambio de comportamiento).
 */
export class AnthropicIntentRouter implements IntentRouterPort {
  constructor(
    private readonly apiKey: string,
    private readonly logger: pino.Logger,
    private readonly model: string = 'claude-haiku-4-5-20251001',
    private readonly timeoutMs: number = 2500,
  ) {}

  async classify(input: {
    message: Message;
    user: User;
    tenantConfig: TenantConfig;
  }): Promise<Intent> {
    if (!this.apiKey) {
      this.logger.warn(
        { tenantId: input.message.tenantId },
        '[AnthropicIntentRouter] ANTHROPIC_API_KEY ausente — clasificando como flow',
      );
      return 'flow';
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 64,
          system: this.buildSystemPrompt(input.tenantConfig),
          messages: [{ role: 'user', content: input.message.content }],
          tools: [CLASSIFY_TOOL],
          tool_choice: { type: 'tool', name: 'classify_intent' },
        }),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        this.logger.warn(
          { tenantId: input.message.tenantId, status: response.status, body: body.slice(0, 300) },
          '[AnthropicIntentRouter] API respondió error — clasificando como flow',
        );
        return 'flow';
      }

      const data = (await response.json()) as {
        content?: Array<{ type: string; input?: unknown }>;
      };
      const toolUse = data.content?.find((block) => block.type === 'tool_use');
      const intent = (toolUse?.input as { intent?: string } | undefined)?.intent;

      if (intent && (VALID_INTENTS as string[]).includes(intent)) {
        return intent as Intent;
      }

      this.logger.warn(
        { tenantId: input.message.tenantId, intent },
        '[AnthropicIntentRouter] Respuesta sin tool_use válido — clasificando como flow',
      );
      return 'flow';
    } catch (err) {
      const aborted = err instanceof Error && err.name === 'AbortError';
      this.logger.warn(
        { err, tenantId: input.message.tenantId, timedOut: aborted },
        `[AnthropicIntentRouter] ${aborted ? 'Timeout' : 'Error'} clasificando — cae a flow`,
      );
      return 'flow';
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * `tenantConfig` (el contrato exacto del plan §3.2) no trae `giro` — ese
   * campo vive en TenantRepository/Tenant, no en TenantConfig. Se usa lo que
   * sí hay (nombreNegocio) para dar contexto de negocio sin inventar un
   * campo que el puerto no expone.
   */
  private buildSystemPrompt(tenantConfig: TenantConfig): string {
    return (
      'Eres el clasificador de intención de un bot de WhatsApp para el negocio ' +
      `"${tenantConfig.nombreNegocio}". Tu única salida es una llamada a la ` +
      'herramienta classify_intent. No respondas al cliente, no expliques nada, ' +
      'no inventes precios ni datos del negocio — solo clasifica.'
    );
  }
}
