/** Reset reasons that count as a confirmed crash or watchdog reset. */
export const CRASH_WATCHDOG_REASONS = ['PANIC', 'INT_WDT', 'TASK_WDT', 'WDT'] as const;
/** Reset reasons that count as a power-on reset. */
export const POWER_ON_REASONS = ['POWERON'] as const;

export type ResetReportCategory = 'crash_watchdog' | 'power_on';
export const RESET_REPORT_CATEGORIES: readonly ResetReportCategory[] = ['crash_watchdog', 'power_on'];

export interface ResetReportRow {
  attractapId: number;
  readerName: string | null;
  resetReason: string;
  count: number;
}

export function categoryOf(resetReason: string): ResetReportCategory | null {
  if ((CRASH_WATCHDOG_REASONS as readonly string[]).includes(resetReason)) return 'crash_watchdog';
  if ((POWER_ON_REASONS as readonly string[]).includes(resetReason)) return 'power_on';
  return null;
}

/** SQLite stores createdAt as UTC "YYYY-MM-DD HH:MM:SS" (optionally with ".mmm"). */
function sqliteTimestamp(epochSeconds: number, fraction: string): string {
  return `${new Date(epochSeconds * 1000).toISOString().slice(0, 19).replace('T', ' ')}${fraction}`;
}

/**
 * Window (now - 3600s, now] in whole seconds. The ".999" suffix makes a stored value at
 * the boundary second compare as "not newer", with or without milliseconds.
 */
export function hourWindow(nowMs: number): { from: string; to: string } {
  const nowSeconds = Math.floor(nowMs / 1000);
  return { from: sqliteTimestamp(nowSeconds - 3600, '.999'), to: sqliteTimestamp(nowSeconds, '.999') };
}

/** Longest reader name kept in the alert text. */
export const MAX_READER_NAME_LENGTH = 40;
/**
 * Budget for the reader list. Pushover cuts messages at 1024 characters; the longest description
 * (power-on) plus summary, severity, time and the Silence/View links take about 750 of them with a
 * 40-character Grafana URL, so 200 leaves room for longer URLs.
 */
export const MAX_READERS_TEXT_LENGTH = 200;

/** Reader names are free text; drop "<" and ">" because Pushover renders the message as HTML. */
function readerLabel(row: ResetReportRow): string {
  const name = (row.readerName ?? 'unknown').replace(/[<>]/g, '').trim() || 'unknown';
  const chars = Array.from(name);
  const short = chars.length > MAX_READER_NAME_LENGTH ? `${chars.slice(0, MAX_READER_NAME_LENGTH - 1).join('')}…` : name;
  return `${short} (#${row.attractapId})`;
}

export function describeReaders(rows: ResetReportRow[]): string {
  const perReader = new Map<string, string[]>();
  for (const row of rows) {
    const reader = readerLabel(row);
    const reasons = perReader.get(reader) ?? [];
    reasons.push(`${row.resetReason} x${row.count}`);
    perReader.set(reader, reasons);
  }
  const entries = [...perReader.entries()].map(([reader, reasons]) => `${reader}: ${reasons.sort().join(', ')}`).sort();
  const shown: string[] = [];
  for (const entry of entries) {
    if (shown.length > 0 && [...shown, entry].join('; ').length > MAX_READERS_TEXT_LENGTH) break;
    shown.push(entry);
  }
  const hidden = entries.length - shown.length;
  return hidden > 0 ? `${shown.join('; ')}; +${hidden} more` : shown.join('; ');
}
