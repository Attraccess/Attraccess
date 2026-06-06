/**
 * Shared pure helpers used by both the executor service and individual node
 * executors. Kept side-effect free so they can be unit tested in isolation.
 */

/**
 * MQTT-style topic matching supporting `+` (single level) and `#` (multi level,
 * trailing only) wildcards.
 */
export function topicMatches(filter: string, topic: string): boolean {
  const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = filter.split('/').map((segment, index, arr) => {
    if (segment === '+') {
      return '[^/]+';
    }
    if (segment === '#' && index === arr.length - 1) {
      return '.*';
    }
    return escapeRegex(segment);
  });
  const pattern = '^' + parts.join('/') + '$';
  return new RegExp(pattern).test(topic);
}

/**
 * Composite key for tracking heartbeat last-seen timestamps per resource +
 * identifier.
 */
export function heartbeatKey(resourceId: number, identifier: string): string {
  return `${resourceId}::${identifier}`;
}
