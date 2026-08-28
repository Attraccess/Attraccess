import { createHash } from 'node:crypto';

export const CONFIGURATION_PROTOCOL_VERSION = 1;

export interface WagoConfigurationSnapshot {
  physicalPoints?: Array<{ id: string; hardwareProfileId?: string }>;
  hardwareProfiles?: Array<{ id: string }>;
  logicalChannels?: Array<{
    id: string;
    physicalPointId?: string;
    hardwareProfileId?: string;
    capabilities?: string[];
    policy?: Record<string, unknown>;
  }>;
  localPolicies?: Array<{ id: string }>;
  [key: string]: unknown;
}

export interface ConfigurationValidationError {
  path: string;
  code: string;
  message: string;
}

export function canonicalSnapshot(snapshot: unknown): string {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot))
    throw new Error('configuration snapshot must be an object');
  return JSON.stringify(sortValue(snapshot));
}

export function configurationHash(snapshot: unknown): string {
  return createHash('sha256').update(canonicalSnapshot(snapshot)).digest('hex');
}

export function validateSnapshot(snapshot: unknown): ConfigurationValidationError[] {
  let value: WagoConfigurationSnapshot;
  try {
    value = JSON.parse(canonicalSnapshot(snapshot)) as WagoConfigurationSnapshot;
  } catch (error) {
    return [{ path: '$', code: 'invalid_snapshot', message: error instanceof Error ? error.message : 'invalid snapshot' }];
  }
  const errors: ConfigurationValidationError[] = [];
  const physicalPoints = validateCollection(value.physicalPoints, 'physicalPoints', errors);
  const hardwareProfiles = validateCollection(value.hardwareProfiles, 'hardwareProfiles', errors);
  const logicalChannels = Array.isArray(value.logicalChannels) ? value.logicalChannels : [];
  validateCollection(value.logicalChannels, 'logicalChannels', errors);
  validateCollection(value.localPolicies, 'localPolicies', errors);

  logicalChannels.forEach((channel, index) => {
    if (!channel || typeof channel !== 'object') return;
    if (channel.physicalPointId && !physicalPoints.has(channel.physicalPointId))
      errors.push(referenceError(`logicalChannels[${index}].physicalPointId`, 'physical point', channel.physicalPointId));
    if (channel.hardwareProfileId && !hardwareProfiles.has(channel.hardwareProfileId))
      errors.push(referenceError(`logicalChannels[${index}].hardwareProfileId`, 'hardware profile', channel.hardwareProfileId));
    if (channel.capabilities && (!Array.isArray(channel.capabilities) || channel.capabilities.some((item) => typeof item !== 'string' || !item)))
      errors.push({ path: `logicalChannels[${index}].capabilities`, code: 'invalid_capabilities', message: 'capabilities must be non-empty strings' });
    if (channel.policy !== undefined && (!channel.policy || typeof channel.policy !== 'object' || Array.isArray(channel.policy)))
      errors.push({ path: `logicalChannels[${index}].policy`, code: 'invalid_policy', message: 'policy must be an object' });
  });
  return errors;
}

function validateCollection<T extends { id: string }>(
  value: T[] | undefined,
  name: string,
  errors: ConfigurationValidationError[],
): Set<string> {
  if (value === undefined) return new Set();
  if (!Array.isArray(value)) {
    errors.push({ path: name, code: 'invalid_collection', message: `${name} must be an array` });
    return new Set();
  }
  const ids = new Set<string>();
  value.forEach((item, index) => {
    if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !item.id.trim()) {
      errors.push({ path: `${name}[${index}].id`, code: 'invalid_id', message: 'id must be a non-empty string' });
      return;
    }
    if (ids.has(item.id)) errors.push({ path: `${name}[${index}].id`, code: 'duplicate_id', message: `duplicate id ${item.id}` });
    ids.add(item.id);
  });
  return ids;
}

function referenceError(path: string, type: string, id: string): ConfigurationValidationError {
  return { path, code: 'missing_reference', message: `${type} ${id} does not exist in this snapshot` };
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, sortValue(item)]));
}
