/** How often the list refreshes while a coredump upload or its symbolication is still running. */
export const PENDING_COREDUMP_POLL_INTERVAL_MS = 10_000;
/** Older reports no longer keep the list refreshing: their dump probably will not arrive by itself. */
export const PENDING_COREDUMP_POLL_WINDOW_MS = 60 * 60 * 1000;

/** Marks a coredump the reader found in flash without its boot record (firmware since ATT-1144). */
export const ORPHAN_COREDUMP_REBOOT_REASON = 'COREDUMP_ORPHAN';

interface PendingReport {
  coredumpStatus?: string | null;
  symbolicationStatus?: string | null;
  createdAt: string;
}

/**
 * Whether a recent report still changes on the server: its dump is being uploaded, or stored and being
 * symbolicated (the server stores it before symbolicating).
 */
export function hasPendingCoredump(reports: readonly PendingReport[] | undefined, now = Date.now()): boolean {
  return (reports ?? []).some(
    (report) =>
      (report.coredumpStatus === 'awaiting' || report.symbolicationStatus === 'pending') &&
      now - new Date(report.createdAt).getTime() < PENDING_COREDUMP_POLL_WINDOW_MS,
  );
}
