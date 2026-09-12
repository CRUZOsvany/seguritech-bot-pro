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
  /** Arreglo que el Studio sabe hacer solo (fusionar un texto con el mensaje que le sigue). */
  fix?: { kind: 'merge_next'; nodeId: string };
}

/** Cuántos mensajes manda el bot en un turno, desde `entry` hasta esperar al cliente. */
export interface TurnMessages {
  entry: string;
  messages: number;
  path: string[];
}

export interface ValidationReport {
  ok: boolean;
  summary: { errors: number; warnings: number };
  issues: ValidationIssue[];
  /** ¿Se podría publicar hoy? (FlowSchema del backend) */
  schema: { ok: boolean; issues: Array<{ path: string; message: string }> };
  /** Opcional: los reportes anteriores a la Fase 5 no lo traen. */
  turns?: TurnMessages[];
}

/** Valida un flow sin guardarlo (el lienzo del Designer). */
export function validateFlowJson(tenantId: string, flow: unknown): Promise<{ report: ValidationReport }> {
  return apiFetch<{ report: ValidationReport }>('POST', `/api/admin/tenants/${tenantId}/studio/validate`, { flow });
}

/** Fusiona un texto con el mensaje que le sigue. Devuelve el flow nuevo; no guarda nada. */
export function mergeNext(
  tenantId: string,
  flow: unknown,
  nodeId: string,
): Promise<{ flow: unknown; removed: string | null; report: ValidationReport }> {
  return apiFetch('POST', `/api/admin/tenants/${tenantId}/studio/merge`, { flow, nodeId });
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
  /** Lo que ve el cliente con el negocio cerrado, si el bot sigue atendiendo fuera de horario. */
  userResponseClosed?: string;
}

interface WizardOptionBase {
  id: string;
  title: string;
  description?: string;
  keywords: string[];
}

/** Qué acepta una captura (C-04). Espejo de backend/src/domain/conversation/captureValidation.ts. */
export type CaptureRule =
  | { type: 'phone_mx' }
  | { type: 'email' }
  | { type: 'number'; integer?: boolean; min?: number; max?: number }
  | { type: 'date' }
  | { type: 'time' }
  | { type: 'text'; min_length?: number; max_length?: number };

