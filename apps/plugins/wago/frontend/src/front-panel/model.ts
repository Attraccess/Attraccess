// Maps physical terminals and devices into editable controller configuration snapshots.
// FEATURE: WAGO front panel configuration preserves applied channel routing identities.
import { DIGITAL_TERMINALS } from '../../../backend/configuration-digital';
import { CC100_SERIAL_PATH } from '../../../shared/hardware-profile';
import {
  BUILTIN_MODBUS_PROFILES,
  findProfile,
  type ModbusConnection,
  type ModbusDevice,
  type ModbusProfile,
} from '../../../modbus/model';
import type { ConfigurationEditorMetadata, WagoConfigurationSnapshot } from '../api';
import { randomUUID } from '../configuration-id';
import { addModbusChannel, emptyModbus, updateModbusConfiguration } from '../modbus-editor';

export interface PanelConfiguration {
  snapshot: WagoConfigurationSnapshot;
  metadata: ConfigurationEditorMetadata;
}
export type Terminal = (typeof DIGITAL_TERMINALS)[number];
export type Channel = WagoConfigurationSnapshot['logicalChannels'][number];

export const DEFAULT_BUS: ModbusConnection = {
  id: 'cc100-rs485',
  transport: 'rtu',
  path: CC100_SERIAL_PATH,
  baudRate: 9600,
  parity: 'even',
  stopBits: 1,
  timeoutMs: 1000,
  reconnectMs: 1000,
  queueLimit: 100,
};

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

export function updateTerminal(
  configuration: PanelConfiguration,
  terminal: Terminal,
  name: string,
  settings: Partial<Channel>,
): PanelConfiguration {
  const { snapshot, metadata } = configuration;
  const existing = terminalChannel(snapshot, terminal);
  if (!name.trim()) {
    if (!existing) return configuration;
    const names = { ...metadata.names };
    delete names[existing.id];
    delete names[existing.physicalPointId];
    return {
      snapshot: {
        ...snapshot,
        logicalChannels: snapshot.logicalChannels.filter((channel) => channel.id !== existing.id),
        physicalPoints: snapshot.physicalPoints.filter((point) => point.id !== existing.physicalPointId),
      },
      metadata: { ...metadata, names },
    };
  }
  const point = { id: `point-${randomUUID()}`, hardwareProfile: '751-9301' as const, channel: terminal.channel };
  const channel: Channel = {
    ...(existing ?? {
      id: `channel-${randomUUID()}`,
      physicalPointId: point.id,
      profile: terminal.direction === 'output' ? 'generic-digital-output' : 'generic-monitored-input',
      capabilities: [terminal.direction],
      disconnectPolicy: { mode: terminal.direction === 'output' ? 'immediate' : 'hold' },
    }),
    ...settings,
  };
  if (!channel.capabilities.includes('pulse')) delete channel.pulse;
  return {
    snapshot: {
      ...snapshot,
      physicalPoints: existing ? snapshot.physicalPoints : [...snapshot.physicalPoints, point],
      logicalChannels: existing
        ? snapshot.logicalChannels.map((item) => (item.id === existing.id ? channel : item))
        : [...snapshot.logicalChannels, channel],
    },
    metadata: { ...metadata, names: { ...metadata.names, [channel.id]: name.trim() } },
  };
}

export function busConnection(snapshot: WagoConfigurationSnapshot) {
  return snapshot.modbus?.connections.find((connection) => connection.transport === 'rtu') ?? DEFAULT_BUS;
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
  const valid = (point: WagoConfigurationSnapshot['physicalPoints'][number]) => {
    if (point.modbus?.deviceId !== device.id) return true;
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
  for (const [kind, registers] of [
    ['measurementId', profile.measurements],
    ['actionId', profile.actions],
  ] as const) {
    for (const register of registers) {
      const point = snapshot.physicalPoints.find(
        (point) => point.modbus?.deviceId === device.id && point.modbus[kind] === register.id,
      );
      if (point) continue;
      const added = addModbusChannel(snapshot, { deviceId: device.id, [kind]: register.id });
      snapshot = added.snapshot;
      names[added.channel.id] = `${device.name} · ${register.name}`.slice(0, 120);
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
