/** Extension steps the API accepts, in minutes. */
export const EXTEND_STEPS_MINUTES = [60, 120, 240, 360, 720, 1440] as const;

export type ExtendStep = (typeof EXTEND_STEPS_MINUTES)[number];

/** The longest a session may ever run (also the cap of machines without a maximum). */
export const ABSOLUTE_LIMIT_MINUTES = 43_200;

const MINUTE_MS = 60_000;

/** The deadline fields of a session, as the API returns them. */
export interface SessionDeadline {
  startTime: string;
  autoEndAt?: string | null;
  maxAutoEndAt?: string | null;
}

/** The latest the automatic end can be moved to: the session's maximum, or the 30 day limit. */
export function extensionCap(session: SessionDeadline): Date {
  return session.maxAutoEndAt
    ? new Date(session.maxAutoEndAt)
    : new Date(new Date(session.startTime).getTime() + ABSOLUTE_LIMIT_MINUTES * MINUTE_MS);
}

/** Whole minutes the deadline can still move; 0 without a deadline. */
export function extensionRoomMinutes(session: SessionDeadline): number {
  if (!session.autoEndAt) return 0;
  return Math.max(0, Math.floor((extensionCap(session).getTime() - new Date(session.autoEndAt).getTime()) / MINUTE_MS));
}

export function splitMinutes(total: number): { hours: number; minutes: number } {
  return { hours: Math.floor(total / 60), minutes: total % 60 };
}

export function joinMinutes(hours: number, minutes: number): number {
  return Math.max(0, hours) * 60 + Math.max(0, minutes);
}

/** "2 h 5 min", "45 min". */
export function formatDuration(totalMinutes: number): string {
  const { hours, minutes } = splitMinutes(Math.max(0, Math.round(totalMinutes)));
  if (hours === 0) return `${minutes} min`;
  return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`;
}
