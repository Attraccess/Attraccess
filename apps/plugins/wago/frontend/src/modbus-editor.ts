import { findProfile, type ModbusConfiguration, type ModbusPoint } from '../../modbus/model';
import type { Channel, PhysicalPoint } from './configuration-model';
import type { WagoConfigurationSnapshot } from './api';

export const emptyModbus: ModbusConfiguration = { connections: [], devices: [], profiles: [] };

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
        next.disconnectPolicy = { mode: 'hold' };
        delete next.pulse;
        delete next.guard;
        delete next.feedback;
      }
      if (measurement) {
        next.capabilities.push('measurement');
        next.measurement = { unit: measurement.unit, kind: measurement.kind, scale: 1, offset: 0 };
      }
      next.capabilities = [
        ...channel.capabilities.filter((capability) => next.capabilities.includes(capability)),
        ...next.capabilities.filter((capability) => !channel.capabilities.includes(capability)),
      ];
      return next;
    }),
  };
}

export function addModbusChannel(snapshot: WagoConfigurationSnapshot, binding: ModbusPoint) {
  const point: PhysicalPoint = {
    id: `point-${crypto.randomUUID()}`,
    hardwareProfile: 'modbus',
    channel: 0,
    modbus: binding,
  };
  const channel: Channel = {
    id: `channel-${crypto.randomUUID()}`,
    physicalPointId: point.id,
    profile: 'generic-monitored-input',
    capabilities: ['input'],
    disconnectPolicy: { mode: 'hold' },
  };
  return {
    point,
    channel,
    snapshot: bindModbusPoint(
      {
        ...snapshot,
        physicalPoints: [...snapshot.physicalPoints, point],
        logicalChannels: [...snapshot.logicalChannels, channel],
      },
      point.id,
      binding,
    ),
  };
}

/** Editing a map's unit/kind updates dependent transforms without changing bindings or capabilities. */
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
        ? { ...channel, measurement: { unit: measurement.unit, kind: measurement.kind, scale: 1, offset: 0 } }
        : channel;
    }),
  };
}
