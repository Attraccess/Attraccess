import type { LifecycleState, MatterNodeSummary, NodeIdentity } from './api';

/** Needs the administrator's attention before the device can be used. */
export const needsResolution = (state: LifecycleState): boolean => state === 'unclaimed' || state === 'detached';

const ORDER: Record<LifecycleState, number> = { unclaimed: 0, detached: 1, claimed: 2, archived: 3, removed: 4 };

/** Unclaimed and detached first (they ask for a decision), then claimed, archived and removed; by name within. */
export function sortNodes(nodes: readonly MatterNodeSummary[], label: (node: MatterNodeSummary) => string) {
  return [...nodes].sort(
    (a, b) => ORDER[a.lifecycleState] - ORDER[b.lifecycleState] || label(a).localeCompare(label(b)),
  );
}

/** What each state offers. Unclaimed and detached offer only what resolves them; nothing offers a command. */
export type LifecycleAction = 'claim' | 'repair' | 'relink' | 'archive' | 'restore' | 'forceRemove';
export const ACTIONS_BY_STATE: Record<LifecycleState, readonly LifecycleAction[]> = {
  unclaimed: ['claim', 'archive', 'forceRemove'],
  detached: ['repair', 'relink', 'archive', 'forceRemove'],
  claimed: ['repair', 'forceRemove'],
  archived: ['restore', 'forceRemove'],
  removed: [],
};

/** Vendor, product or serial number that differ between a detached node and the unclaimed one it would take over. */
export function identityMismatch(
  target: NodeIdentity,
  source: NodeIdentity,
): ('vendorId' | 'productId' | 'serialNumber')[] {
  return (['vendorId', 'productId', 'serialNumber'] as const).filter((key) => target[key] !== source[key]);
}
