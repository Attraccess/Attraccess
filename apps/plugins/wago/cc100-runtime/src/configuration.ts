import { createHash } from 'node:crypto';

import { type Snapshot, type ValidationError } from './runtime-types';

export const PROTOCOL_VERSION = 1;

export function hash(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(sort(value)))
    .digest('hex');
}

export function validateDesired(value: unknown): ValidationError[] {
  if (!value || typeof value !== 'object') {
    return [{ path: '$', code: 'invalid_snapshot', message: 'desired configuration must be an object' }];
  }
  const desired = value as Record<string, unknown>;
  const errors: ValidationError[] = [];
  if (desired.protocolVersion !== PROTOCOL_VERSION) {
    errors.push({ path: 'protocolVersion', code: 'unsupported_version', message: 'protocolVersion must be 1' });
  }
  if (!Number.isSafeInteger(desired.revision) || (desired.revision as number) < 1) {
    errors.push({ path: 'revision', code: 'invalid_revision', message: 'revision must be a positive integer' });
  }
  if (typeof desired.contentHash !== 'string') {
    errors.push({ path: 'contentHash', code: 'invalid_hash', message: 'contentHash is required' });
  }
  errors.push(...validateSnapshot(desired.snapshot));
  return errors;
}

export function validateSnapshot(value: unknown): ValidationError[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return [{ path: 'snapshot', code: 'invalid_snapshot', message: 'snapshot must be an object' }];
  }
  const snapshot = value as Partial<Snapshot>;
  const errors: ValidationError[] = [];
  if (snapshot.version !== 1) {
    errors.push({ path: 'snapshot.version', code: 'unsupported_version', message: 'snapshot version must be 1' });
  }
  if (!Array.isArray(snapshot.physicalPoints) || !Array.isArray(snapshot.logicalChannels)) {
    return [
      ...errors,
      { path: 'snapshot', code: 'invalid_collection', message: 'physicalPoints and logicalChannels must be arrays' },
    ];
  }
  const pointIds = new Set<string>();
  snapshot.physicalPoints.forEach((point, index) => {
    if (!point?.id || pointIds.has(point.id)) {
      errors.push({
        path: `snapshot.physicalPoints[${index}].id`,
        code: 'invalid_id',
        message: 'physical point IDs must be unique',
      });
    }
    pointIds.add(point?.id);
    if (!['751-9301', '879-3000', '879-1300'].includes(point?.hardwareProfile ?? '')) {
      errors.push({
        path: `snapshot.physicalPoints[${index}].hardwareProfile`,
        code: 'unsupported_profile',
        message: 'unsupported hardware profile',
      });
    }
    if (!Number.isSafeInteger(point?.channel) || (point?.channel ?? -1) < 0) {
      errors.push({
        path: `snapshot.physicalPoints[${index}].channel`,
        code: 'invalid_channel',
        message: 'channel must be non-negative',
      });
    }
  });
  const channelIds = new Set<string>();
  const channelIdCounts = new Map<string, number>();
  snapshot.logicalChannels.forEach((channel) => {
    if (typeof channel?.id !== 'string') {
      return;
    }
    channelIds.add(channel.id);
    channelIdCounts.set(channel.id, (channelIdCounts.get(channel.id) ?? 0) + 1);
  });
  snapshot.logicalChannels.forEach((channel, index) => {
    const path = `snapshot.logicalChannels[${index}]`;
    if (!channel?.id || channelIdCounts.get(channel.id) !== 1) {
      errors.push({ path: `${path}.id`, code: 'invalid_id', message: 'logical channel IDs must be unique' });
    }
    if (!pointIds.has(channel?.physicalPointId ?? '')) {
      errors.push({
        path: `${path}.physicalPointId`,
        code: 'missing_reference',
        message: 'physical point does not exist',
      });
    }
    const capabilities = Array.isArray(channel?.capabilities) ? channel.capabilities : [];
    if (!capabilities.length) {
      errors.push({ path: `${path}.capabilities`, code: 'invalid_capabilities', message: 'capabilities are required' });
    }
    const policy = channel?.disconnectPolicy;
    if (
      !policy ||
      !['hold', 'immediate', 'watchdog'].includes(policy.mode) ||
      (policy.mode === 'watchdog' && (!Number.isSafeInteger(policy.timeoutMs) || (policy.timeoutMs ?? 0) <= 0))
    ) {
      errors.push({
        path: `${path}.disconnectPolicy`,
        code: 'invalid_disconnect_policy',
        message: 'every channel needs hold, immediate, or watchdog disconnect behavior',
      });
    }
    if (
      channel?.pulse &&
      (!capabilities.includes('pulse') ||
        !Number.isSafeInteger(channel.pulse.durationMs) ||
        channel.pulse.durationMs <= 0)
    ) {
      errors.push({
        path: `${path}.pulse`,
        code: 'invalid_pulse',
        message: 'pulse requires pulse capability and positive duration',
      });
    }
    if (channel?.guard && (!capabilities.includes('guard') || !channelIds.has(channel.guard.channelId))) {
      errors.push({
        path: `${path}.guard`,
        code: 'invalid_guard',
        message: 'guard requires guard capability and an existing channel',
      });
    }
  });
  return errors;
}

function sort(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sort);
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, sort(item)]),
  );
}