export interface CaptureCheck {
  rule: CaptureRule;
  /** Vacío: el bot usa un mensaje según el tipo. */
  errorText?: string;
  maxAttempts: number;
  /** Al agotar los intentos: a una persona (aviso de "no te entendí") o al menú. */
  onExhausted: 'human' | 'menu';
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
  /** Sin él, la pregunta acepta cualquier texto. */
  check?: CaptureCheck;
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

/** Palabras que funcionan en cualquier paso (C-08). */
export interface WizardEscape {
  /** Vuelven al menú sin borrar lo que el cliente ya dijo. */
  menuWords: string[];
  /** Borran lo capturado y empiezan desde el saludo. */
  restartWords: string[];
  humanWords: string[];
  optOutWords: string[];
  /** El paso de persona al que llevan las palabras de persona. */
  handoff: WizardHandoff;
}

export interface WizardSpec {
  version: 1;
  menu: { listButtonLabel: string; listSectionTitle: string };
  options: WizardOption[];
  notUnderstood: { attempts: number; retryText: string; handoff: WizardHandoff };
  farewell: { text: string; keywords: string[] };
  /** Sin ella el bot usa las palabras de siempre y no tiene palabra para pedir una persona. */
  escape?: WizardEscape;
  /** Fuera de horario: `block` solo avisa que está cerrado; `continue` atiende igual. Sin él, `block`. */
  hours?: { whenClosed: 'block' | 'continue' };
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

export interface StudioMolds {
  molds: StudioMold[];
  /** Palabras de escape que propone el Studio a un bot que no las tiene. */
  escapeDefaults: WizardEscape;
}

export function getMolds(): Promise<StudioMolds> {
  return apiFetch<StudioMolds>('GET', '/api/admin/studio/molds');
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

// ============================================================================
// Pruebas, explorador y diff (Fase 4). Espejo a mano de
// backend/src/domain/studio/{testCases,diff}.ts y StudioFlowExplorer.ts
// ============================================================================

export interface TestExpectation {
  node?: string;
  vars?: Record<string, string>;
  contains?: string[];
  notContains?: string[];
  maxMessages?: number;
}

export interface TestOptions {
  startAt?: string;
  from?: string;
}

export interface FlowTestCase {
  id: string;
  flowId: string;
  name: string;
  events: SimEvent[];
  expect: TestExpectation;
  options: TestOptions;
  createdAt: string;
  updatedAt: string;
}

export interface TestInput {
  name: string;
  events: SimEvent[];
  expect: TestExpectation;
  options: TestOptions;
}

export interface TestRunReport {
  total: number;
  passed: number;
  failed: number;
  results: Array<{ id: string; name: string; passed: boolean; failures: string[] }>;
}

export interface ExplorationReport {
  depth: number;
  runs: number;
  truncated: boolean;
  coverage: { total: number; reached: string[]; unreached: string[]; percent: number };
  deadEnds: Array<{ nodeId: string; path: string[] }>;
  errors: Array<{ nodeId: string; reason: string; path: string[] }>;
  maxMessagesPerTurn: { count: number; path: string[] };
}

export interface FlowDiff {
  startChanged: { from: string; to: string } | null;
  added: string[];
  removed: string[];
  changed: Array<{ nodeId: string; changes: string[] }>;
  same: boolean;
}

const studioFlow = (tenantId: string, flowId: string) => `/api/admin/tenants/${tenantId}/studio/flows/${flowId}`;

export async function listTests(tenantId: string, flowId: string): Promise<FlowTestCase[]> {
  const res = await apiFetch<{ tests: FlowTestCase[] }>('GET', `${studioFlow(tenantId, flowId)}/tests`);
  return res.tests;
}

export async function createTest(tenantId: string, flowId: string, input: TestInput): Promise<FlowTestCase> {
  const res = await apiFetch<{ test: FlowTestCase }>('POST', `${studioFlow(tenantId, flowId)}/tests`, input);
  return res.test;
}

export async function deleteTest(tenantId: string, flowId: string, testId: string): Promise<void> {
  await apiFetch('DELETE', `${studioFlow(tenantId, flowId)}/tests/${testId}`);
}

export async function runTests(tenantId: string, flowId: string, source: SimulateSource): Promise<TestRunReport> {
  const res = await apiFetch<{ report: TestRunReport }>('POST', `${studioFlow(tenantId, flowId)}/tests/run`, { source });
  return res.report;
}

export async function exploreFlow(
  tenantId: string,
  flowId: string,
  body: { source: SimulateSource; depth?: number },
): Promise<ExplorationReport> {
  const res = await apiFetch<{ report: ExplorationReport }>('POST', `${studioFlow(tenantId, flowId)}/explore`, body);
  return res.report;
}

export interface DiffResult {
  /** Versión contra la que se compara; null si nunca se publicó. */
  against: number | null;
  source: 'draft' | 'published' | null;
  diff: FlowDiff;
}

export function getDiff(tenantId: string, flowId: string, against?: number): Promise<DiffResult> {
  const qs = against !== undefined ? `?against=${against}` : '';
  return apiFetch<DiffResult>('GET', `${studioFlow(tenantId, flowId)}/diff${qs}`);
}

/**
 * Cuerpo del 400 de publicar (compuerta de la Fase 4): errores del validador
 * o pruebas fallidas. `testReport` solo viene cuando fallaron pruebas.
 */
export interface PublishRejection {
  error: string;
  issues?: Array<{ path?: string; message: string }>;
  report?: ValidationReport;
  testReport?: TestRunReport;
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
