import { createHash } from 'crypto';
import {
  READER_UI_LIMITS,
  READER_UI_SLOTS,
  type ReaderUiCapabilities,
  type ReaderUiTone,
} from '@attraccess/plugins-backend-sdk';

type Json = Record<string, unknown>;

/** Plugin trees deeper or wider than this are not even converted; the validator's own limits are far lower. */
const WIRE_DEPTH_LIMIT = READER_UI_LIMITS.maxDepth + 1;
const WIRE_NODE_LIMIT = READER_UI_LIMITS.maxNodes * 2;

export class TreeTooLargeError extends Error {
  constructor() {
    super('tree too deep or too large');
  }
}

/**
 * Plugin form (`countdown.to: Date`) to wire form (`countdown.toMs`). Unknown keys are dropped by the validator.
 * Bounded by depth and node count, so cyclic or huge plugin trees throw instead of overflowing the stack.
 */
export function toWireTree(node: unknown): unknown {
  const budget = { nodes: 0 };
  return convert(node, 1, budget);
}

function convert(node: unknown, depth: number, budget: { nodes: number }): unknown {
  if (typeof node !== 'object' || node === null || Array.isArray(node)) return node;
  budget.nodes += 1;
  if (depth > WIRE_DEPTH_LIMIT || budget.nodes > WIRE_NODE_LIMIT) throw new TreeTooLargeError();
  const n = node as Json;
  const out: Json = { ...n };
  if (n['t'] === 'countdown') {
    const to = n['to'];
    const ms = to instanceof Date ? to.getTime() : typeof to === 'number' ? to : Date.parse(String(to));
    out['toMs'] = ms;
    delete out['to'];
  }
  if (Array.isArray(n['c'])) out['c'] = n['c'].map((child) => convert(child, depth + 1, budget));
  return out;
}

/** Component names of a wire tree (already bounded by `toWireTree`). */
export function usedComponents(node: unknown, into = new Set<string>()): Set<string> {
  if (typeof node !== 'object' || node === null) return into;
  const n = node as Json;
  if (typeof n['t'] === 'string') into.add(n['t']);
  if (Array.isArray(n['c'])) n['c'].forEach((child) => usedComponents(child, into));
  return into;
}

export function treeHash(tree: unknown, expiresAtMs: number | undefined): string {
  return createHash('sha1')
    .update(JSON.stringify(tree) + '|' + (expiresAtMs ?? ''))
    .digest('hex');
}

export function fallbackTree(slot: string, fallback: { text: string; tone?: ReaderUiTone }): Json {
  // A fallback without text is passed on as such; the validator rejects it.
  const text = typeof fallback.text === 'string' ? fallback.text : '';
  if (slot === READER_UI_SLOTS.RESOURCE_LIST_ROW_STATUS) return { t: 'text', text };
  return Array.from(text).length <= READER_UI_LIMITS.maxListRowChars
    ? { t: 'badge', text, ...(fallback.tone ? { tone: fallback.tone } : {}) }
    : { t: 'text', text };
}

/** True when the reader announces the slot and every component the wire tree uses. */
export function readerCanRender(caps: ReaderUiCapabilities, slot: string, wireTree: unknown): boolean {
  if (!caps.slots.includes(slot)) return false;
  return [...usedComponents(wireTree)].every((component) => caps.components.includes(component));
}
