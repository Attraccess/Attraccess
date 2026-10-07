import type { ConfigurationValidationError } from './configuration.contracts';
import type { WagoConfigurationSnapshot } from './configuration.contracts';
import type { WagoPresetApplication } from './configuration.contracts';
import { WAGO_PRESETS } from './configuration.state';
import { presetChannel } from './configuration.preset-channel.helpers';
import { sortValue } from './configuration.preset-channel.helpers';
import { CAPABILITIES } from './configuration.state';
import { createHash } from 'node:crypto';
import type { ConfigurationDiff } from './configuration.configuration-diff';
import type { WagoConfigurationReport } from './configuration.contracts';

export function addId(value: unknown, path: string, ids: Set<string>, errors: ConfigurationValidationError[]): void {
  if (typeof value !== 'string' || !value.trim()) {
    errors.push({ path, code: 'invalid_id', message: 'id must be a non-empty string' });
    return;
  }
  if (ids.has(value)) errors.push({ path, code: 'duplicate_id', message: `duplicate id ${value}` });
  ids.add(value);
}

export function applyPreset(
  snapshot: WagoConfigurationSnapshot,
  application: WagoPresetApplication,
): WagoConfigurationSnapshot {
  const preset = application && WAGO_PRESETS.find((item) => item.id === application.presetId);
  if (!preset) throw new Error('unknown WAGO preset');
  const channel = presetChannel(application);
  const existingIndex = snapshot.logicalChannels.findIndex((item) => item.id === application.channelId);
  const logicalChannels = [...snapshot.logicalChannels];
  if (existingIndex === -1) logicalChannels.push(channel);
  else logicalChannels[existingIndex] = channel;
  return { ...snapshot, logicalChannels };
}

export function canonicalSnapshot(snapshot: unknown): string {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot))
    throw new Error('configuration snapshot must be an object');
  return JSON.stringify(sortValue(snapshot));
}

export function capabilityList(value: unknown, path: string, errors: ConfigurationValidationError[]): Set<string> {
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

export function collection(value: unknown, path: string, errors: ConfigurationValidationError[]): unknown[] {
  if (!Array.isArray(value)) {
    errors.push({ path, code: 'invalid_collection', message: `${path} must be an array` });
    return [];
  }
  return value;
}

export function configurationHash(snapshot: unknown): string {
  return createHash('sha256').update(canonicalSnapshot(snapshot)).digest('hex');
}
export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function diffValue(path: string, previous: unknown, current: unknown, changes: ConfigurationDiff[]): void {
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

export function enumValue(
  value: unknown,
  path: string,
  options: readonly string[],
  errors: ConfigurationValidationError[],
): void {
  if (!options.includes(value as string))
    errors.push({ path, code: 'unsupported_value', message: `must be one of: ${options.join(', ')}` });
}

export function exactKeys(
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
    .filter(
      (key) =>
        !['range', 'pulse', 'guard', 'feedback', 'measurement', 'invert', ...optional].includes(key) && !(key in value),
    )
    .forEach((key) =>
      errors.push({
        path: path === '$' ? key : `${path}.${key}`,
        code: 'required_field',
        message: 'field is required',
      }),
    );
}

export function isConfigurationValidationError(value: unknown): value is ConfigurationValidationError {
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
  if (!Array.isArray(errors) || !errors.every(isConfigurationValidationError)) return null;
  return { revision: report.revision as number, contentHash: report.contentHash, errors };
}
