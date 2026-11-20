/** Counts the gauge metrics start from when the application boots. */
export interface InitialGaugeCounts {
  users: number;
  resources: number;
  projects: number;
  resourceGroups: number;
  mqttServers: number;
  activeUsageSessions: number;
  activeAuthSessions: number;
  usersPerLocale: Array<{ locale: string | null; count: number }>;
}

export const GAUGE_COUNT_READER = Symbol.for('attraccess.metrics.gauge-count-reader');

export interface GaugeCountReader {
  readInitialGaugeCounts(): Promise<InitialGaugeCounts>;
}

/** One reader and reset reason with the number of reset reports in a window. */
export interface ResetReportCount {
  attractapId: number;
  readerName: string | null;
  resetReason: string;
  count: number;
}

/** A window in whole epoch seconds: reports created after `fromSeconds` and up to `toSeconds` count. */
export interface ResetReportWindow {
  fromSeconds: number;
  toSeconds: number;
}

export const RESET_REPORT_COUNT_READER = Symbol.for('attraccess.metrics.reset-report-count-reader');

export interface ResetReportCountReader {
  /** Counts stored reset reports of the given reasons per reader and reason. */
  countByReaderAndReason(window: ResetReportWindow, reasons: readonly string[]): Promise<ResetReportCount[]>;
}
