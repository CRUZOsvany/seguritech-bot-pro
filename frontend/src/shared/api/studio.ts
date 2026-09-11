import { apiFetch } from './client';

/**
 * Cliente del simulador del Studio:
 * POST /api/admin/tenants/:id/studio/flows/:flowId/simulate
 *
 * El backend corre el motor real con adaptadores falsos y devuelve, por cada
 * evento, el JSON exacto que se mandaría a WhatsApp y el "Por qué" en español.
 * Contrato completo: docs/studio/FASE_1_MOTOR_OBSERVABLE.md §2. Espejo a mano
 * de los tipos de backend/src/infrastructure/server/admin/studioSimulation.ts.
 */

/** Qué flow se prueba: el borrador, lo que el bot contesta hoy o una versión del historial. */
export type SimulateSource = 'active' | 'draft' | 'version';

/** Lo que hace el cliente simulado, en el vocabulario del webhook de Meta. */
export type SimEvent =
  | { type: 'text'; text: string }
  | { type: 'button_reply'; id: string; title: string }
  | { type: 'list_reply'; id: string; title: string }
  | { type: 'location'; latitude: number; longitude: number; name?: string; address?: string }
  | { type: 'media'; mediaType: 'image' | 'audio' | 'video' | 'document' | 'sticker' | 'contacts' | 'reaction' }
  | { type: 'advance_time'; minutes: number };

/** JSON de la Cloud API. Se tipa suelto: lo interpreta studioView.bubbleFromPayload. */
export type MetaPayload = { type: string; to: string } & Record<string, unknown>;

export interface SimOutbound {
  to: string;
  audience: 'customer' | 'owner';
  payload: MetaPayload | null;
  rejected?: string;
}

export interface SimSession {
  currentNodeId: string | null;
  context: Record<string, unknown>;
  lastInboundAt: string | null;
  humanPausedUntil: string | null;
  optedOut: boolean;
}

export interface SimTurn {
  at: string;
  outbound: SimOutbound[];
  /** Traza cruda, por si hace falta el detalle. La interfaz muestra `why`. */
  trace: Array<{ kind: string } & Record<string, unknown>>;
  why: string[];
  session: SimSession | null;
  billing: { serviceMessages: number; templates: number };
}

export interface SimulateConversationResult {
  source: SimulateSource;
  flowId: string;
  from: string;
  startAt: string;
  turns: SimTurn[];
}

export function simulateConversation(
  tenantId: string,
  flowId: string,
  body: {
    events: SimEvent[];
    source: SimulateSource;
    versionId?: string;
    startAt?: string;
    from?: string;
  },
): Promise<SimulateConversationResult> {
  return apiFetch<SimulateConversationResult>(
    'POST',
    `/api/admin/tenants/${tenantId}/studio/flows/${flowId}/simulate`,
    body,
  );
}

// ============================================================================
// Validador (Fase 2)
// ============================================================================

export interface ValidationIssue {
  code: string;
  level: 'error' | 'warning';
  message: string;
  nodeId?: string;
}

export interface ValidationReport {
  ok: boolean;
  summary: { errors: number; warnings: number };
  issues: ValidationIssue[];
  /** ¿Se podría publicar hoy? (FlowSchema del backend) */
  schema: { ok: boolean; issues: Array<{ path: string; message: string }> };
}

/** Límites de WhatsApp servidos por el backend (domain/whatsapp/limits.ts). */
export interface WhatsAppLimits {
  verifiedAt: string;
  limits: {
    text: { bodyMax: number };
    replyButtons: { buttonsMax: number; buttonTitleMax: number; bodyMax: number };
    list: { bodyMax: number; buttonLabelMax: number; rowsTotalMax: number; sectionTitleMax: number; rowTitleMax: number; rowDescriptionMax: number };
  } & Record<string, unknown>;
}

export function getLimits(): Promise<WhatsAppLimits> {
  return apiFetch<WhatsAppLimits>('GET', '/api/admin/studio/limits');
}

// ============================================================================
// Asistente (Fase 3). Espejo a mano de backend/src/domain/studio/wizard.ts
// ============================================================================

export interface WizardHandoff {
  userResponse: string;
  ownerAlert: string;
}

interface WizardOptionBase {
  id: string;
  title: string;
  description?: string;
  keywords: string[];
}

export interface WizardCaptureOption extends WizardOptionBase {
  kind: 'capture';
  choices: null | {
    text: string;
    buttonLabel: string;
    sectionTitle: string;
    items: Array<{ title: string; description?: string }>;
    saveAs: string;
  };
  question: string;
  saveAs: string;
  confirm: null | {
    text: string;
    yesTitle: string;
    noTitle: string;
    yesKeywords: string[];
    noKeywords: string[];
  };
  handoff: WizardHandoff;
}

export interface WizardInfoOption extends WizardOptionBase {
  kind: 'info';
  text: string;
  /** goto: id de otra opción, o 'farewell'. */
  actions: Array<{ title: string; goto: string }>;
}

export interface WizardHumanOption extends WizardOptionBase {
  kind: 'human';
  handoff: WizardHandoff;
}

export type WizardOption = WizardCaptureOption | WizardInfoOption | WizardHumanOption;

export interface WizardSpec {
  version: 1;
  menu: { listButtonLabel: string; listSectionTitle: string };
  options: WizardOption[];
  notUnderstood: { attempts: number; retryText: string; handoff: WizardHandoff };
  farewell: { text: string; keywords: string[] };
}

export interface StudioMold {
  id: string;
  nombre: string;
  descripcion: string;
  spec: WizardSpec;
  textosSugeridos: {
    mensaje_bienvenida: string;
    mensaje_menu_principal: string;
    mensaje_no_entendio: string;
    mensaje_fuera_horario: string;
  };
}

export async function getMolds(): Promise<StudioMold[]> {
  const res = await apiFetch<{ molds: StudioMold[] }>('GET', '/api/admin/studio/molds');
  return res.molds;
}

export interface WizardState {
  spec: WizardSpec | null;
  /** Por qué no hay especificación: no la generó el asistente, o se editó en el Designer. */
  reason?: 'no_spec' | 'invalid_spec' | 'edited_elsewhere';
  source: 'draft' | 'published' | null;
  draftUpdatedAt: string | null;
}

export function getWizard(tenantId: string, flowId: string): Promise<WizardState> {
  return apiFetch<WizardState>('GET', `/api/admin/tenants/${tenantId}/studio/flows/${flowId}/wizard`);
}

export function previewWizard(tenantId: string, spec: WizardSpec): Promise<{ report: ValidationReport }> {
  return apiFetch<{ report: ValidationReport }>('POST', `/api/admin/tenants/${tenantId}/studio/wizard/preview`, { spec });
}

export function saveWizard(
  tenantId: string,
  flowId: string,
  spec: WizardSpec,
  expectedDraftUpdatedAt?: string | null,
): Promise<{ draftUpdatedAt: string; report: ValidationReport }> {
  return apiFetch('PUT', `/api/admin/tenants/${tenantId}/studio/flows/${flowId}/wizard`, {
    spec,
    ...(expectedDraftUpdatedAt !== undefined ? { expectedDraftUpdatedAt } : {}),
  });
}
