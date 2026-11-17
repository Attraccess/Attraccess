import { formatDurationMs } from '@attraccess/shared';

/** null means "operating data unavailable" (ATT-1027 semantics) — never render it as 0. */
export function formatDuration(durationMs: number | null | undefined, unavailable: string): string {
  return durationMs === null || durationMs === undefined ? unavailable : formatDurationMs(durationMs);
}
