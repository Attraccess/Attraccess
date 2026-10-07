import { BUILTIN_MODBUS_PROFILES } from '../../../modbus/model';
import { findProfile } from '../../../modbus/model';
import type { ModbusConnection } from '../../../modbus/model';
import type { ModbusDevice } from '../../../modbus/model';
import type { ModbusProfile } from '../../../modbus/model';
import type { WagoConfigurationSnapshot } from '../api';
import { addModbusChannel } from '../modbus-editor';
import { emptyModbus } from '../modbus-editor';
import { updateModbusConfiguration } from '../modbus-editor';
import type { PanelConfiguration } from './model.contracts';
import type { Terminal } from './model.contracts';

export function saveDevice(
  configuration: PanelConfiguration,
  device: ModbusDevice,
  connection: ModbusConnection,
  profile: ModbusProfile,
): PanelConfiguration {
  const previous = configuration.snapshot.modbus ?? emptyModbus;
  const custom = !BUILTIN_MODBUS_PROFILES.some((item) => item.id === profile.id);
  const modbus = {
    ...previous,
    devices: [
      ...previous.devices.filter((item) => item.id !== device.id),
      { ...device, profileId: profile.id, profileVersion: profile.version },
    ],
    connections: [...previous.connections.filter((item) => item.id !== connection.id), connection],
    profiles: custom
      ? [...previous.profiles.filter((item) => item.id !== profile.id || item.version !== profile.version), profile]
      : previous.profiles,
  };
  let snapshot = updateModbusConfiguration(configuration.snapshot, modbus);
  const affectedDevices = modbus.devices.filter(
    (item) => item.profileId === profile.id && item.profileVersion === profile.version,
  );
  const affectedIds = new Set(affectedDevices.map((item) => item.id));
  const valid = (point: WagoConfigurationSnapshot['physicalPoints'][number]) => {
    if (!point.modbus || !affectedIds.has(point.modbus.deviceId)) return true;
    return (
      (!point.modbus.measurementId || profile.measurements.some((item) => item.id === point.modbus?.measurementId)) &&
      (!point.modbus.actionId || profile.actions.some((item) => item.id === point.modbus?.actionId))
    );
  };
  const removed = new Set(snapshot.physicalPoints.filter((point) => !valid(point)).map((point) => point.id));
  snapshot = {
    ...snapshot,
    physicalPoints: snapshot.physicalPoints.filter(valid),
    logicalChannels: snapshot.logicalChannels.filter((channel) => !removed.has(channel.physicalPointId)),
  };
  const names = { ...configuration.metadata.names };
  for (const affectedDevice of affectedDevices) {
    for (const [kind, registers] of [
      ['measurementId', profile.measurements],
      ['actionId', profile.actions],
    ] as const) {
      for (const register of registers) {
        const point = snapshot.physicalPoints.find(
          (point) => point.modbus?.deviceId === affectedDevice.id && point.modbus[kind] === register.id,
        );
        if (point) {
          const previousDevice = previous.devices.find((item) => item.id === affectedDevice.id);
          const previousProfile = previousDevice && findProfile(previous, previousDevice);
          const previousRegister =
            kind === 'measurementId'
              ? previousProfile?.measurements.find((item) => item.id === register.id)
              : previousProfile?.actions.find((item) => item.id === register.id);
          const channel = snapshot.logicalChannels.find((item) => item.physicalPointId === point.id);
          // Refresh generated labels, including the provisional name of a newly added device.
          // Explicit operator labels remain user data and must survive device/profile edits.
          if (
            channel &&
            previousDevice &&
            previousRegister &&
            names[channel.id] === `${previousDevice.name} · ${previousRegister.name}`.slice(0, 120)
          ) {
            names[channel.id] = `${affectedDevice.name} · ${register.name}`.slice(0, 120);
          }
          continue;
        }
        const added = addModbusChannel(snapshot, { deviceId: affectedDevice.id, [kind]: register.id });
        snapshot = added.snapshot;
        names[added.channel.id] = `${affectedDevice.name} · ${register.name}`.slice(0, 120);
      }
    }
  }
  const used = new Set(snapshot.modbus?.devices.map((device) => device.connectionId));
  if (snapshot.modbus)
    snapshot.modbus = {
      ...snapshot.modbus,
      connections: snapshot.modbus.connections.filter((item) => item.transport === 'rtu' || used.has(item.id)),
    };
  return { snapshot, metadata: { ...configuration.metadata, names } };
}

export function terminalChannel(snapshot: WagoConfigurationSnapshot, terminal: Terminal) {
  const point = snapshot.physicalPoints.find(
    (point) => point.hardwareProfile === '751-9301' && point.channel === terminal.channel,
  );
  return snapshot.logicalChannels.find((channel) => channel.physicalPointId === point?.id);
}

export function terminalName(configuration: PanelConfiguration, terminal: Terminal) {
  const channel = terminalChannel(configuration.snapshot, terminal);
  return channel ? (configuration.metadata.names[channel.id] ?? channel.id) : '';
}

export function updateBus(configuration: PanelConfiguration, bus: ModbusConnection): PanelConfiguration {
  const modbus = configuration.snapshot.modbus ?? emptyModbus;
  return {
    ...configuration,
    snapshot: {
      ...configuration.snapshot,
      modbus: {
        ...modbus,
        connections: modbus.connections.some((connection) => connection.id === bus.id)
          ? modbus.connections.map((connection) =>
              connection.transport === 'rtu' && bus.transport === 'rtu' && connection.path === bus.path
                ? { ...bus, id: connection.id }
                : connection,
            )
          : [...modbus.connections, bus],
      },
    },
  };
}
