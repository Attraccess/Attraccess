import { createHash } from 'crypto';
import {
  READER_UI_SLOTS,
  type ReaderSlotContribution,
  type ReaderUiCapabilities,
  type ReaderUiTone,
} from '@attraccess/plugins-backend-sdk';

type Json = Record<string, unknown>;

/** Plugin form (`countdown.to: Date`) to wire form (`countdown.toMs`). Unknown keys are dropped by the validator. */
export function toWireTree(node: unknown): unknown {
  if (typeof node !== 'object' || node === null || Array.isArray(node)) return node;
  const n = node as Json;
  const out: Json = { ...n };
  if (n['t'] === 'countdown') {
    const to = n['to'];
    const ms = to instanceof Date ? to.getTime() : typeof to === 'number' ? to : Date.parse(String(to));
    out['toMs'] = ms;
    delete out['to'];
  }
  if (Array.isArray(n['c'])) out['c'] = n['c'].map(toWireTree);
  return out;
}

export function usedComponents(node: unknown, into = new Set<string>()): Set<string> {
  if (typeof node !== 'object' || node === null) return into;
  const n = node as Json;
  if (typeof n['t'] === 'string') into.add(n['t']);
  if (Array.isArray(n['c'])) n['c'].forEach((child) => usedComponents(child, into));
  return into;
}

export function countNodes(node: unknown): number {
  if (typeof node !== 'object' || node === null) return 0;
  const children = (node as Json)['c'];
  return 1 + (Array.isArray(children) ? children.reduce((sum: number, child) => sum + countNodes(child), 0) : 0);
}

export function treeHash(tree: unknown, expiresAtMs: number | undefined): string {
  return createHash('sha1')
    .update(JSON.stringify(tree) + '|' + (expiresAtMs ?? ''))
    .digest('hex');
}

export function fallbackTree(slot: string, fallback: { text: string; tone?: ReaderUiTone }): Json {
  if (slot === READER_UI_SLOTS.RESOURCE_LIST_ROW_STATUS) return { t: 'text', text: fallback.text };
  return fallback.text.length <= 24
    ? { t: 'badge', text: fallback.text, ...(fallback.tone ? { tone: fallback.tone } : {}) }
    : { t: 'text', text: fallback.text };
}

/** True when the reader announces every component the tree uses and the slot. */
export function readerCanRender(
  caps: ReaderUiCapabilities,
  slot: string,
  contribution: Pick<ReaderSlotContribution, 'tree'>,
): boolean {
  if (!caps.slots.includes(slot)) return false;
  return [...usedComponents(toWireTree(contribution.tree))].every((component) => caps.components.includes(component));
}
