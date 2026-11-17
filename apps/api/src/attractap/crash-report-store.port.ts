import type {
  AttractapCrashReportRecord,
  AttractapCrashSymbolication,
  NewAttractapCrashReport,
} from '@attraccess/application-models';

export interface AttractapCrashReportStore {
  /** Stores the report and returns it as stored (coredump included). */
  create(report: NewAttractapCrashReport & { attractapId: number }): Promise<AttractapCrashReportRecord>;
  updateSymbolication(reportId: number, result: AttractapCrashSymbolication): Promise<void>;
  /** A reader's reports, newest first, without coredump blobs. */
  listForReader(readerId: number): Promise<AttractapCrashReportRecord[]>;
  /** The coredump blob of one report of that reader. */
  findCoredump(readerId: number, reportId: number): Promise<Uint8Array | null>;
}

export const ATTRACTAP_CRASH_REPORT_STORE = Symbol.for('attraccess.attractap.crash-report-store');
