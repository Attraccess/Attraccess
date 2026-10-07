import { CONFIGURATION_PROTOCOL_VERSION } from './protocol';
import { validateModbus, validateModbusBindings } from '../modbus/model';
import type { ConfigurationValidationError } from './configuration.contracts';
import { canonicalSnapshot } from './configuration.add-id.helpers';
import { exactKeys } from './configuration.add-id.helpers';
import { collection } from './configuration.add-id.helpers';
import { record } from './configuration.preset-channel.helpers';
import { addId } from './configuration.add-id.helpers';
import { enumValue } from './configuration.add-id.helpers';
import { HARDWARE_PROFILES } from './configuration.hardware-profiles';
import { referenceError } from './configuration.preset-channel.helpers';
import { CHANNEL_PROFILES } from './configuration.state';
import { capabilityList } from './configuration.add-id.helpers';
import { validateDisconnectPolicy } from './configuration.preset-channel.helpers';
import { validateRange } from './configuration.validate-pulse.helpers';
import { validatePulse } from './configuration.validate-pulse.helpers';
import { validateGuard } from './configuration.preset-channel.helpers';
import { validateFeedback } from './configuration.preset-channel.helpers';
import { validateMeasurement } from './configuration.preset-channel.helpers';

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
  exactKeys(value, '$', ['version', 'physicalPoints', 'logicalChannels', 'modbus'], errors, ['modbus']);
  if (value.modbus !== undefined) errors.push(...validateModbus(value.modbus));
  errors.push(...validateModbusBindings(value));
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
    exactKeys(point, path, ['id', 'hardwareProfile', 'channel', 'modbus'], errors, ['modbus']);
    addId(point.id, `${path}.id`, pointIds, errors);
    enumValue(point.hardwareProfile, `${path}.hardwareProfile`, HARDWARE_PROFILES, errors);
    if (typeof point.channel !== 'number' || !Number.isSafeInteger(point.channel) || point.channel < 0)
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
    if (typeof channel.physicalPointId !== 'string' || !pointIds.has(channel.physicalPointId))
      errors.push(referenceError(`${path}.physicalPointId`, 'physical point', channel.physicalPointId));
    enumValue(channel.profile, `${path}.profile`, CHANNEL_PROFILES, errors);
    const capabilities = capabilityList(channel.capabilities, `${path}.capabilities`, errors);
    if (channel.invert !== undefined && (typeof channel.invert !== 'boolean' || !capabilities.has('input')))
      errors.push({
        path: `${path}.invert`,
        code: 'invalid_invert',
        message: 'invert requires a boolean and an input channel',
      });
    validateDisconnectPolicy(channel.disconnectPolicy, `${path}.disconnectPolicy`, errors);
    validateRange(channel.range, `${path}.range`, capabilities, errors);
    validatePulse(channel.pulse, `${path}.pulse`, capabilities, errors);
    validateGuard(channel.guard, `${path}.guard`, capabilities, channelIds, errors);
    validateFeedback(channel.feedback, `${path}.feedback`, capabilities, channel.id, channelsById, errors);
    validateMeasurement(channel.measurement, `${path}.measurement`, capabilities, errors);
  });
  return errors;
}
