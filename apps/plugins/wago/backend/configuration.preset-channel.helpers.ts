import type { WagoPresetApplication } from './configuration.contracts';
import type { WagoConfigurationSnapshot } from './configuration.contracts';
import type { ConfigurationValidationError } from './configuration.contracts';
import { exactKeys } from './configuration.add-id.helpers';
import { ENGINEERING_UNITS } from '../measurement-contract';
import { enumValue } from './configuration.add-id.helpers';

export function presetChannel(
  application: WagoPresetApplication,
): WagoConfigurationSnapshot['logicalChannels'][number] {
  const base = {
    id: application.channelId,
    physicalPointId: application.physicalPointId,
    profile: application.presetId,
    disconnectPolicy: { mode: application.presetId === 'generic-monitored-input' ? 'hold' : 'immediate' } as const,
  };
  switch (application.presetId) {
    case 'metered-switched-load':
      return { ...base, capabilities: ['output', 'measurement'], measurement: { unit: 'watt', scale: 1, offset: 0 } };
    case 'pulsed-lock-bank':
      return { ...base, capabilities: ['output', 'pulse'], pulse: { durationMs: 500 } };
    case 'guarded-enable-request':
      if (!application.guardChannelId) throw new Error('guarded enable requests require a guard channel');
      return {
        ...base,
        capabilities: ['output', 'guard'],
        guard: { channelId: application.guardChannelId, when: 'on' as const },
      };
    case 'generic-monitored-input':
      return { ...base, capabilities: ['input'] };
    case 'generic-digital-output':
      return {
        ...base,
        capabilities: application.feedbackChannelId ? ['output', 'feedback'] : ['output'],
        ...(application.feedbackChannelId
          ? { feedback: { channelId: application.feedbackChannelId, expected: 'match' as const, timeoutMs: 1_000 } }
          : {}),
      };
  }
}

export function record(
  value: unknown,
  path: string,
  errors: ConfigurationValidationError[],
): value is Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return true;
  errors.push({ path, code: 'invalid_object', message: `${path} must be an object` });
  return false;
}

export function referenceError(path: string, type: string, id: unknown): ConfigurationValidationError {
  return { path, code: 'missing_reference', message: `${type} ${String(id)} does not exist in this snapshot` };
}
export function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, sortValue(item)]),
  );
}

export function validateDisconnectPolicy(value: unknown, path: string, errors: ConfigurationValidationError[]): void {
  if (!record(value, path, errors)) return;
  exactKeys(value, path, ['mode', 'timeoutMs'], errors, ['timeoutMs']);
  if (!['hold', 'immediate', 'watchdog'].includes(value.mode as string))
    errors.push({
      path: `${path}.mode`,
      code: 'unsupported_value',
      message: 'mode must be hold, immediate, or watchdog',
    });
  if (value.mode === 'watchdog' && (!Number.isSafeInteger(value.timeoutMs) || (value.timeoutMs as number) <= 0))
    errors.push({
      path: `${path}.timeoutMs`,
      code: 'required_field',
      message: 'watchdog timeoutMs must be a positive integer',
    });
  if (value.mode !== 'watchdog' && value.timeoutMs !== undefined)
    errors.push({
      path: `${path}.timeoutMs`,
      code: 'unsupported_field',
      message: 'timeoutMs is only valid for watchdog policies',
    });
}

export function validateFeedback(
  value: unknown,
  path: string,
  capabilities: Set<string>,
  currentChannelId: unknown,
  channelsById: Map<string, Record<string, unknown>>,
  errors: ConfigurationValidationError[],
): void {
  if (value === undefined) return;
  if (!record(value, path, errors)) return;
  exactKeys(value, path, ['channelId', 'expected', 'timeoutMs'], errors);
  const feedbackChannel = typeof value.channelId === 'string' ? channelsById.get(value.channelId) : undefined;
  if (!feedbackChannel) errors.push(referenceError(`${path}.channelId`, 'logical channel', value.channelId));
  else if (
    value.channelId === currentChannelId ||
    !Array.isArray(feedbackChannel.capabilities) ||
    !feedbackChannel.capabilities.includes('input')
  )
    errors.push({
      path: `${path}.channelId`,
      code: 'invalid_feedback_channel',
      message: 'feedback must reference a distinct input channel',
    });
  if (!['match', 'inverse'].includes(value.expected as string))
    errors.push({ path: `${path}.expected`, code: 'unsupported_value', message: 'expected must be match or inverse' });
  if (!Number.isSafeInteger(value.timeoutMs) || (value.timeoutMs as number) <= 0)
    errors.push({
      path: `${path}.timeoutMs`,
      code: 'invalid_timeout',
      message: 'timeoutMs must be a positive integer',
    });
  if (!capabilities.has('feedback'))
    errors.push({ path, code: 'unsupported_field', message: 'feedback requires feedback capability' });
}

export function validateGuard(
  value: unknown,
  path: string,
  capabilities: Set<string>,
  channelIds: Set<string>,
  errors: ConfigurationValidationError[],
): void {
  if (value === undefined) return;
  if (!record(value, path, errors)) return;
  exactKeys(value, path, ['channelId', 'when'], errors);
  if (typeof value.channelId !== 'string' || !channelIds.has(value.channelId))
    errors.push(referenceError(`${path}.channelId`, 'logical channel', value.channelId));
  if (!['on', 'off'].includes(value.when as string))
    errors.push({ path: `${path}.when`, code: 'unsupported_value', message: 'when must be on or off' });
  if (!capabilities.has('guard'))
    errors.push({ path, code: 'unsupported_field', message: 'guard requires guard capability' });
}

export function validateMeasurement(
  value: unknown,
  path: string,
  capabilities: Set<string>,
  errors: ConfigurationValidationError[],
): void {
  if (value === undefined) return;
  if (!record(value, path, errors)) return;
  exactKeys(value, path, ['unit', 'scale', 'offset', 'kind'], errors, ['kind']);
  enumValue(value.unit, `${path}.unit`, ENGINEERING_UNITS, errors);
  if (!Number.isFinite(value.scale) || !Number.isFinite(value.offset))
    errors.push({ path, code: 'invalid_measurement', message: 'scale and offset must be finite numbers' });
  if (value.kind !== undefined && !['live', 'cumulative'].includes(value.kind as string))
    errors.push({ path: `${path}.kind`, code: 'unsupported_value', message: 'kind must be live or cumulative' });
  if (!capabilities.has('measurement'))
    errors.push({ path, code: 'unsupported_field', message: 'measurement requires measurement capability' });
}
