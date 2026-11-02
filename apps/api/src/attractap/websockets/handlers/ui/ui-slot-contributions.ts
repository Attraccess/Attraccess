import {
  READER_UI_LIMITS,
  READER_UI_SLOTS,
  READER_UI_TIMING,
  type ReaderSlotContribution,
  type ReaderUiCapabilities,
  type ReaderUiProvider,
} from '@attraccess/plugins-backend-sdk';
import { validateSlotUpdate } from '../../../../resources/forms/reader-ui.validation';
import { fallbackTree, readerCanRender, toWireTree, treeHash } from './ui-slot-builder';
import { contributionKey, type UiContributionRecord } from './ui-socket-state';

export type DesiredRecord = Omit<UiContributionRecord, 'revision' | 'sent'>;

/** What one sync wants the reader to show for one contribution; `tree: null` means nothing (skipped). */
export interface Desired {
  ckey: string;
  record: DesiredRecord;
  tree: unknown | null;
}

export interface CollectInput {
  caps: ReaderUiCapabilities;
  readerId: number;
  resourceIds: number[];
  providers: { plugin: string; provider: ReaderUiProvider }[];
  userId?: number;
  language: 'en' | 'de';
  /** Widgets toggled on for the resource and plugin (the reader toggle is applied by the caller). */
  enabled: (resourceId: number, plugin: string) => boolean;
  /** Provider calls still running from an earlier sync; shared per reader connection. */
  pending: Set<string>;
  warn: (message: string) => void;
}

export interface Collected {
  desired: Map<string, Desired>;
  /** `plugin|resourceId` whose provider is still busy: keep what the reader shows for them unchanged. */
  keep: Set<string>;
}

type Outcome = { kind: 'disabled' } | { kind: 'pending' } | { kind: 'list'; list: unknown };

const DETAILS_SLOTS: string[] = [
  READER_UI_SLOTS.RESOURCE_DETAILS_HEADER,
  READER_UI_SLOTS.RESOURCE_DETAILS_BODY,
  READER_UI_SLOTS.RESOURCE_DETAILS_SESSION,
];

export const pendingKey = (plugin: string, resourceId: number) => `${plugin}|${resourceId}`;

/** Rejects after `ms`, and clears its timer when the work settles first. */
export async function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), ms);
    timer.unref?.();
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** Runs every (resource, plugin) provider concurrently and turns the answers into desired contributions. */
export async function collectContributions(input: CollectInput): Promise<Collected> {
  const calls = input.resourceIds.flatMap((resourceId) =>
    input.providers.map(({ plugin, provider }) => ({ resourceId, plugin, provider })),
  );
  const settled = await Promise.allSettled(calls.map((call) => callProvider(input, call)));
  const collected: Collected = { desired: new Map(), keep: new Set() };
  const perResource = new Map<number, number>();
  settled.forEach((result, i) => {
    const { resourceId, plugin } = calls[i];
    if (result.status === 'rejected') {
      input.warn(`Plugin ${plugin} slot provider failed: ${(result.reason as Error)?.message ?? result.reason}`);
      return skipProvider(collected.desired, plugin, resourceId, 'provider', 'provider-error');
    }
    const outcome = result.value;
    if (outcome.kind === 'disabled')
      return skipProvider(collected.desired, plugin, resourceId, 'widgets', 'widgets-disabled');
    if (outcome.kind === 'pending') return void collected.keep.add(pendingKey(plugin, resourceId));
    if (!Array.isArray(outcome.list)) return skipProvider(collected.desired, plugin, resourceId, 'provider', 'invalid');
    for (const [index, contribution] of outcome.list.entries()) {
      const count = (perResource.get(resourceId) ?? 0) + 1;
      perResource.set(resourceId, count);
      const overLimit = count > READER_UI_LIMITS.maxSlotContributionsPerResource;
      prepareSafely(collected.desired, input, plugin, resourceId, contribution, index, overLimit);
    }
  });
  applyNodeBudget(collected.desired);
  return collected;
}

