// eslint-disable-next-line @nx/enforce-module-boundaries
import { validateModbus, validateModbusBindings } from '../../modbus/model';
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
  validateKeys(
    snapshot as Record<string, unknown>,
    'snapshot',
    ['version', 'physicalPoints', 'logicalChannels', 'modbus'],
    errors,
  );
  if (snapshot.modbus !== undefined) {
    errors.push(...validateModbus(snapshot.modbus));
  }
  errors.push(...validateModbusBindings(snapshot));
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
    if (!point || typeof point !== 'object' || Array.isArray(point)) {
      errors.push({
        path: `snapshot.physicalPoints[${index}]`,
        code: 'invalid_object',
        message: 'physical point must be an object',
      });
      return;
    }
    validateKeys(
      point as Record<string, unknown>,
      `snapshot.physicalPoints[${index}]`,
      ['id', 'hardwareProfile', 'channel', 'modbus'],
      errors,
    );
    if (!point?.id || pointIds.has(point.id)) {
      errors.push({
        path: `snapshot.physicalPoints[${index}].id`,
        code: 'invalid_id',
        message: 'physical point IDs must be unique',
      });
    }
    pointIds.add(point?.id);
    if (!['751-9301', '879-3000', '879-1300', 'modbus'].includes(point?.hardwareProfile ?? '')) {
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
  const channelsById = new Map<string, Snapshot['logicalChannels'][number]>();
  const channelIdCounts = new Map<string, number>();
  snapshot.logicalChannels.forEach((channel) => {
    if (typeof channel?.id !== 'string') {
      return;
    }
    channelsById.set(channel.id, channel);
    channelIdCounts.set(channel.id, (channelIdCounts.get(channel.id) ?? 0) + 1);
  });
  snapshot.logicalChannels.forEach((channel, index) => {
    const path = `snapshot.logicalChannels[${index}]`;
    if (!channel || typeof channel !== 'object' || Array.isArray(channel)) {
      errors.push({ path, code: 'invalid_object', message: 'logical channel must be an object' });
      return;
    }
    validateKeys(
      channel as Record<string, unknown>,
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
    if (
      capabilities.some(
        (capability, capabilityIndex) =>
          !['output', 'input', 'measurement', 'pulse', 'guard', 'feedback'].includes(capability) ||
          capabilities.indexOf(capability) !== capabilityIndex,
      )
    ) {
      errors.push({
        path: `${path}.capabilities`,
        code: 'invalid_capabilities',
        message: 'capabilities must be unique supported values',
      });
    }
    if (typeof channel.profile !== 'string' || !channel.profile.trim()) {
      errors.push({
        path: `${path}.profile`,
        code: 'invalid_profile',
        message: 'logical channel profile must be a non-empty string',
      });
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
    if (channel.pulse) {
      validateKeys(channel.pulse as Record<string, unknown>, `${path}.pulse`, ['durationMs'], errors);
    }
    const guardChannel = channel.guard ? channelsById.get(channel.guard.channelId) : undefined;
    if (
      channel?.guard &&
      (!capabilities.includes('guard') ||
        !Array.isArray(guardChannel?.capabilities) ||
        !guardChannel.capabilities.includes('input') ||
        !['on', 'off'].includes(channel.guard.when) ||
        guardChannel.id === channel.id)
    ) {
      errors.push({
        path: `${path}.guard`,
        code: 'invalid_guard',
        message: 'guard requires guard capability, another input channel, and on/off condition',
      });
    }
    if (channel.guard) {
      validateKeys(channel.guard as Record<string, unknown>, `${path}.guard`, ['channelId', 'when'], errors);
    }
    const feedbackChannel = channel.feedback ? channelsById.get(channel.feedback.channelId) : undefined;
    if (
      channel.feedback &&
      (!capabilities.includes('feedback') ||
        !feedbackChannel ||
        feedbackChannel.id === channel.id ||
        !Array.isArray(feedbackChannel.capabilities) ||
        !feedbackChannel.capabilities.includes('input') ||
        !['match', 'inverse'].includes(channel.feedback.expected) ||
        !Number.isSafeInteger(channel.feedback.timeoutMs) ||
        channel.feedback.timeoutMs <= 0)
    ) {
      errors.push({
        path: `${path}.feedback`,
        code: 'invalid_feedback',
        message: 'feedback requires feedback capability, a channel, expectation, and positive timeout',
      });
    }
    if (channel.feedback) {
      validateKeys(
        channel.feedback as Record<string, unknown>,
        `${path}.feedback`,
        ['channelId', 'expected', 'timeoutMs'],
        errors,
      );
    }
    if (
      channel.range &&
      (!['input', 'measurement'].some((capability) => capabilities.includes(capability)) ||
        !Number.isFinite(channel.range.minimum) ||
        !Number.isFinite(channel.range.maximum) ||
        channel.range.minimum >= channel.range.maximum)
    ) {
      errors.push({
        path: `${path}.range`,
        code: 'invalid_range',
        message: 'range requires input or measurement capability and finite ordered values',
      });
    }
    if (channel.range) {
      validateKeys(channel.range as Record<string, unknown>, `${path}.range`, ['minimum', 'maximum'], errors);
    }
    if (
      channel.measurement &&
      (!capabilities.includes('measurement') ||
        !['ampere', 'volt', 'watt', 'watt-hour', 'percent'].includes(channel.measurement.unit) ||
        !Number.isFinite(channel.measurement.scale) ||
        !Number.isFinite(channel.measurement.offset) ||
        (channel.measurement.kind !== undefined && !['live', 'cumulative'].includes(channel.measurement.kind)))
    ) {
      errors.push({
        path: `${path}.measurement`,
        code: 'invalid_measurement',
        message: 'measurement requires capability, supported unit, and finite transform',
      });
    }
    if (channel.measurement) {
      validateKeys(
        channel.measurement as Record<string, unknown>,
        `${path}.measurement`,
        ['unit', 'scale', 'offset', 'kind'],
        errors,
      );
    }
  });
  return errors;
}

function validateKeys(
  value: Record<string, unknown>,
  path: string,
  allowed: string[],
  errors: ValidationError[],
): void {
  Object.keys(value)
    .filter((key) => !allowed.includes(key))
    .forEach((key) =>
      errors.push({
        path: `${path}.${key}`,
        code: 'unknown_field',
        message: 'field is not supported by configuration version 1',
      }),
    );
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
