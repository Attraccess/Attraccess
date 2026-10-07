import { validateModbus, validateModbusBindings } from '../../modbus/model';
import { validateChannelInterlocks } from './configuration.validate-channel-interlocks';
import { validateChannelMeasurements } from './configuration.validate-channel-measurements';
import { validateDisconnectAndPulse } from './configuration.validate-disconnect-and-pulse';
import { validateKeys } from './configuration.validate-keys';
import { type Snapshot, type ValidationError } from './runtime-types';

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
  if (snapshot.modbus !== undefined) errors.push(...validateModbus(snapshot.modbus));
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
        'invert',
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
    if (channel.invert !== undefined && (typeof channel.invert !== 'boolean' || !capabilities.includes('input')))
      errors.push({
        path: `${path}.invert`,
        code: 'invalid_invert',
        message: 'invert requires a boolean and an input channel',
      });
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
    validateDisconnectAndPulse(channel, capabilities, path, errors);
    validateChannelInterlocks(channel, capabilities, path, errors, channelsById);
    validateChannelMeasurements(channel, capabilities, path, errors);
  });
  return errors;
}