async function callProvider(
  input: CollectInput,
  call: { resourceId: number; plugin: string; provider: ReaderUiProvider },
): Promise<Outcome> {
  const { resourceId, plugin, provider } = call;
  if (!input.enabled(resourceId, plugin)) return { kind: 'disabled' };
  const key = pendingKey(plugin, resourceId);
  if (input.pending.has(key)) return { kind: 'pending' };
  input.pending.add(key);
  const work = Promise.resolve().then(() =>
    provider.getSlotContributions({
      readerId: input.readerId,
      resourceId,
      userId: input.userId,
      capabilities: input.caps,
      language: input.language,
    }),
  );
  // The provider counts as busy until it really settles, even when the host stopped waiting for it.
  void work.then(
    () => input.pending.delete(key),
    () => input.pending.delete(key),
  );
  return { kind: 'list', list: await withTimeout(work, READER_UI_TIMING.hookDefaultTimeoutMs) };
}

/** One broken contribution (null, cyclic tree, bad fallback, ...) only skips itself. */
function prepareSafely(
  desired: Map<string, Desired>,
  input: CollectInput,
  plugin: string,
  resourceId: number,
  contribution: unknown,
  index: number,
  overLimit: boolean,
): void {
  try {
    prepare(desired, input, plugin, resourceId, contribution as ReaderSlotContribution, overLimit);
  } catch (error) {
    input.warn(`Skipped contribution ${index} of plugin ${plugin}: ${(error as Error)?.message ?? error}`);
    skipProvider(desired, plugin, resourceId, `entry-${index}`, 'invalid');
  }
}

function prepare(
  desired: Map<string, Desired>,
  input: CollectInput,
  plugin: string,
  resourceId: number,
  c: ReaderSlotContribution,
  overLimit: boolean,
): void {
  const userScoped = input.userId !== undefined;
  const base = { plugin, resourceId, slot: String(c.slotId), key: String(c.key), userScoped };
  const ckey = contributionKey(resourceId, base.slot, plugin, base.key);
  const skip = (reason: string): void => {
    desired.set(ckey, { ckey, tree: null, record: { ...base, hash: reason, nodes: 0, status: 'skipped', reason } });
  };
  const expiresAtMs = c.expiresAt ? new Date(c.expiresAt).getTime() : undefined;
  if (overLimit) return skip('too-many-contributions');
  if (expiresAtMs !== undefined && !(expiresAtMs > Date.now())) return skip('expired');
  let tree: unknown = toWireTree(c.tree);
  let status: 'rendered' | 'degraded' = 'rendered';
  if (!readerCanRender(input.caps, base.slot, tree)) {
    if (!c.fallback || !input.caps.slots.includes(base.slot)) return skip('unsupported');
    tree = fallbackTree(base.slot, c.fallback);
    status = 'degraded';
  }
  const checked = validateSlotUpdate({
    resourceId,
    slot: base.slot,
    revision: 1,
    owner: plugin.slice(0, 64),
    key: base.key,
    serverNowMs: Date.now(),
    ...(expiresAtMs === undefined ? {} : { expiresAtMs }),
    tree,
  });
  if ('reason' in checked) {
    input.warn(`Rejected a ${base.slot} contribution of plugin ${plugin}: ${checked.reason}`);
    return skip(`invalid-${checked.reason}`);
  }
  const wireTree = checked.value.payload['tree'];
  desired.set(ckey, {
    ckey,
    tree: wireTree,
    record: { ...base, hash: treeHash(wireTree, expiresAtMs), nodes: checked.value.nodes, status, expiresAtMs },
  });
}

/** A provider-level entry: the admin view says why a plugin shows nothing for a resource. */
export function skipProvider(
  desired: Map<string, Desired>,
  plugin: string,
  resourceId: number,
  key: string,
  reason: string,
): void {
  const ckey = contributionKey(resourceId, 'provider', plugin, key);
  desired.set(ckey, {
    ckey,
    tree: null,
    record: {
      plugin,
      resourceId,
      slot: 'provider',
      key,
      hash: reason,
      nodes: 0,
      status: 'skipped',
      reason,
      userScoped: false,
    },
  });
}

/** At most `maxLiveNodes` plugin nodes in resource-details slots per reader; the rest is skipped. */
function applyNodeBudget(desired: Map<string, Desired>): void {
  let live = 0;
  for (const want of desired.values()) {
    if (want.tree === null || !DETAILS_SLOTS.includes(want.record.slot)) continue;
    live += want.record.nodes;
    if (live > READER_UI_LIMITS.maxLiveNodes) {
      live -= want.record.nodes;
      want.tree = null;
      want.record.status = 'skipped';
      want.record.reason = 'node-budget';
      want.record.hash = 'node-budget';
    }
  }
}
