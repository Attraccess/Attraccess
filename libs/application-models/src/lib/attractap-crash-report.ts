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
