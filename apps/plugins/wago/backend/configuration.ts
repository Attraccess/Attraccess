import { createHash } from 'node:crypto';
import { CONFIGURATION_PROTOCOL_VERSION } from './protocol';

export { CONFIGURATION_PROTOCOL_VERSION } from './protocol';

const HARDWARE_PROFILES = ['751-9301', '879-3000', '879-1300'] as const;
const CHANNEL_PROFILES = [
  'metered-switched-load',
  'pulsed-lock-bank',
  'guarded-enable-request',
  'generic-digital-output',
  'generic-monitored-input',
] as const;
const CAPABILITIES = ['output', 'input', 'measurement', 'pulse', 'guard', 'feedback'] as const;

export const WAGO_PRESETS = [
  {
    id: 'metered-switched-load',
    name: 'Metered switched load',
    description: 'Switches an output off immediately when disconnected and reports a transformed measurement.',
  },
  {
    id: 'pulsed-lock-bank',
    name: 'Pulsed lock bank',
    description: 'Pulses an output briefly and returns it to off immediately when disconnected.',
  },
  {
    id: 'guarded-enable-request',
    name: 'Guarded enable request',
    description: 'Makes a non-safety enable request only while an operational guard is satisfied.',
  },
  { id: 'generic-digital-output', name: 'Generic digital output', description: 'A conservative output foundation.' },
  { id: 'generic-monitored-input', name: 'Generic monitored input', description: 'A monitored digital input foundation.' },
] as const;

export interface WagoConfigurationSnapshot {
  version: typeof CONFIGURATION_PROTOCOL_VERSION;
  physicalPoints: Array<{ id: string; hardwareProfile: (typeof HARDWARE_PROFILES)[number]; channel: number }>;
  logicalChannels: Array<{
    id: string;
    physicalPointId: string;
    profile: (typeof CHANNEL_PROFILES)[number];
    capabilities: Array<(typeof CAPABILITIES)[number]>;
    disconnectPolicy: { mode: 'hold' | 'immediate' | 'watchdog'; timeoutMs?: number };
    range?: { minimum: number; maximum: number };
    pulse?: { durationMs: number };
    guard?: { channelId: string; when: 'on' | 'off' };
    feedback?: { channelId: string; expected: 'match' | 'inverse'; timeoutMs: number };
    measurement?: { unit: 'ampere' | 'volt' | 'watt' | 'percent'; scale: number; offset: number };
  }>;
}

export type WagoPresetId = (typeof WAGO_PRESETS)[number]['id'];
export interface WagoPresetApplication {
  presetId: WagoPresetId;
  channelId: string;
  physicalPointId: string;
  guardChannelId?: string;
  feedbackChannelId?: string;
}

export function applyPreset(snapshot: WagoConfigurationSnapshot, application: WagoPresetApplication): WagoConfigurationSnapshot {
  const preset = application && WAGO_PRESETS.find((item) => item.id === application.presetId);
  if (!preset) throw new Error('unknown WAGO preset');
  const channel = presetChannel(application);
  const existingIndex = snapshot.logicalChannels.findIndex((item) => item.id === application.channelId);
  const logicalChannels = [...snapshot.logicalChannels];
  if (existingIndex === -1) logicalChannels.push(channel);
  else logicalChannels[existingIndex] = channel;
  return { ...snapshot, logicalChannels };
}

export interface ConfigurationValidationError {
  path: string;
  code: string;
  message: string;
}

export interface ConfigurationDiff {
  path: string;
  previous: unknown;
  current: unknown;
}

export interface WagoConfigurationReport {
  revision: number;
  contentHash: string;
  errors: ConfigurationValidationError[];
}

export function canonicalSnapshot(snapshot: unknown): string {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot))
    throw new Error('configuration snapshot must be an object');
  return JSON.stringify(sortValue(snapshot));
}

export function configurationHash(snapshot: unknown): string {
  return createHash('sha256').update(canonicalSnapshot(snapshot)).digest('hex');
}

export function configurationDiff(previous: unknown, current: unknown): ConfigurationDiff[] {
  const changes: ConfigurationDiff[] = [];
  diffValue('$', previous, current, changes);
  return changes;
}

