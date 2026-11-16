const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

/** A reader is stale when it has not connected for more than 24 hours: the readers page and dashboard agree on it. */
export function isReaderStale(reader: { lastConnection: string }, now: Date): boolean {
  return new Date(reader.lastConnection).getTime() < now.getTime() - STALE_AFTER_MS;
}
