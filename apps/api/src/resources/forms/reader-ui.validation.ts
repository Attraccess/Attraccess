import { z } from 'zod';
import {
  READER_UI_ICONS,
  READER_UI_LIMITS,
  READER_UI_RESERVED_STATUS_STRINGS,
  READER_UI_SCHEMA_VERSION,
  READER_UI_SLOT_IDS,
  READER_UI_SLOT_NODE_BUDGET,
  READER_UI_STEP_KINDS,
  READER_UI_TEXT_STYLES,
  READER_UI_TONES,
  type ReaderUiCapabilities,
  type ReaderUiSlotId,
  type ReaderUiTone,
  type ReaderUiWireNode,
} from '@attraccess/plugins-backend-sdk';
import { makeStringLVGLReady } from '../../attractap/websockets/websocket-lvgl';

export type ReaderUiRejectReason =
  | 'invalid-shape'
  | 'unknown-slot'
  | 'unknown-component'
  | 'bad-enum'
  | 'too-many-nodes'
  | 'too-deep'
  | 'slot-budget'
  | 'payload-too-large'
  | 'text-too-long'
  | 'label-too-long'
  | 'bad-id'
  | 'core-string-spoof'
  | 'danger-lock'
  | 'button-in-slot'
  | 'too-many-choices';

export type ReaderUiValidation<T> = { ok: true; value: T } | { ok: false; reason: ReaderUiRejectReason };

class Reject extends Error {
  constructor(public readonly reason: ReaderUiRejectReason) {
    super(reason);
  }
}

const ID_RE = READER_UI_LIMITS.idPattern;

export function utf8Bytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value) ?? '', 'utf8');
}

/** Transliterates to Latin-1 first so byte and character counts match what the reader gets. */
export function sanitizeUiText(text: string): string {
  return makeStringLVGLReady(text.replace(/[\r\n\t]+/g, ' '));
}

function isCoreStatusString(text: string): boolean {
  const normalized = text
    .trim()
    .toLowerCase()
    .replace(/[.!:]+$/, '');
  return READER_UI_RESERVED_STATUS_STRINGS.includes(normalized);
}

function checkText(text: unknown, max: number, tooLong: ReaderUiRejectReason): string {
  if (typeof text !== 'string' || text.length === 0) throw new Reject('invalid-shape');
  const clean = sanitizeUiText(text);
  if (Array.from(clean).length > max) throw new Reject(tooLong);
  if (isCoreStatusString(clean)) throw new Reject('core-string-spoof');
  return clean;
}

function checkEnum<T extends string>(value: unknown, allowed: readonly T[], optional = true): T | undefined {
  if (value === undefined && optional) return undefined;
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) throw new Reject('bad-enum');
  return value as T;
}

function checkInt(value: unknown, min: number, max: number): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new Reject('invalid-shape');
  }
  return value;
}

interface WalkState {
  nodes: number;
  allowButtons: boolean;
}

function compact<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}

type NodeRecord = Record<string, unknown>;
type NodeBuilder = (n: NodeRecord, tone: ReaderUiTone | undefined, depth: number, state: WalkState) => ReaderUiWireNode;

const optionalBool = (value: unknown): boolean | undefined => (typeof value === 'boolean' ? value : undefined);

const buildContainer =
  (t: 'col' | 'row'): NodeBuilder =>
  (n, tone, depth, state) => {
    const rawChildren = n['c'];
    if (rawChildren !== undefined && !Array.isArray(rawChildren)) throw new Reject('invalid-shape');
    const c = (rawChildren as unknown[] | undefined)?.map((child) => walk(child, depth + 1, state));
    return compact({
      t,
      c,
      gap: checkInt(n['gap'], 0, 32),
      pad: checkInt(n['pad'], 0, 32),
      fill: optionalBool(n['fill']),
      tone,
    }) as ReaderUiWireNode;
  };

const buildIcon: NodeBuilder = (n, tone) => {
  const name = checkEnum(n['name'], READER_UI_ICONS, false);
  if (name === 'lock' && tone === 'danger') throw new Reject('danger-lock');
  return compact({ t: 'icon', name, tone }) as ReaderUiWireNode;
};

const buildButton: NodeBuilder = (n, _tone, _depth, state) => {
  if (!state.allowButtons) throw new Reject('button-in-slot');
  const id = n['id'];
  if (typeof id !== 'string' || !ID_RE.test(id)) throw new Reject('bad-id');
  return compact({
    t: 'button',
    id,
    text: checkText(n['text'], READER_UI_LIMITS.maxLabelBytes, 'label-too-long'),
    variant: checkEnum(n['variant'], ['primary', 'secondary'] as const),
  }) as ReaderUiWireNode;
};

const buildProgress: NodeBuilder = (n, tone) => {
  const value = n['value'];
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) {
    throw new Reject('invalid-shape');
  }
  return compact({ t: 'progress', value, tone }) as ReaderUiWireNode;
};

