import { readerServerTime } from './websocket-reader-payloads';
import { processOffsetMinutes } from './reader-time-zone';

/** A ReaderTimeZoneService without plugin zones: every reader follows the API process zone. */
export function readerTimeZoneStub() {
  return {
    cachedZone: () => null,
    readerUtcOffsetMinutes: (_readerId: number | undefined, at: Date = new Date()) => processOffsetMinutes(at),
    serverTimeFor: (_readerId: number | undefined, now: Date = new Date()) => readerServerTime(now),
    resolvedServerTimeFor: async (_readerId: number, now: Date = new Date()) => readerServerTime(now),
  };
}
