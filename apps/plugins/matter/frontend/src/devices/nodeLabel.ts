import type { MatterNodeSummary, NodeIdentity } from './api';

type Labelled = Pick<MatterNodeSummary, 'metadata' | 'identity' | 'nodeId'>;

/** The name an administrator gave, else product name and node ID, else the node ID alone. */
export function nodeLabel(node: Labelled, fallback: (nodeId: string) => string): string {
  const { displayName } = node.metadata;
  if (displayName) return displayName;
  const { productName } = node.identity;
  return productName ? `${productName} (${node.nodeId})` : fallback(node.nodeId);
}

/** `1.0.3` (the sidecar's string), else the numeric version; null when the device reported none. */
export function softwareLabel(
  identity: Pick<NodeIdentity, 'softwareVersionString' | 'softwareVersion'>,
): string | null {
  if (identity.softwareVersionString) return identity.softwareVersionString;
  return identity.softwareVersion === null ? null : String(identity.softwareVersion);
}