export function parseConfigurationReport(value: unknown): WagoConfigurationReport | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const report = value as Record<string, unknown>;
  if (
    !Number.isSafeInteger(report.revision) ||
    (report.revision as number) < 1 ||
    typeof report.contentHash !== 'string' ||
    !report.contentHash.trim() ||
    (report.errors !== undefined && !Array.isArray(report.errors))
  )
    return null;
  const errors = report.errors ?? [];
  if (!errors.every(isConfigurationValidationError)) return null;
  return { revision: report.revision as number, contentHash: report.contentHash, errors };
}

export function validateSnapshot(snapshot: unknown): ConfigurationValidationError[] {
  let value: Record<string, unknown>;
  try {
    value = JSON.parse(canonicalSnapshot(snapshot)) as Record<string, unknown>;
  } catch (error) {
    return [
      { path: '$', code: 'invalid_snapshot', message: error instanceof Error ? error.message : 'invalid snapshot' },
    ];
  }
  const errors: ConfigurationValidationError[] = [];
  exactKeys(value, '$', ['version', 'physicalPoints', 'logicalChannels'], errors);
  if (value.version !== CONFIGURATION_PROTOCOL_VERSION)
    errors.push({
      path: 'version',
      code: 'unsupported_version',
      message: `version must be ${CONFIGURATION_PROTOCOL_VERSION}`,
    });
  const points = collection(value.physicalPoints, 'physicalPoints', errors);
  const channels = collection(value.logicalChannels, 'logicalChannels', errors);
  const pointIds = new Set<string>();
  const channelIds = new Set<string>();
  const channelsById = new Map<string, Record<string, unknown>>();

  points.forEach((point, index) => {
    const path = `physicalPoints[${index}]`;
    if (!record(point, path, errors)) return;
    exactKeys(point, path, ['id', 'hardwareProfile', 'channel'], errors);
    addId(point.id, `${path}.id`, pointIds, errors);
    enumValue(point.hardwareProfile, `${path}.hardwareProfile`, HARDWARE_PROFILES, errors);
    if (!Number.isSafeInteger(point.channel) || point.channel < 0)
      errors.push({
        path: `${path}.channel`,
        code: 'invalid_channel',
        message: 'channel must be a non-negative integer',
      });
  });

  channels.forEach((channel, index) => {
    if (channel && typeof channel === 'object' && !Array.isArray(channel)) {
      const item = channel as Record<string, unknown>;
      addId(item.id, `logicalChannels[${index}].id`, channelIds, errors);
      if (typeof item.id === 'string') channelsById.set(item.id, item);
    }
  });

  channels.forEach((channel, index) => {
    const path = `logicalChannels[${index}]`;
    if (!record(channel, path, errors)) return;
    exactKeys(
      channel,
      path,
      [
        'id',
        'physicalPointId',
        'profile',
        'capabilities',
        'disconnectPolicy',
        'range',
        'pulse',
        'guard',
        'feedback',
        'measurement',
      ],
      errors,
    );
    if (typeof channel.physicalPointId !== 'string' || !pointIds.has(channel.physicalPointId))
      errors.push(referenceError(`${path}.physicalPointId`, 'physical point', channel.physicalPointId));
    enumValue(channel.profile, `${path}.profile`, CHANNEL_PROFILES, errors);
    const capabilities = capabilityList(channel.capabilities, `${path}.capabilities`, errors);
    validateDisconnectPolicy(channel.disconnectPolicy, `${path}.disconnectPolicy`, errors);
    validateRange(channel.range, `${path}.range`, capabilities, errors);
    validatePulse(channel.pulse, `${path}.pulse`, capabilities, errors);
    validateGuard(channel.guard, `${path}.guard`, capabilities, channelIds, errors);
    validateFeedback(channel.feedback, `${path}.feedback`, capabilities, channel.id, channelsById, errors);
    validateMeasurement(channel.measurement, `${path}.measurement`, capabilities, errors);
    validateProfile(channel.profile, capabilities, path, errors);
  });
  return errors;
}

