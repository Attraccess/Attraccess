import { ConflictException } from '@nestjs/common';
import { CHANNEL_ENABLED_CAPABILITY } from '../../shared/capabilities';
import {
  CONFIGURATION_LIMIT_CODE,
  MAX_STATUS_REPORT_BYTES,
  STATUS_ERROR_BUDGET_BYTES,
  STATUS_FIXED_BYTES,
  channelEnabled,
} from '../../shared/configuration-limits';
import type { ConfigurationValidationError } from './model';

/** Stable code for a snapshot with disabled channels sent to a runtime that cannot honour `enabled: false`. */
export const CHANNEL_ENABLED_UNSUPPORTED_CODE = 'channel_enabled_unsupported';

/** Stable message; the frontend translates it by this exact text. */
export const CHANNEL_ENABLED_UNSUPPORTED_MESSAGE =
  'This configuration disables channels, but the CC100 runtime on this controller cannot disable channels. Update the CC100 runtime, or enable every channel before publishing.';

/** Limits a runtime without `channel-enabled-v1` still enforces; it predates the higher ones. */
export const LEGACY_MAX_CONFIGURATION_ITEMS = 256;

/** Stable messages for the older runtime limits; the frontend translates them by this exact text. */
export const LEGACY_RUNTIME_LIMIT_MESSAGES = {
  points:
    'The CC100 runtime on this controller is older and accepts at most 256 physical points. Update the CC100 runtime to use the higher limits, or remove points or devices.',
  channels:
    'The CC100 runtime on this controller is older and accepts at most 256 channels. Update the CC100 runtime to use the higher limits, or remove channels or devices.',
  statusReport:
    'The CC100 runtime on this controller is older and counts every channel ID towards its 64 KiB status report. Update the CC100 runtime to use the higher limits, or shorten channel IDs or remove channels.',
} as const;

function controllerCapabilities(capabilities: string | string[]): string[] {
  if (Array.isArray(capabilities)) return capabilities;
  try {
    const parsed: unknown = JSON.parse(capabilities);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

const supportsChannelEnabled = (capabilities: string | string[]) =>
  controllerCapabilities(capabilities).includes(CHANNEL_ENABLED_CAPABILITY);

function collection(snapshot: unknown, key: 'physicalPoints' | 'logicalChannels'): unknown[] {
  const value = snapshot && typeof snapshot === 'object' ? (snapshot as Record<string, unknown>)[key] : undefined;
  return Array.isArray(value) ? value : [];
}

/**
 * An older runtime rejects `enabled` as an unknown field, so a snapshot that disables any channel goes
 * only to a controller that advertises the capability; this turns that rejection into a clear 409 up
 * front. The snapshot is sent unchanged: stripping disabled channels would break its content hash.
 */
export function channelEnabledErrors(
  snapshot: unknown,
  capabilities: string | string[],
): ConfigurationValidationError[] {
  if (collection(snapshot, 'logicalChannels').every(channelEnabled) || supportsChannelEnabled(capabilities)) return [];
  return [{ path: '$', code: CHANNEL_ENABLED_UNSUPPORTED_CODE, message: CHANNEL_ENABLED_UNSUPPORTED_MESSAGE }];
}

/** The older status report estimate: every channel can appear as input or output, commanded and manual. */
export function legacyWorstCaseStatusReportBytes(snapshot: unknown): number {
  const encoder = new TextEncoder();
  let total = STATUS_FIXED_BYTES + STATUS_ERROR_BUDGET_BYTES;
  for (const channel of collection(snapshot, 'logicalChannels')) {
    const id =
      channel && typeof channel === 'object' && typeof (channel as { id?: unknown }).id === 'string'
        ? (channel as { id: string }).id
        : '';
    const idBytes = encoder.encode(JSON.stringify(id)).byteLength;
    total += (idBytes + 7) * 2 + idBytes + 1;
  }
  return total;
}

/**
 * The lower limits a runtime without `channel-enabled-v1` enforces on top of the current ones. Such a
 * runtime would otherwise reject a snapshot the server accepted with `configuration_limit_exceeded`.
 */
export function legacyRuntimeLimitErrors(
  snapshot: unknown,
  capabilities: string | string[],
): ConfigurationValidationError[] {
  if (supportsChannelEnabled(capabilities)) return [];
  const error = (message: string) => ({ path: '$', code: CONFIGURATION_LIMIT_CODE, message });
  const errors: ConfigurationValidationError[] = [];
  if (collection(snapshot, 'physicalPoints').length > LEGACY_MAX_CONFIGURATION_ITEMS)
    errors.push(error(LEGACY_RUNTIME_LIMIT_MESSAGES.points));
  if (collection(snapshot, 'logicalChannels').length > LEGACY_MAX_CONFIGURATION_ITEMS)
    errors.push(error(LEGACY_RUNTIME_LIMIT_MESSAGES.channels));
  if (legacyWorstCaseStatusReportBytes(snapshot) > MAX_STATUS_REPORT_BYTES)
    errors.push(error(LEGACY_RUNTIME_LIMIT_MESSAGES.statusReport));
  return errors;
}

/** Everything that keeps this snapshot from running on this controller's runtime. */
export function runtimeSupportErrors(
  snapshot: unknown,
  capabilities: string | string[],
): ConfigurationValidationError[] {
  return [...channelEnabledErrors(snapshot, capabilities), ...legacyRuntimeLimitErrors(snapshot, capabilities)];
}

/** Throws a 409 when `runtimeSupportErrors` reports the snapshot cannot go to this controller. */
export function requireRuntimeSupport(snapshot: unknown, capabilities: string | string[]): void {
  const errors = runtimeSupportErrors(snapshot, capabilities);
  if (errors.length) throw new ConflictException({ message: errors[0].message, code: errors[0].code, errors });
}
