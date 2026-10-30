import { randomUUID } from '../identity';
import { findProfile, type ModbusConfiguration, type ModbusPoint } from '../../../../modbus/model';
import { canDisableChannel as canDisableModbusChannel } from '../../../../modbus/channel-enabled';
import { WAGO_879_3020_DEFAULT_ENABLED } from '../../../../modbus/wago-879-3020';
import type { Channel, PhysicalPoint } from '../model';
import type { WagoConfigurationSnapshot } from '../../api/client';

export const emptyModbus: ModbusConfiguration = { connections: [], devices: [], profiles: [] };

const RECOMMENDED_READINGS: Record<string, ReadonlySet<string>> = {
  'wago-879-3020': new Set(WAGO_879_3020_DEFAULT_ENABLED),
};

/**
 * Measurement IDs a new meter of this built-in profile enables; every other register is added disabled.
 * Undefined for profiles without a recommended set, including custom copies: they enable every register.
 */
export function recommendedReadings(profileId: string | undefined): ReadonlySet<string> | undefined {
  return profileId && Object.hasOwn(RECOMMENDED_READINGS, profileId) ? RECOMMENDED_READINGS[profileId] : undefined;
}

/** The rule the server applies (`modbus/channel-enabled`): only a Modbus measurement channel without an action. */
export function canDisableChannel(channel: Pick<Channel, 'capabilities'>, point: PhysicalPoint | undefined): boolean {
  return canDisableModbusChannel(channel.capabilities, point);
}

/** Store `enabled: false` on disabled channels and omit the field otherwise; `true` is never stored. */
export function withEnabled<T extends { enabled?: false }>(channel: T, enabled: boolean): T {
  const next = { ...channel };
  if (enabled) delete next.enabled;
  else next.enabled = false;
  return next;
}

export function boundMeasurement(configuration: ModbusConfiguration, binding?: ModbusPoint) {
  const device = configuration.devices.find((item) => item.id === binding?.deviceId);
  return device && findProfile(configuration, device)?.measurements.find((item) => item.id === binding?.measurementId);
}

/** Rebinding preserves logical/physical identities; the profile owns engineering transforms. */
export function bindModbusPoint(snapshot: WagoConfigurationSnapshot, pointId: string, binding: ModbusPoint) {
  const measurement = boundMeasurement(snapshot.modbus ?? emptyModbus, binding);
  return {
    ...snapshot,
    physicalPoints: snapshot.physicalPoints.map((point) =>
      point.id === pointId ? { ...point, modbus: binding } : point,
    ),
    logicalChannels: snapshot.logicalChannels.map((channel): Channel => {
      if (channel.physicalPointId !== pointId) return channel;
      const next = {
        ...channel,
        capabilities: channel.capabilities.filter((c) => !['input', 'output', 'measurement'].includes(c)),
      };
      delete next.measurement;
      // A temporary missing action must not silently discard an output's pulse/guard policies.
      if (binding.actionId || channel.capabilities.includes('output')) {
        next.capabilities.push('output');
        next.profile = measurement
          ? 'metered-switched-load'
          : channel.profile === 'generic-monitored-input' || channel.profile === 'metered-switched-load'
            ? 'generic-digital-output'
            : channel.profile;
        if (!channel.capabilities.includes('output')) next.disconnectPolicy = { mode: 'immediate' };
      } else {
        next.profile = 'generic-monitored-input';
        next.capabilities = ['input'];
        delete next.pulse;
        delete next.guard;
        delete next.feedback;
      }
      if (measurement) {
        next.capabilities.push('measurement');
        next.measurement = { unit: measurement.unit, kind: measurement.kind, scale: 1, offset: 0 };
      }
      if (!next.capabilities.includes('input') && !next.capabilities.includes('measurement')) delete next.range;
      next.capabilities = [
        ...channel.capabilities.filter((capability) => next.capabilities.includes(capability)),
        ...next.capabilities.filter((capability) => !channel.capabilities.includes(capability)),
      ];
      // A channel rebound to an action or away from a measurement can no longer be disabled.
      if (
        !canDisableChannel(next, { id: pointId, hardwareProfile: 'modbus', channel: 0, modbus: binding }) ||
        !measurement
      )
        delete next.enabled;
      return next;
    }),
  };
}

/** Adds a point and channel for the binding; `enabled: false` only applies to a measurement without an action. */
export function addModbusChannel(
  snapshot: WagoConfigurationSnapshot,
  binding: ModbusPoint,
  { enabled = true }: { enabled?: boolean } = {},
) {
  const point: PhysicalPoint = {
    id: `point-${randomUUID()}`,
    hardwareProfile: 'modbus',
    channel: 0,
    modbus: binding,
  };
  const channel: Channel = {
    id: `channel-${randomUUID()}`,
    physicalPointId: point.id,
    profile: 'generic-monitored-input',
    capabilities: ['input'],
    disconnectPolicy: { mode: 'hold' },
  };
  const bound = bindModbusPoint(
    {
      ...snapshot,
      physicalPoints: [...snapshot.physicalPoints, point],
      logicalChannels: [...snapshot.logicalChannels, channel],
    },
    point.id,
    binding,
  );
  const last = bound.logicalChannels.length - 1;
  const added = bound.logicalChannels[last];
  if (!enabled && canDisableChannel(added, point))
    bound.logicalChannels = [...bound.logicalChannels.slice(0, last), withEnabled(added, false)];
  return { point, channel: bound.logicalChannels[last], snapshot: bound };
}

/** Enables or disables the given channels, leaving channels that cannot be disabled enabled. */
export function setChannelsEnabled(
  snapshot: WagoConfigurationSnapshot,
  channelIds: ReadonlySet<string>,
  enabled: boolean,
): WagoConfigurationSnapshot {
  const points = new Map(snapshot.physicalPoints.map((point) => [point.id, point] as const));
  return {
    ...snapshot,
    logicalChannels: snapshot.logicalChannels.map((channel) =>
      !channelIds.has(channel.id) || (channel.enabled !== false) === enabled
        ? channel
        : withEnabled(channel, enabled || !canDisableChannel(channel, points.get(channel.physicalPointId))),
    ),
  };
}

/** Synchronize a map's unit/kind without discarding existing channel calibration. */
export function updateModbusConfiguration(
  snapshot: WagoConfigurationSnapshot,
  modbus: ModbusConfiguration,
): WagoConfigurationSnapshot {
  return {
    ...snapshot,
    modbus,
    logicalChannels: snapshot.logicalChannels.map((channel) => {
      const point = snapshot.physicalPoints.find((item) => item.id === channel.physicalPointId);
      const measurement = boundMeasurement(modbus, point?.modbus);
      return measurement && channel.capabilities.includes('measurement')
        ? {
            ...channel,
            measurement: {
              unit: measurement.unit,
              kind: measurement.kind,
              scale: channel.measurement?.scale ?? 1,
              offset: channel.measurement?.offset ?? 0,
            },
          }
        : channel;
    }),
  };
}
