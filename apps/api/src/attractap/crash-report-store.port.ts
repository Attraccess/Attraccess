import type {
  AttractapCrashReportRecord,
  AttractapCrashSymbolication,
  NewAttractapCrashReport,
} from '@attraccess/application-models';

export interface AttractapCrashReportStore {
  /** Stores the report and returns it as stored (coredump included). */
  create(report: NewAttractapCrashReport & { attractapId: number }): Promise<AttractapCrashReportRecord>;
  /** The report a reader uploads a coredump to; null unless that reader owns it. */
  findOfReader(reportId: number, readerId: number): Promise<AttractapCrashReportRecord | null>;
  /**
   * The newest report of the reader that still awaits exactly this dump (same size and CRC-32), without
   * the coredump blob.
   */
  findAwaiting(readerId: number, expected: { size: number; crc32: number }): Promise<AttractapCrashReportRecord | null>;
  /**
   * Saves a verified chunked dump on its report, but only while that report still awaits one: status becomes
   * stored and symbolication pending. False when the report no longer waits (stored already, or deleted).
   */
  storeAwaitedCoredump(report: { id: number; attractapId: number }, coredump: Uint8Array): Promise<boolean>;
  updateSymbolication(reportId: number, result: AttractapCrashSymbolication): Promise<void>;
  /** A reader's reports, newest first, without coredump blobs. */
  listForReader(readerId: number): Promise<AttractapCrashReportRecord[]>;
  /** The coredump blob of one report of that reader. */
  findCoredump(readerId: number, reportId: number): Promise<Uint8Array | null>;
}

export const ATTRACTAP_CRASH_REPORT_STORE = Symbol.for('attraccess.attractap.crash-report-store');
