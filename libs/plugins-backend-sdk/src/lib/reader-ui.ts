/**
 * Reader UI schema v1 and the pre-start / session-end hook contract.
 *
 * Plugins describe UI as plain data. Nothing here runs on the reader. The host
 * validates, sanitizes (Latin-1) and size-checks everything before it is sent.
 * The firmware mirrors the constants in `display/ui/ui_schema.hpp`; a Jest
 * parity test keeps both in sync.
 */

export type ReaderUiTone = 'primary' | 'success' | 'warning' | 'danger';
export type ReaderUiIconName = 'ok' | 'warning' | 'bell' | 'lock' | 'clock';
export type ReaderUiTextStyle = 'title' | 'body' | 'small';

export type ReaderUiNode =
  | { t: 'col' | 'row'; c?: ReaderUiNode[]; gap?: number; pad?: number; fill?: boolean; tone?: ReaderUiTone }
  | { t: 'text'; text: string; style?: ReaderUiTextStyle; fill?: boolean }
  | { t: 'badge'; text: string; tone?: ReaderUiTone }
  | { t: 'icon'; name: ReaderUiIconName; tone?: ReaderUiTone }
  /** Steps only. Slot trees must not contain buttons. */
  | { t: 'button'; id: string; text: string; variant?: 'primary' | 'secondary' }
  | { t: 'progress'; value: number; tone?: ReaderUiTone }
  /** Plugin-facing form takes a Date; the wire form carries epoch milliseconds in `toMs`. */
  | { t: 'countdown'; to: Date; tone?: ReaderUiTone }
  | { t: 'spacer'; h?: number };

/** Wire form of a node tree: `countdown.to` is replaced by `toMs`. */
export type ReaderUiWireNode =
  | Exclude<ReaderUiNode, { t: 'countdown' | 'col' | 'row' }>
  | { t: 'col' | 'row'; c?: ReaderUiWireNode[]; gap?: number; pad?: number; fill?: boolean; tone?: ReaderUiTone }
  | { t: 'countdown'; toMs: number; tone?: ReaderUiTone };

export const READER_UI_SCHEMA_VERSION = 1;

export const READER_UI_COMPONENTS = [
  'col',
  'row',
  'text',
  'badge',
  'icon',
  'button',
  'progress',
  'countdown',
  'spacer',
] as const;
export type ReaderUiComponent = (typeof READER_UI_COMPONENTS)[number];

export const READER_UI_TONES: readonly ReaderUiTone[] = ['primary', 'success', 'warning', 'danger'];
export const READER_UI_ICONS: readonly ReaderUiIconName[] = ['ok', 'warning', 'bell', 'lock', 'clock'];
export const READER_UI_TEXT_STYLES: readonly ReaderUiTextStyle[] = ['title', 'body', 'small'];

export const READER_UI_SLOTS = {
  RESOURCE_LIST_ROW_STATUS: 'resourceList.row.status',
  RESOURCE_DETAILS_HEADER: 'resource.details.header',
  RESOURCE_DETAILS_BODY: 'resource.details.body',
  RESOURCE_DETAILS_SESSION: 'resource.details.session',
} as const;
export type ReaderUiSlotId = (typeof READER_UI_SLOTS)[keyof typeof READER_UI_SLOTS];
export const READER_UI_SLOT_IDS: readonly ReaderUiSlotId[] = Object.values(READER_UI_SLOTS);

/** Node budget per slot. The list row slot takes a single text or badge. */
export const READER_UI_SLOT_NODE_BUDGET: Record<ReaderUiSlotId, number> = {
  'resourceList.row.status': 1,
  'resource.details.header': 6,
  'resource.details.body': 8,
  'resource.details.session': 6,
};

export const READER_UI_STEP_KINDS = ['confirm', 'choose', 'info'] as const;
export type ReaderUiStepKind = (typeof READER_UI_STEP_KINDS)[number];
export type ReaderUiStepRole = 'cancel' | 'confirm' | 'ok' | 'choice';

export const READER_UI_LIMITS = {
  /** UTF-8 bytes of the sanitized UI payload. */
  maxPayloadBytes: 3072,
  /** Whole websocket frame; legacy token readers cannot reassemble. */
  maxFrameBytes: 4096,
  maxNodes: 32,
  maxDepth: 5,
  maxLiveNodes: 64,
  maxTextChars: 80,
  maxLabelBytes: 31,
  maxListRowChars: 24,
  maxChoices: 4,
  maxSlotContributionsPerResource: 8,
  idPattern: /^[a-z0-9_-]{1,24}$/,
} as const;

export const READER_UI_TIMING = {
  stepDefaultTtlSec: 60,
  stepMaxTtlSec: 120,
  stepGraceSec: 5,
  postStopDefaultTtlSec: 15,
  postStopMaxTtlSec: 30,
  hookDefaultTimeoutMs: 1500,
  hookMaxTimeoutMs: 3000,
  breakerThreshold: 5,
  breakerProbeAfterMs: 60_000,
  crashLoopSuspendMs: 30 * 60_000,
  slotUpdateMinIntervalMs: 2000,
} as const;