const buildCountdown: NodeBuilder = (n, tone) => {
  const toMs = n['toMs'];
  if (typeof toMs !== 'number' || !Number.isSafeInteger(toMs) || toMs < 0) throw new Reject('invalid-shape');
  return compact({ t: 'countdown', toMs, tone }) as ReaderUiWireNode;
};

const NODE_BUILDERS: Record<string, NodeBuilder> = {
  col: buildContainer('col'),
  row: buildContainer('row'),
  text: (n) =>
    compact({
      t: 'text',
      text: checkText(n['text'], READER_UI_LIMITS.maxTextChars, 'text-too-long'),
      style: checkEnum(n['style'], READER_UI_TEXT_STYLES),
      fill: optionalBool(n['fill']),
    }) as ReaderUiWireNode,
  badge: (n, tone) =>
    compact({
      t: 'badge',
      text: checkText(n['text'], READER_UI_LIMITS.maxListRowChars, 'text-too-long'),
      tone,
    }) as ReaderUiWireNode,
  icon: buildIcon,
  button: buildButton,
  progress: buildProgress,
  countdown: buildCountdown,
  spacer: (n) => compact({ t: 'spacer', h: checkInt(n['h'], 0, 64) }) as ReaderUiWireNode,
};

function walk(raw: unknown, depth: number, state: WalkState): ReaderUiWireNode {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new Reject('invalid-shape');
  if (depth > READER_UI_LIMITS.maxDepth) throw new Reject('too-deep');
  state.nodes += 1;
  if (state.nodes > READER_UI_LIMITS.maxNodes) throw new Reject('too-many-nodes');

  const n = raw as NodeRecord;
  const t = n['t'];
  const build = typeof t === 'string' && Object.hasOwn(NODE_BUILDERS, t) ? NODE_BUILDERS[t] : undefined;
  if (!build) throw new Reject('unknown-component');
  return build(n, checkEnum(n['tone'], READER_UI_TONES), depth, state);
}

function run<T>(fn: () => T): ReaderUiValidation<T> {
  try {
    return { ok: true, value: fn() };
  } catch (error) {
    if (error instanceof Reject) return { ok: false, reason: error.reason };
    throw error;
  }
}

function validateTree(tree: unknown, allowButtons: boolean): { tree: ReaderUiWireNode; nodes: number } {
  const state: WalkState = { nodes: 0, allowButtons };
  const result = walk(tree, 1, state);
  return { tree: result, nodes: state.nodes };
}

export interface ValidatedSlotUpdate {
  payload: Record<string, unknown>;
  nodes: number;
}

const slotEnvelope = z.object({
  resourceId: z.number().int().nonnegative(),
  slot: z.string(),
  revision: z.number().int().nonnegative(),
  owner: z.string().min(1).max(64),
  key: z.string().regex(ID_RE),
  serverNowMs: z.number().int().nonnegative(),
  expiresAtMs: z.number().int().nonnegative().optional(),
  tree: z.unknown(),
});

/** Validates and sanitizes a `UI_SLOT_UPDATE` payload; `tree: null` (removal) is always accepted. */
export function validateSlotUpdate(raw: unknown): ReaderUiValidation<ValidatedSlotUpdate> {
  return run(() => {
    if (utf8Bytes(raw) > READER_UI_LIMITS.maxPayloadBytes) throw new Reject('payload-too-large');
    const parsed = slotEnvelope.safeParse(raw);
    if (!parsed.success) throw new Reject('invalid-shape');
    const env = parsed.data;
    if (!(READER_UI_SLOT_IDS as readonly string[]).includes(env.slot)) throw new Reject('unknown-slot');
    if (env.tree === null) return { payload: { ...env }, nodes: 0 };

    const { tree, nodes } = validateTree(env.tree, false);
    const budget = READER_UI_SLOT_NODE_BUDGET[env.slot as ReaderUiSlotId];
    if (nodes > budget) throw new Reject('slot-budget');
    if (env.slot === 'resourceList.row.status') {
      if (tree.t !== 'text' && tree.t !== 'badge') throw new Reject('invalid-shape');
      if (Array.from(tree.text).length > READER_UI_LIMITS.maxListRowChars) throw new Reject('text-too-long');
    }
    const payload = { ...env, tree };
    if (utf8Bytes(payload) > READER_UI_LIMITS.maxPayloadBytes) throw new Reject('payload-too-large');
    return { payload, nodes };
  });
}

const stepAction = z.object({
  id: z.string().regex(ID_RE),
  role: z.enum(['cancel', 'confirm', 'ok']),
  label: z.string().optional(),
});

