/** Shared wire budgets, independent of the backend and standalone runtime. */
export const MESSAGE_LIMITS = Object.freeze({
  controlBytes: 8_192,
  operationalBytes: 262_144,
  configurationBytes: 1_048_576,
  stringLength: 4_096,
  identifierLength: 128,
  collectionEntries: 4_096,
  depth: 16,
  nodes: 65_536,
  pendingControl: 8,
  pendingCommands: 256,
  retainedCommands: 4_096,
  pendingBackend: 64,
});

export function isIdentifier(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MESSAGE_LIMITS.identifierLength &&
    value.trim() === value &&
    !/[\s/+#]/.test(value) &&
    ![...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
  );
}

/** Bound work before domain validation, canonical sorting, hashing or diagnostics.
 * Returns a fixed diagnostic: rejected input must never appear in logs.
 */
export function structureLimitError(value: unknown): string | null {
  const seen = new Set<object>();
  let remaining = MESSAGE_LIMITS.nodes;
  let stringBytes = 0;
  const encoder = new TextEncoder();
  let reason = 'structure';
  const reject = (why: string) => {
    reason = why;
    return false;
  };
  function visit(item: unknown, depth: number): boolean {
    if (--remaining < 0) return reject('complexity');
    if (depth > MESSAGE_LIMITS.depth) return reject('depth');
    if (typeof item === 'string') {
      if (item.length > MESSAGE_LIMITS.stringLength) return reject('string');
      stringBytes += encoder.encode(JSON.stringify(item)).byteLength;
      return stringBytes <= MESSAGE_LIMITS.configurationBytes || reject('bytes');
    }
    if (!item || typeof item !== 'object') return true;
    if (seen.has(item)) return reject('cycle');
    seen.add(item);
    let count = 0;
    // Enumerate lazily so a giant object cannot create another giant keys array.
    for (const key in item) {
      if (!Object.prototype.hasOwnProperty.call(item, key)) continue;
      if (++count > MESSAGE_LIMITS.collectionEntries) return reject('collection');
      if (key.length > MESSAGE_LIMITS.identifierLength) return reject('key');
      stringBytes += encoder.encode(JSON.stringify(key)).byteLength;
      if (stringBytes > MESSAGE_LIMITS.configurationBytes) return reject('bytes');
      if (!visit((item as Record<string, unknown>)[key], depth + 1)) return false;
    }
    seen.delete(item);
    return !Array.isArray(item) || item.length <= MESSAGE_LIMITS.collectionEntries || reject('collection');
  }
  return visit(value, 0) ? null : `message ${reason} exceeds supported limits`;
}

/** Drop excess work synchronously, before retaining payloads in promise chains.
 * Existing domain queues still own ordering and acknowledgements.
 */
export class MessageAdmission {
  pending = 0;
  rejected = 0;

  constructor(private readonly capacity: number) {}

  /** Preserve synchronous consumers: their existing queues own retained work. */
  dispatch(bytes: number, maximumBytes: number, operation: () => void | Promise<void>): void | Promise<void> {
    if (bytes > maximumBytes || this.pending >= this.capacity) {
      this.rejected = Math.min(Number.MAX_SAFE_INTEGER, this.rejected + 1);
      return;
    }
    this.pending += 1;
    try {
      const result = operation();
      if (result)
        return result.finally(() => {
          this.pending -= 1;
        });
      this.pending -= 1;
    } catch (error) {
      this.pending -= 1;
      throw error;
    }
  }

  async run<T>(bytes: number, maximumBytes: number, operation: () => T | Promise<T>): Promise<T | undefined> {
    if (bytes > maximumBytes || this.pending >= this.capacity) {
      this.rejected = Math.min(Number.MAX_SAFE_INTEGER, this.rejected + 1);
      return undefined;
    }
    this.pending += 1;
    try {
      return await operation();
    } finally {
      this.pending -= 1;
    }
  }
}

/** Reserve room for the largest normal state: observed and commanded outputs,
 * manual ownership IDs, inputs, and the fixed readiness/envelope fields.
 * Count encoded bytes (including escapes and multi-byte IDs), not characters.
 */
export function stateBudgetError(snapshot: unknown): string | null {
  const channels = (snapshot as { logicalChannels?: unknown })?.logicalChannels;
  if (!Array.isArray(channels)) return null; // Domain validators report malformed collections.
  const encoder = new TextEncoder();
  let bytes = 2048;
  for (const channel of channels) {
    if (!channel || typeof channel.id !== 'string' || !Array.isArray(channel.capabilities)) continue;
    const idBytes = encoder.encode(JSON.stringify(channel.id)).byteLength;
    if (channel.capabilities.includes('output')) bytes += 3 * idBytes + 16;
    else if (channel.capabilities.includes('input')) bytes += idBytes + 7;
    if (bytes > MESSAGE_LIMITS.operationalBytes) return 'configuration state exceeds supported byte limit';
  }
  return null;
}