function diffValue(path: string, previous: unknown, current: unknown, changes: ConfigurationDiff[]): void {
  if (Object.is(previous, current)) return;
  if (Array.isArray(previous) && Array.isArray(current)) {
    const length = Math.max(previous.length, current.length);
    for (let index = 0; index < length; index += 1)
      diffValue(`${path}[${index}]`, previous[index], current[index], changes);
    return;
  }
  if (isRecord(previous) && isRecord(current)) {
    const keys = new Set([...Object.keys(previous), ...Object.keys(current)]);
    for (const key of [...keys].sort()) diffValue(`${path}.${key}`, previous[key], current[key], changes);
    return;
  }
  changes.push({ path, previous, current });
}

function isConfigurationValidationError(value: unknown): value is ConfigurationValidationError {
  return (
    isRecord(value) &&
    typeof value.path === 'string' &&
    Boolean(value.path.trim()) &&
    typeof value.code === 'string' &&
    Boolean(value.code.trim()) &&
    typeof value.message === 'string' &&
    Boolean(value.message.trim())
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function collection(value: unknown, path: string, errors: ConfigurationValidationError[]): unknown[] {
  if (!Array.isArray(value)) {
    errors.push({ path, code: 'invalid_collection', message: `${path} must be an array` });
    return [];
  }
  return value;
}

function record(
  value: unknown,
  path: string,
  errors: ConfigurationValidationError[],
): value is Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return true;
  errors.push({ path, code: 'invalid_object', message: `${path} must be an object` });
  return false;
}

function exactKeys(
  value: Record<string, unknown>,
  path: string,
  allowed: readonly string[],
  errors: ConfigurationValidationError[],
  optional: readonly string[] = [],
): void {
  Object.keys(value)
    .filter((key) => !allowed.includes(key))
    .forEach((key) =>
      errors.push({
        path: path === '$' ? key : `${path}.${key}`,
        code: 'unknown_field',
        message: 'field is not supported by configuration version 1',
      }),
    );
  allowed
    .filter((key) => !['range', 'pulse', 'guard', 'feedback', 'measurement', ...optional].includes(key) && !(key in value))
    .forEach((key) =>
      errors.push({
        path: path === '$' ? key : `${path}.${key}`,
        code: 'required_field',
        message: 'field is required',
      }),
    );
}

function addId(value: unknown, path: string, ids: Set<string>, errors: ConfigurationValidationError[]): void {
  if (typeof value !== 'string' || !value.trim()) {
    errors.push({ path, code: 'invalid_id', message: 'id must be a non-empty string' });
    return;
  }
  if (ids.has(value)) errors.push({ path, code: 'duplicate_id', message: `duplicate id ${value}` });
  ids.add(value);
}

function enumValue(
  value: unknown,
  path: string,
  options: readonly string[],
  errors: ConfigurationValidationError[],
): void {
  if (!options.includes(value as string))
    errors.push({ path, code: 'unsupported_value', message: `must be one of: ${options.join(', ')}` });
}

function capabilityList(value: unknown, path: string, errors: ConfigurationValidationError[]): Set<string> {
  if (!Array.isArray(value) || !value.length) {
    errors.push({ path, code: 'invalid_capabilities', message: 'capabilities must be a non-empty array' });
    return new Set();
  }
  const capabilities = new Set<string>();
  value.forEach((item, index) => {
    if (!CAPABILITIES.includes(item as (typeof CAPABILITIES)[number]))
      errors.push({
        path: `${path}[${index}]`,
        code: 'unsupported_capability',
        message: `must be one of: ${CAPABILITIES.join(', ')}`,
      });
    else if (capabilities.has(item as string))
      errors.push({ path: `${path}[${index}]`, code: 'duplicate_capability', message: `duplicate capability ${item}` });
    else capabilities.add(item as string);
  });
  return capabilities;
}

function validateDisconnectPolicy(value: unknown, path: string, errors: ConfigurationValidationError[]): void {
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

function validateRange(
  value: unknown,
  path: string,
  capabilities: Set<string>,
  errors: ConfigurationValidationError[],
): void {
  if (value === undefined) return;
  if (!record(value, path, errors)) return;
  exactKeys(value, path, ['minimum', 'maximum'], errors);
  if (
    !Number.isFinite(value.minimum) ||
    !Number.isFinite(value.maximum) ||
    (value.minimum as number) >= (value.maximum as number)
  )
    errors.push({
      path,
      code: 'invalid_range',
      message: 'minimum and maximum must be finite numbers where minimum is less than maximum',
    });
  if (!capabilities.has('input') && !capabilities.has('measurement'))
    errors.push({ path, code: 'unsupported_field', message: 'range requires input or measurement capability' });
}

function validatePulse(
  value: unknown,
  path: string,
  capabilities: Set<string>,
  errors: ConfigurationValidationError[],
): void {
  if (value === undefined) return;
  if (!record(value, path, errors)) return;
  exactKeys(value, path, ['durationMs'], errors);
  if (!Number.isSafeInteger(value.durationMs) || (value.durationMs as number) <= 0)
    errors.push({
      path: `${path}.durationMs`,
      code: 'invalid_duration',
      message: 'durationMs must be a positive integer',
    });
  if (!capabilities.has('pulse'))
    errors.push({ path, code: 'unsupported_field', message: 'pulse requires pulse capability' });
}

function validateGuard(
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

function validateMeasurement(
  value: unknown,
  path: string,
  capabilities: Set<string>,
  errors: ConfigurationValidationError[],
): void {
  if (value === undefined) return;
  if (!record(value, path, errors)) return;
  exactKeys(value, path, ['unit', 'scale', 'offset'], errors);
  enumValue(value.unit, `${path}.unit`, ['ampere', 'volt', 'watt', 'percent'], errors);
  if (!Number.isFinite(value.scale) || !Number.isFinite(value.offset))
    errors.push({ path, code: 'invalid_measurement', message: 'scale and offset must be finite numbers' });
  if (!capabilities.has('measurement'))
    errors.push({ path, code: 'unsupported_field', message: 'measurement requires measurement capability' });
}

function validateFeedback(
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
  if (!feedbackChannel)
    errors.push(referenceError(`${path}.channelId`, 'logical channel', value.channelId));
  else if (value.channelId === currentChannelId || !Array.isArray(feedbackChannel.capabilities) || !feedbackChannel.capabilities.includes('input'))
    errors.push({ path: `${path}.channelId`, code: 'invalid_feedback_channel', message: 'feedback must reference a distinct input channel' });
  if (!['match', 'inverse'].includes(value.expected as string))
    errors.push({ path: `${path}.expected`, code: 'unsupported_value', message: 'expected must be match or inverse' });
  if (!Number.isSafeInteger(value.timeoutMs) || (value.timeoutMs as number) <= 0)
    errors.push({ path: `${path}.timeoutMs`, code: 'invalid_timeout', message: 'timeoutMs must be a positive integer' });
  if (!capabilities.has('feedback'))
    errors.push({ path, code: 'unsupported_field', message: 'feedback requires feedback capability' });
}

function validateProfile(
  value: unknown,
  capabilities: Set<string>,
  path: string,
  errors: ConfigurationValidationError[],
): void {
  const required: Record<string, string[]> = {
    'metered-switched-load': ['output', 'measurement'],
    'pulsed-lock-bank': ['output', 'pulse'],
    'guarded-enable-request': ['output', 'guard'],
    'generic-digital-output': ['output'],
    'generic-monitored-input': ['input'],
  };
  required[value as string]
    ?.filter((capability) => !capabilities.has(capability))
    .forEach((capability) =>
      errors.push({
        path: `${path}.capabilities`,
        code: 'missing_capability',
        message: `${value} requires ${capability} capability`,
      }),
    );
}

function presetChannel(application: WagoPresetApplication): WagoConfigurationSnapshot['logicalChannels'][number] {
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

function referenceError(path: string, type: string, id: unknown): ConfigurationValidationError {
  return { path, code: 'missing_reference', message: `${type} ${String(id)} does not exist in this snapshot` };
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, sortValue(item)]),
  );
}
