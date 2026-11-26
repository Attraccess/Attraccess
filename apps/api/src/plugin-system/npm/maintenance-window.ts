import type { PluginUpdatePolicy } from './package-models';

/**
 * When the maintenance window that contains `now` opened, or null outside a window. `startMinute` is a minute of the
 * day in the server's local time (UTC in the official containers unless `TZ` is set); a window may cross midnight.
 * The start is a local clock time and the duration elapsed time, so a daylight saving change does not move the start.
 */
export function maintenanceWindowStart(window: PluginUpdatePolicy['maintenanceWindow'], now: Date): Date | null {
  const always = window.durationMinutes >= 24 * 60;
  const start = new Date(now);
  start.setHours(0, window.startMinute, 0, 0);
  if (start.getTime() > now.getTime()) {
    start.setDate(start.getDate() - 1);
    start.setHours(0, window.startMinute, 0, 0);
  }
  return always || now.getTime() - start.getTime() < window.durationMinutes * 60_000 ? start : null;
}
