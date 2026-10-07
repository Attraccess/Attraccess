import { ENGINEERING_UNITS } from '../../measurement-contract';
import { validateKeys } from './configuration.validate-keys';
import { type Snapshot, type ValidationError } from './runtime-types';

export function validateChannelMeasurements(
  channel: Snapshot['logicalChannels'][number],
  capabilities: Snapshot['logicalChannels'][number]['capabilities'],
  path: string,
  errors: ValidationError[],
): void {
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
      !ENGINEERING_UNITS.some((unit) => unit === channel.measurement?.unit) ||
      !Number.isFinite(channel.measurement.scale) ||
      !Number.isFinite(channel.measurement.offset) ||
      !['live', 'cumulative'].includes(channel.measurement.kind ?? 'live'))
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
}
