/**
 * Reader UI schema v1 and the pre-start / session-end hook contract.
 *
 * Plugins describe UI as plain data. Nothing here runs on the reader. The host
 * validates, sanitizes (Latin-1) and size-checks everything before it is sent.
 * The firmware mirrors the constants in `display/ui/ui_schema.hpp`; a Jest
 * parity test keeps both in sync.
 */

import type { PluginAccessPrincipal } from './plugin-resource-access';

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

/**
 * Strings that only the host may show (core status). Plugin text is rejected when it equals one after lower-casing,
 * collapsing whitespace and stripping non-letters at both ends.
 */
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
  /**
   * The resource has an active usage visible on this reader. The reader shows `resource.details.session` only
   * while this is true, so a provider that wants a fact in one block puts it in the session slot when this is true
   * and in the details body otherwise. The host re-evaluates the provider when a usage starts, ends or is taken
   * over. Optional for compatibility: when unset, treat it as `false`.
   */
  sessionActive?: boolean;
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
  /**
   * The IANA time zone (e.g. `Europe/Berlin`) this plugin writes times in on readers for the resource, or `undefined`
   * for no opinion. The host sends one zone per reader, so the reader's clock and the plugin's texts agree: the first
   * valid zone in host order wins (the reader's resources by id, and for each resource the plugins in host order,
   * alphabetically by plugin name; a slower plugin that answers within the time limit still wins over a faster one
   * ranked lower), otherwise the server's `TZ` applies. An invalid name is ignored; two different zones for one reader
   * raise an admin alert. Called with the slot timeout; an error or timeout counts as no opinion. Call
   * `readerUi.invalidate` when the zone changes.
   */
  getTimeZone?(ctx: { readerId: number; resourceId: number }): string | undefined | Promise<string | undefined>;
}

export type PreStartOrigin = 'web' | 'api' | 'reader' | 'supervision';

export interface PreStartContext {
  resourceId: number;
  userId: number;
  /**
   * The starter as a `resourceAccess` principal. Web and API starts carry the request's permissions (an API token's
   * scope), reader and supervision starts the plain user id. Pass it to `resourceAccess` instead of `userId`, so
   * permission checks in the hook apply the same scope as core's own start checks.
   */
  principal: PluginAccessPrincipal;
  action: 'start' | 'takeover';
  projectId?: number;
  origin: PreStartOrigin;
  /** Only this plugin's step keys, checked by the host. */
  confirmedStepKeys: string[];
  /** Language for texts: the card user's on a reader, the user's preferred language elsewhere. */
  language: 'en' | 'de';
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

export interface StartBlockedContext {
  resourceId: number;
  /** The user looking at the resource. Apply your own visibility rules before naming anybody in the reason. */
  userId: number;
  /** The viewer as a `resourceAccess` principal, with the request's permissions (an API token's scope). */
  principal: PluginAccessPrincipal;
  /** Language for texts: the user's preferred language. */
  language: 'en' | 'de';
  now: Date;
}

/** A start that is refused right now. Same reason shape as a `preStartHook` block. */
export interface StartBlockedState {
  reason: PluginBlockReason;
  /** When the block ends, if known. The host UI refreshes itself then and shows the time. */
  until?: Date;
}

/**
 * Query-side counterpart of `preStartHook`: tells the UI that a start by this user is blocked right now, so it
 * can show the reason in place of the start button instead of letting the user press it. Return null when
 * nothing blocks. It is informational only: `preStartHook` stays the authoritative gate and must still block.
 * Keep it cheap and side-effect free; it is called whenever a resource page is open. Failures and timeouts
 * count as "not blocked". Requires ACCESS_HOOKS.
 */
export type StartBlockedQuery = (
  ctx: StartBlockedContext,
) => StartBlockedState | null | Promise<StartBlockedState | null>;

/** Lets a plugin tell the host UI that the answer of its `startBlockedQuery` may have changed. */
export interface PluginStartBlockedApi {
  /** Open resource pages ask again. Call it when bookings or rules that decide the block change. */
  invalidate(scope: { resourceId: number }): void;
}

export interface SessionEndContext {
  resourceId: number;
  userId: number;
  sessionId: number;
  origin: 'web' | 'api' | 'reader';
  /** Language for texts: the card user's on a reader, the user's preferred language elsewhere. */
  language: 'en' | 'de';
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
  /** How long the reader shows the question. Default 15, host clamps to [5, 30]. */
  expiresInSec?: number;
  /** Called once with the answer or the default; runs with the hook timeout, errors are logged. */
  onAnswer(choiceId: string): void | Promise<void>;
}

export type SessionEndResult = { decision: 'none' } | { decision: 'choose'; choice: PluginChoice };
export type SessionEndHook = (ctx: SessionEndContext) => SessionEndResult | Promise<SessionEndResult>;

export interface PluginReaderUiApi {
  /** Re-evaluate and push contributions for a resource or reader. */
  invalidate(scope: { resourceId?: number; readerId?: number }): void;
}
