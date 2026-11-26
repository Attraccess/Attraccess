import type { PluginUpdatePolicy } from './package-models';

/**
 * When the maintenance window that contains `now` opened, or null outside a window. `startMinute` is a minute of the
 * day in the server's local time (UTC in the official containers unless `TZ` is set); a window may cross midnight.
 */
export function maintenanceWindowStart(window: PluginUpdatePolicy['maintenanceWindow'], now: Date): Date | null {
  const minuteOfDay = now.getHours() * 60 + now.getMinutes();
  const minutesOpen = (minuteOfDay - window.startMinute + 24 * 60) % (24 * 60);
  if (minutesOpen >= window.durationMinutes) return null;
  const start = new Date(now);
  start.setSeconds(0, 0);
  return new Date(start.getTime() - minutesOpen * 60_000);
}