const stepEnvelope = z.object({
  requestId: z.number().int().nonnegative(),
  stepId: z.string().regex(/^[A-Za-z0-9_-]{22}$/),
  kind: z.enum([...READER_UI_STEP_KINDS, 'card-confirm']),
  resourceId: z.number().int().nonnegative(),
  serverNowMs: z.number().int().nonnegative(),
  expiresAtMs: z.number().int().nonnegative(),
  title: z.string(),
  body: z.string(),
  tone: z.enum(READER_UI_TONES as [string, ...string[]]).optional(),
  countdownToMs: z.number().int().nonnegative().optional(),
  actions: z.array(stepAction).max(2).optional(),
  choices: z.array(z.object({ id: z.string(), label: z.string() })).optional(),
});

/** Validates and sanitizes a `UI_STEP_REQUEST` payload. */
export function validateStepRequest(raw: unknown): ReaderUiValidation<Record<string, unknown>> {
  return run(() => {
    const parsed = stepEnvelope.safeParse(raw);
    if (!parsed.success) throw new Reject('invalid-shape');
    const step = parsed.data;
    const out: Record<string, unknown> = {
      ...step,
      title: checkText(step.title, READER_UI_LIMITS.maxTextChars, 'text-too-long'),
      body: checkText(step.body, READER_UI_LIMITS.maxTextChars * 2, 'text-too-long'),
    };
    if (step.actions) {
      out['actions'] = step.actions.map((a) =>
        compact({ ...a, label: a.label === undefined ? undefined : checkLabel(a.label) }),
      );
    }
    if (step.kind === 'choose') {
      const choices = step.choices ?? [];
      if (choices.length === 0 || choices.length > READER_UI_LIMITS.maxChoices) throw new Reject('too-many-choices');
      out['choices'] = choices.map((choice) => {
        if (!ID_RE.test(choice.id)) throw new Reject('bad-id');
        return { id: choice.id, label: checkLabel(choice.label) };
      });
    } else if (step.choices) {
      throw new Reject('invalid-shape');
    }
    if (utf8Bytes(out) > READER_UI_LIMITS.maxPayloadBytes) throw new Reject('payload-too-large');
    return out;
  });
}

function checkLabel(label: string): string {
  const clean = sanitizeUiText(label);
  if (Buffer.byteLength(clean, 'latin1') > READER_UI_LIMITS.maxLabelBytes || clean.length === 0) {
    throw new Reject('label-too-long');
  }
  if (isCoreStatusString(clean)) throw new Reject('core-string-spoof');
  return clean;
}

const capabilitiesSchema = z.object({
  schemaVersion: z.number().int().min(1).max(1000),
  components: z.array(z.string().max(16)).max(16),
  slots: z.array(z.string().max(40)).max(8),
  steps: z.array(z.string().max(16)).max(4),
  maxPayloadBytes: z.number().int().min(0).max(65535),
  maxNodes: z.number().int().min(0).max(255),
  maxDepth: z.number().int().min(0).max(16),
  maxLiveNodes: z.number().int().min(0).max(1024),
  display: z
    .object({ w: z.number().int().min(1).max(4096), h: z.number().int().min(1).max(4096), touch: z.boolean() })
    .nullable(),
  input: z.object({ touch: z.boolean(), buttons: z.number().int().min(0).max(16), cardHold: z.boolean() }),
  feedback: z.object({ leds: z.boolean(), beeper: z.boolean() }),
  charset: z.literal('latin1'),
  images: z.boolean(),
});

/** Validates `capabilities.ui` from READER_FIRMWARE_INFO. Missing or invalid input means schemaVersion 0 (null). */
export function validateReaderUiCapabilities(raw: unknown): ReaderUiCapabilities | null {
  if (raw === undefined || raw === null) return null;
  const parsed = capabilitiesSchema.safeParse(raw);
  if (!parsed.success) return null;
  const caps = parsed.data;
  // Never trust the reader to raise our limits; clamp to the host schema.
  return {
    ...caps,
    display: caps.display ?? null,
    maxPayloadBytes: Math.min(caps.maxPayloadBytes, READER_UI_LIMITS.maxPayloadBytes),
    maxNodes: Math.min(caps.maxNodes, READER_UI_LIMITS.maxNodes),
    maxDepth: Math.min(caps.maxDepth, READER_UI_LIMITS.maxDepth),
    maxLiveNodes: Math.min(caps.maxLiveNodes, READER_UI_LIMITS.maxLiveNodes),
    schemaVersion: Math.min(caps.schemaVersion, READER_UI_SCHEMA_VERSION),
  };
}

/** Sanitizes and checks one plugin-supplied string (step title/body, block reason, label). */
export function cleanPluginText(text: unknown, max: number): ReaderUiValidation<string> {
  return run(() => checkText(text, max, 'text-too-long'));
}

/** Sanitizes and checks a button label (<= 31 bytes after transliteration). */
export function cleanPluginLabel(label: unknown): ReaderUiValidation<string> {
  return run(() => {
    if (typeof label !== 'string') throw new Reject('invalid-shape');
    return checkLabel(label);
  });
}
