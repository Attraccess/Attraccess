import { BUILTIN_MODBUS_PROFILES } from '../../../modbus/model';
import type { ModbusDevice } from '../../../modbus/model';
import { randomUUID } from '../configuration-id';
import { emptyModbus } from '../modbus-editor';
import type { PanelConfiguration } from './model.contracts';
import { saveDevice } from './model.save-device.helpers';
import { updateBus } from './model.save-device.helpers';
import type { WagoConfigurationSnapshot } from '../api';
import { DEFAULT_BUS } from './model.default-bus';
import { findProfile } from '../../../modbus/model';

export function busConnection(snapshot: WagoConfigurationSnapshot) {
  return snapshot.modbus?.connections.find((connection) => connection.transport === 'rtu') ?? DEFAULT_BUS;
}

export function addDevice(
  configuration: PanelConfiguration,
  name: string,
): { configuration: PanelConfiguration; id: string } {
  const profile = BUILTIN_MODBUS_PROFILES[0];
  const bus = busConnection(configuration.snapshot);
  const modbus = configuration.snapshot.modbus ?? emptyModbus;
  const used = new Set(
    modbus.devices.filter((device) => device.connectionId === bus.id).map((device) => device.unitId),
  );
  const unitId = Array.from({ length: 247 }, (_, i) => i + 1).find((id) => !used.has(id)) ?? 1;
  const device: ModbusDevice = {
    id: `device-${randomUUID()}`,
    name,
    connectionId: bus.id,
    unitId,
    profileId: profile.id,
    profileVersion: profile.version,
    pollIntervalMs: 5000,
  };
  return { configuration: saveDevice(updateBus(configuration, bus), device, bus, profile), id: device.id };
}

export function deviceProfile(configuration: PanelConfiguration, device: ModbusDevice) {
  return findProfile(configuration.snapshot.modbus ?? emptyModbus, device);
}

export function registerChannel(
  snapshot: WagoConfigurationSnapshot,
  deviceId: string,
  registerId: string,
  kind: 'measurementId' | 'actionId',
) {
  const point = snapshot.physicalPoints.find(
    (point) => point.modbus?.deviceId === deviceId && point.modbus[kind] === registerId,
  );
  return snapshot.logicalChannels.find((channel) => channel.physicalPointId === point?.id);
}

export function removeDevice(configuration: PanelConfiguration, deviceId: string): PanelConfiguration {
  const modbus = configuration.snapshot.modbus ?? emptyModbus;
  const points = new Set(
    configuration.snapshot.physicalPoints
      .filter((point) => point.modbus?.deviceId === deviceId)
      .map((point) => point.id),
  );
  const devices = modbus.devices.filter((device) => device.id !== deviceId);
  return {
    ...configuration,
    snapshot: {
      ...configuration.snapshot,
      physicalPoints: configuration.snapshot.physicalPoints.filter((point) => !points.has(point.id)),
      logicalChannels: configuration.snapshot.logicalChannels.filter((channel) => !points.has(channel.physicalPointId)),
      modbus: {
        ...modbus,
        devices,
        connections: modbus.connections.filter(
          (connection) =>
            connection.transport === 'rtu' || devices.some((device) => device.connectionId === connection.id),
        ),
      },
    },
  };
}