/** Strings that only the host may show (core status). Compared case-insensitively on trimmed text. */
export const READER_UI_RESERVED_STATUS_STRINGS: readonly string[] = [
  'maintenance',
  'under maintenance',
  'in use',
  'available',
  'access granted',
  'access denied',
  'unavailable',
  'introduction required',
  'emergency stop',
  'firmware update',
  'wartung',
  'in wartung',
  'in benutzung',
  'verfuegbar',
  'verfügbar',
  'zugriff gewaehrt',
  'zugriff gewährt',
  'zugriff verweigert',
  'einweisung erforderlich',
  'notaus',
];

export type NoScreenPolicy = 'block' | 'card-confirm' | 'allow-with-warning';
export const NO_SCREEN_POLICIES: readonly NoScreenPolicy[] = ['block', 'card-confirm', 'allow-with-warning'];
export const DEFAULT_NO_SCREEN_POLICY: NoScreenPolicy = 'block';

export type HookFailurePolicy = 'fail-closed' | 'fail-open';

/** Reset reasons shared with READER_CRASH_REPORT. */
export const PANIC_CLASS_RESET_REASONS = ['PANIC', 'INT_WDT', 'TASK_WDT', 'WDT', 'CPU_LOCKUP'] as const;

/** What a reader reports in `READER_FIRMWARE_INFO.capabilities.ui`. Missing = schemaVersion 0. */
export interface ReaderUiCapabilities {
  schemaVersion: number;
  components: string[];
  slots: string[];
  /** Touch: confirm/choose/info. Lite: [] or ['card-confirm']. */
  steps: string[];
  maxPayloadBytes: number;
  maxNodes: number;
  maxDepth: number;
  maxLiveNodes: number;
  display: { w: number; h: number; touch: boolean } | null;
  input: { touch: boolean; buttons: number; cardHold: boolean };
  feedback: { leds: boolean; beeper: boolean };
  charset: 'latin1';
  images: boolean;
}

export const READER_UI_CAPABILITIES_NONE: ReaderUiCapabilities = {
  schemaVersion: 0,
  components: [],
  slots: [],
  steps: [],
  maxPayloadBytes: 0,
  maxNodes: 0,
  maxDepth: 0,
  maxLiveNodes: 0,
  display: null,
  input: { touch: false, buttons: 0, cardHold: false },
  feedback: { leds: false, beeper: false },
  charset: 'latin1',
  images: false,
};

export interface ReaderUiContext {
  readerId: number;
  resourceId: number;
  /** Set whenever a card session is live; never for a signed-out reader. */
  userId?: number;
  capabilities: ReaderUiCapabilities;
  language: 'en' | 'de';
}

export interface ReaderSlotContribution {
  slotId: ReaderUiSlotId;
  /** Plugin-local, unique per slot and resource. */
  key: string;
  tree: ReaderUiNode;
  /** The host re-evaluates the provider at this time and removes the contribution. */
  expiresAt?: Date;
  /** Sent instead of `tree` when the reader cannot render it. */
  fallback?: { text: string; tone?: ReaderUiTone };
}

export interface ReaderUiProvider {
  getSlotContributions(ctx: ReaderUiContext): ReaderSlotContribution[] | Promise<ReaderSlotContribution[]>;
}

export type PreStartOrigin = 'web' | 'api' | 'reader' | 'supervision';

export interface PreStartContext {
  resourceId: number;
  userId: number;
  action: 'start' | 'takeover';
  projectId?: number;
  origin: PreStartOrigin;
  /** Only this plugin's step keys, checked by the host. */
  confirmedStepKeys: string[];
  now: Date;
}

export interface PluginConfirmation {
  /** Stable per plugin; the host issues a random stepId per step. */
  stepKey: string;
  title: string;
  body: string;
  tone?: ReaderUiTone;
  confirmLabel?: string;
  cancelLabel?: string;
  countdownTo?: Date;
  /** Host clamps to [10, 120]. */
  expiresInSec?: number;
  /** Plugin default for readers without a screen. */
  noScreenPolicy?: NoScreenPolicy;
}

export interface PluginBlockReason {
  code: string;
  title: string;
  body: string;
}

export type PreStartResult =
  | { decision: 'allow' }
  | { decision: 'confirm'; confirmation: PluginConfirmation }
  | { decision: 'block'; reason: PluginBlockReason };

export type PreStartHook = (ctx: PreStartContext) => PreStartResult | Promise<PreStartResult>;

export interface SessionEndContext {
  resourceId: number;
  userId: number;
  sessionId: number;
  origin: 'web' | 'api' | 'reader';
  now: Date;
}

export interface PluginChoice {
  stepKey: string;
  title: string;
  body: string;
  /** Max 4. */
  choices: { id: string; label: string }[];
  /** Applied on timeout, disconnect, cancel and readers without a screen. */
  defaultOnTimeout: string;
  onAnswer(choiceId: string): void | Promise<void>;
}

export type SessionEndResult = { decision: 'none' } | { decision: 'choose'; choice: PluginChoice };
export type SessionEndHook = (ctx: SessionEndContext) => SessionEndResult | Promise<SessionEndResult>;

export interface PluginReaderUiApi {
  /** Re-evaluate and push contributions for a resource or reader. */
  invalidate(scope: { resourceId?: number; readerId?: number }): void;
}
