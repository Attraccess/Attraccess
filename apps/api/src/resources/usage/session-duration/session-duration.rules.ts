import { ResourceType, sessionStartOf } from '@attraccess/application-models';
import {
  SessionDurationEstimateExceedsMaximumException,
  SessionDurationEstimateRequiredException,
  SessionExtensionExceedsMaximumException,
  SessionExtensionInvalidException,
  SessionExtensionNotPossibleException,
} from './session-duration.errors';

export const MAX_SESSION_DURATION_MINUTES = 43_200;
export const DEFAULT_SESSION_DURATION_ESTIMATE_MINUTES = 60;
export const SESSION_EXTENSION_STEP_MINUTES = [60, 120, 240, 360, 720, 1440] as const;
/** Minutes before the automatic end at which the owner is warned, largest first. */
export const ENDING_SOON_OFFSETS_MINUTES = [15, 5] as const;
export const MINUTE_MS = 60_000;

export interface SessionDurationSettings {
  type: ResourceType;
  maxSessionDurationMinutes?: number | null;
  requireSessionDurationEstimate?: boolean;
  defaultSessionDurationEstimateMinutes?: number | null;
}

/** What a start stores about its deadline. All null when nothing limits the session. */
export interface SessionDeadline {
  autoEndAt: Date | null;
  /** The hard cap (start + maximum); null when the machine has no maximum. */
  maxAutoEndAt: Date | null;
  estimatedDurationMinutes: number | null;
  autoEndWarnedOffsetMinutes: number | null;
}

export const addMinutes = (date: Date, minutes: number): Date => new Date(date.getTime() + minutes * MINUTE_MS);

/**
 * The offset to record as already sent for a deadline `remainingMinutes` away, so a warning whose time had passed
 * when the deadline was set is skipped. A 10 minute session records 15 and still gets the 5 minute warning.
 */
export function initialWarnedOffset(remainingMinutes: number): number | null {
  const passed = ENDING_SOON_OFFSETS_MINUTES.filter((offset) => offset >= remainingMinutes);
  return passed.length === 0 ? null : Math.min(...passed);
}

/**
 * The deadline of a session starting at `startTime`. `canAsk` tells whether the client can show an estimate input:
 * a start that cannot (headless or old readers) is never refused for the missing estimate and uses the maximum, or
 * the default estimate. Doors ignore all settings. A supplied estimate is ignored where none is required.
 */
export function computeStartDeadline(
  resource: SessionDurationSettings,
  startTime: Date,
  estimate: number | null | undefined,
  canAsk: boolean,
): SessionDeadline {
  const none: SessionDeadline = {
    autoEndAt: null,
    maxAutoEndAt: null,
    estimatedDurationMinutes: null,
    autoEndWarnedOffsetMinutes: null,
  };
  if (resource.type !== ResourceType.Machine) return none;
  const max = resource.maxSessionDurationMinutes ?? null;
  const maxAutoEndAt = max === null ? null : addMinutes(startTime, max);

  let minutes: number | null;
  let estimated: number | null = null;
  if (!resource.requireSessionDurationEstimate) {
    minutes = max;
  } else if (estimate !== undefined && estimate !== null) {
    if (max !== null && estimate > max) throw new SessionDurationEstimateExceedsMaximumException(estimate, max);
    minutes = estimated = estimate;
  } else if (canAsk) {
    throw new SessionDurationEstimateRequiredException(max);
  } else {
    minutes = estimated =
      max ?? resource.defaultSessionDurationEstimateMinutes ?? DEFAULT_SESSION_DURATION_ESTIMATE_MINUTES;
    if (max !== null) minutes = estimated = Math.min(max, minutes);
  }
  if (minutes === null) return none;
  return {
    autoEndAt: addMinutes(startTime, minutes),
    maxAutoEndAt,
    estimatedDurationMinutes: estimated,
    autoEndWarnedOffsetMinutes: initialWarnedOffset(minutes),
  };
}

