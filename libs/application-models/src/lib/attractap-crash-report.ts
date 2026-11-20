/**
 * Upload state of a report's coredump: awaiting while a chunked upload is owed, stored once the whole dump
 * was verified and saved, rejected when the server refused the announced dump.
 */
export type AttractapCoredumpStatus = 'awaiting' | 'stored' | 'rejected';

export interface AttractapCrashReportRecord {
  id: number;
  attractapId: number;
  resetReason: string;
  rebootReason: string | null;
  heapFreeBytes: number | null;
  largestFreeBlockBytes: number | null;
  uptimeBeforeResetMs: number | null;
  wsState: string | null;
  wifiState: string | null;
  firmwareVersion: string | null;
  coredumpSize: number | null;
  /** Only filled by the read that asks for the coredump, and on the report that was just stored. */
  coredump: Uint8Array | null;
  coredumpStatus: AttractapCoredumpStatus | null;
  /** Size the reader announced for a chunked upload (or for a refused dump). */
  coredumpExpectedSize: number | null;
  /** Unsigned CRC-32 the reader announced; internal, never part of a response. */
  coredumpExpectedCrc32: number | null;
  coredumpBuildId: string | null;
  symbolicationStatus: string | null;
  symbolizedBacktrace: string | null;
  createdAt: Date;
}

export type NewAttractapCrashReport = Omit<
  AttractapCrashReportRecord,
  'id' | 'createdAt' | 'coredumpBuildId' | 'symbolizedBacktrace'
>;

export interface AttractapCrashSymbolication {
  coredumpBuildId?: string | null;
  symbolicationStatus: string | null;
  symbolizedBacktrace: string | null;
}
