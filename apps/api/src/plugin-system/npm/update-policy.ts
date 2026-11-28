import { BadRequestException } from '@nestjs/common';
import type { PluginUpdateSchedule } from '@attraccess/shared';

import { isValidTimeZone } from '../../attractap/websockets/reader-time-zone';

export const UPDATE_POLICY_KEY = 'update-policy';

export const UPDATE_STEPS = ['patch', 'minor', 'follow'] as const;

export type PluginUpdatePolicy = {
  /** Whether the host looks for newer versions. Looking never installs anything. */
  checksEnabled: boolean;
  /** The one switch that lets the host install updates and restart on its own. Off until a plugin manager sets it. */
  automaticUpdates: boolean;
  /** How large a step an update may take. A plugin's own `updateOverride` replaces it. */
  mode: (typeof UPDATE_STEPS)[number];
  /** When automatic updates may install and restart. */
  schedule: PluginUpdateSchedule;
  prerelease: boolean;
};

export const DEFAULT_PLUGIN_UPDATE_POLICY: PluginUpdatePolicy = {
  checksEnabled: true,
  automaticUpdates: false,
  mode: 'minor',
  schedule: { weekdays: [], startMinute: 180, durationMinutes: 120, timeZone: null },
  prerelease: false,
};

const EVERY_WEEKDAY = [1, 2, 3, 4, 5, 6, 7];

function record(value: unknown, what: string, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new BadRequestException(`${what} must be an object`);
  const unknown = Object.keys(value).filter((key) => !keys.includes(key));
  if (unknown.length > 0) throw new BadRequestException(`Unknown ${what} field: ${unknown.join(', ')}`);
  return value as Record<string, unknown>;
}

// No coercion: the string "false" must never switch anything on.
function flag(value: unknown, name: string): boolean {
  if (typeof value !== 'boolean') throw new BadRequestException(`${name} must be true or false`);
  return value;
}

function integerBetween(value: unknown, minimum: number, maximum: number, name: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < minimum || value > maximum)
    throw new BadRequestException(`${name} must be a whole number from ${minimum} to ${maximum}`);
  return value;
}

function parseSchedule(value: unknown): PluginUpdateSchedule {
  const schedule = record(value, 'schedule', Object.keys(DEFAULT_PLUGIN_UPDATE_POLICY.schedule));
  if (!Array.isArray(schedule.weekdays)) throw new BadRequestException('weekdays must be a list');
  const weekdays = schedule.weekdays.map((day) => integerBetween(day, 1, 7, 'Each weekday (1 = Monday)'));
  const timeZone = schedule.timeZone ?? null;
  if (timeZone !== null && !isValidTimeZone(timeZone))
    throw new BadRequestException('timeZone must be an IANA time zone name such as Europe/Berlin');
  return {
    weekdays: [...new Set(weekdays)].sort((left, right) => left - right),
    startMinute: integerBetween(schedule.startMinute, 0, 24 * 60 - 1, 'startMinute'),
    durationMinutes: integerBetween(schedule.durationMinutes, 1, 24 * 60, 'durationMinutes'),
    timeZone: timeZone as string | null,
  };
}

function parseUpdatePolicy(value: unknown): PluginUpdatePolicy {
  const policy = record(value, 'update policy', Object.keys(DEFAULT_PLUGIN_UPDATE_POLICY));
  const mode = UPDATE_STEPS.find((step) => step === policy.mode);
  if (!mode) throw new BadRequestException(`mode must be one of ${UPDATE_STEPS.join(', ')}`);
  const parsed: PluginUpdatePolicy = {
    checksEnabled: flag(policy.checksEnabled, 'checksEnabled'),
    automaticUpdates: flag(policy.automaticUpdates, 'automaticUpdates'),
    mode,
    schedule: parseSchedule(policy.schedule),
    prerelease: flag(policy.prerelease, 'prerelease'),
  };
  if (parsed.automaticUpdates && parsed.schedule.weekdays.length === 0)
    throw new BadRequestException('Automatic updates need at least one weekday');
  return parsed;
}

/** `current` with the fields `patch` names replaced, the schedule field by field. Throws on anything invalid. */
export function patchUpdatePolicy(current: PluginUpdatePolicy, patch: unknown): PluginUpdatePolicy {
  const changes = record(patch, 'update policy', Object.keys(DEFAULT_PLUGIN_UPDATE_POLICY));
  const schedule =
    changes.schedule === undefined
      ? current.schedule
      : { ...current.schedule, ...record(changes.schedule, 'schedule', Object.keys(current.schedule)) };
  return parseUpdatePolicy({ ...current, ...changes, schedule });
}

/**
 * A policy saved before automatic updates became opt-in. Saving one never meant agreeing to unattended installs, so
 * automatic updates come out off. Whether the host checks is kept, and the old daily window becomes a schedule on
 * every weekday in UTC, so that nothing has to be typed again.
 */
function fromLegacyPolicy(stored: Record<string, unknown>): PluginUpdatePolicy {
  const defaults = DEFAULT_PLUGIN_UPDATE_POLICY;
  let schedule = defaults.schedule;
  try {
    const window = stored.maintenanceWindow as Record<string, unknown>;
    schedule = parseSchedule({
      weekdays: EVERY_WEEKDAY,
      startMinute: window?.startMinute,
      durationMinutes: window?.durationMinutes,
      timeZone: 'UTC',
    });
  } catch {
    // Without a usable window there is nothing to keep.
  }
  return {
    ...defaults,
    checksEnabled: typeof stored.checksEnabled === 'boolean' ? stored.checksEnabled : defaults.checksEnabled,
    mode: UPDATE_STEPS.find((step) => step === stored.mode) ?? defaults.mode,
    prerelease: typeof stored.prerelease === 'boolean' ? stored.prerelease : defaults.prerelease,
    schedule,
  };
}

/** The stored setting as a policy; `legacy` marks one saved before the opt-in, which the host rewrites at boot. */
export function readStoredUpdatePolicy(raw: string | null | undefined): {
  policy: PluginUpdatePolicy;
  legacy: boolean;
} {
  const fallback = { policy: DEFAULT_PLUGIN_UPDATE_POLICY, legacy: false };
  if (!raw) return fallback;
  let stored: Record<string, unknown>;
  try {
    stored = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return fallback;
  }
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return fallback;
  // Only this version writes the switch, so its absence identifies every earlier policy, and only those.
  if (!('automaticUpdates' in stored)) return { policy: fromLegacyPolicy(stored), legacy: true };
  try {
    return { policy: parseUpdatePolicy(stored), legacy: false };
  } catch {
    // No longer valid (e.g. the runtime stopped knowing the zone): automatic updates are off, but a plugin manager who
    // switched the checks off, for instance to stop registry requests, keeps them off.
    const checksEnabled = stored.checksEnabled === false ? false : DEFAULT_PLUGIN_UPDATE_POLICY.checksEnabled;
    return { policy: { ...DEFAULT_PLUGIN_UPDATE_POLICY, checksEnabled }, legacy: false };
  }
}

export function sameUpdatePolicy(left: PluginUpdatePolicy, right: PluginUpdatePolicy): boolean {
  // Both come from this module, which builds the fields in one order.
  return JSON.stringify(left) === JSON.stringify(right);
}