/** A reader's estimate as a start field: only a whole number of 1 to 43200 minutes counts, anything else is no estimate. */
export function validReaderEstimate(value: unknown): { estimatedDurationMinutes?: number } {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= MAX_SESSION_DURATION_MINUTES
    ? { estimatedDurationMinutes: value }
    : {};
}

export interface ExtensionRequest {
  extendByMinutes?: number;
  toMax?: boolean;
}

/** The latest deadline a session may reach: its maximum, or the absolute 30 day limit when it has none. */
export function extensionCap(session: {
  startTime: Date;
  sessionStartTime?: Date | null;
  maxAutoEndAt: Date | null;
}): Date {
  // A project switch does not move the limit: it counts from the start of the session that was switched.
  return session.maxAutoEndAt ?? addMinutes(sessionStartOf(session), MAX_SESSION_DURATION_MINUTES);
}

/** The new deadline of an extension, or a refusal. Nothing is clipped; `toMax` is the explicit way to the cap. */
export function computeExtension(
  session: { startTime: Date; sessionStartTime?: Date | null; autoEndAt: Date | null; maxAutoEndAt: Date | null },
  request: ExtensionRequest,
  now: Date,
): Date {
  const { autoEndAt } = session;
  if (autoEndAt === null) throw new SessionExtensionNotPossibleException('This session has no automatic end to extend');
  if (autoEndAt.getTime() <= now.getTime()) {
    throw new SessionExtensionNotPossibleException('This session has reached its automatic end');
  }
  const cap = extensionCap(session);
  if (request.toMax) {
    if (session.maxAutoEndAt === null) {
      throw new SessionExtensionNotPossibleException('This machine has no maximum session time');
    }
    if (cap.getTime() <= autoEndAt.getTime()) throw new SessionExtensionExceedsMaximumException(cap);
    return cap;
  }
  const step = request.extendByMinutes;
  if (step === undefined || !(SESSION_EXTENSION_STEP_MINUTES as readonly number[]).includes(step)) {
    throw new SessionExtensionInvalidException();
  }
  const next = addMinutes(autoEndAt, step);
  if (next.getTime() > cap.getTime()) throw new SessionExtensionExceedsMaximumException(cap);
  return next;
}

/** Why the session ends: its estimate, or the machine's maximum when that is the (equal) deadline. */
export type AutoEndReason = 'maximum' | 'estimate';

export const AUTO_END_NOTES: Record<AutoEndReason, string> = {
  maximum: 'Automatically ended: maximum session time reached',
  estimate: 'Automatically ended: estimated duration elapsed',
};

export function autoEndReason(session: { autoEndAt: Date | null; maxAutoEndAt: Date | null }): AutoEndReason {
  return session.maxAutoEndAt !== null &&
    session.autoEndAt !== null &&
    session.autoEndAt.getTime() >= session.maxAutoEndAt.getTime()
    ? 'maximum'
    : 'estimate';
}

/** The cross-field rules of the resource settings, as they will be stored. Doors carry none. */
export function normalizeSessionDurationSettings<
  T extends {
    type: ResourceType;
    maxSessionDurationMinutes: number | null;
    requireSessionDurationEstimate: boolean;
    defaultSessionDurationEstimateMinutes: number | null;
  },
>(resource: T): T {
  if (resource.type === ResourceType.Machine) return resource;
  resource.maxSessionDurationMinutes = null;
  resource.requireSessionDurationEstimate = false;
  resource.defaultSessionDurationEstimateMinutes = null;
  return resource;
}

/** Returns the reason the settings are invalid, or null. Used by create and update with the merged values. */
export function sessionDurationSettingsProblem(resource: SessionDurationSettings): string | null {
  if (resource.type !== ResourceType.Machine) return null;
  const { maxSessionDurationMinutes: max, defaultSessionDurationEstimateMinutes: fallback } = resource;
  if (max !== null && max !== undefined && fallback !== null && fallback !== undefined && fallback > max) {
    return 'The default estimate cannot be longer than the maximum session time';
  }
  return null;
}
